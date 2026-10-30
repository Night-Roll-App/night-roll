#!/bin/zsh
# bridge/stems/install.sh — the stems engine (Demucs + Basic Pitch) in a python venv under the bridge's state dir.
# Run once by hand on the Mac; the bridge finds <state>/stems/venv/bin/python on its own (BRIDGE_STEMS_PY overrides).
#
#   bridge/stems/install.sh            install or repair, then a selftest through the real engine
#   bridge/stems/install.sh --check    print versions + model presence; exit 1 with the one-line fix otherwise
#
# Python: brew's python@3.10. basic-pitch 0.4.0 pulls tensorflow-macos (no 3.12/3.13 wheels) only when
# python_version > "3.11", so 3.10 (and 3.11) install clean with coremltools alone. resampy 0.4.2 imports
# pkg_resources, which setuptools >= 81 dropped — the venv pins setuptools < 81.
# CPU: pip runs under taskpolicy -b (I/O-bound, fine there); the selftest under -c utility like every job (-b crawls, docs/stems.md).
set -eu
STATE="${BRIDGE_STATE_DIR:-$HOME/.night-roll-bridge}"
STEMS="$STATE/stems"
VENV="$STEMS/venv"
PY="$VENV/bin/python"
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../py/nr_stems.py"
BREW_PY="${BRIDGE_STEMS_PYTHON:-/opt/homebrew/opt/python@3.10/bin/python3.10}"
DEMUCS_VER="4.1.0"; BP_VER="0.4.0"
free_gb() { df -g / | awk 'NR==2 {print $4}'; }

check() {
  local ok=1
  if [ ! -x "$PY" ]; then echo "stems: no venv at $VENV — run bridge/stems/install.sh"; return 1; fi
  "$PY" - <<'EOF' || ok=0
import importlib, sys
import importlib.metadata as md
want = {"demucs": "4.1.0", "basic-pitch": "0.4.0"}
print("python", sys.version.split()[0], sys.executable)
bad = []
for dist, ver in want.items():
    try:
        importlib.import_module(dist.replace("-", "_")); v = md.version(dist)
    except Exception as e:  # noqa: BLE001
        bad.append(f"{dist}: {e}"); continue
    print(dist, v + ("" if v == ver else f" (plan says {ver})"))
import torch; print("torch", torch.__version__, "mps" if torch.backends.mps.is_available() else "no mps")
for p in ("coremltools", "librosa", "pretty_midi", "soundfile", "setuptools"): print(p, md.version(p))
from pathlib import Path
hub = Path.home() / ".cache" / "huggingface" / "hub"
models = sorted(p.name for p in hub.glob("models--*") if "demucs" in p.name.lower()) if hub.exists() else []
print("models:", ", ".join(models) or "NONE")
if not models: bad.append("no demucs weights in ~/.cache/huggingface/hub")
if bad:
    print("\n".join("PROBLEM " + b for b in bad)); sys.exit(1)
EOF
  command -v ffmpeg >/dev/null || { echo "stems: ffmpeg not on PATH (brew install ffmpeg) — mp3/m4a inputs need it"; ok=0; }
  [ -f "$SCRIPT" ] || { echo "stems: $SCRIPT missing"; ok=0; }
  [ "$ok" = 1 ] && echo "stems: OK ($(free_gb) GB free)" || { echo "fix: bridge/stems/install.sh"; return 1; }
}

if [ "${1:-}" = "--check" ]; then check; exit $?; fi

echo "stems: installing under $STEMS ($(free_gb) GB free before)"
[ -x "$BREW_PY" ] || { echo "stems: $BREW_PY not found — brew install python@3.10 (or set BRIDGE_STEMS_PYTHON)"; exit 1; }
mkdir -p "$STEMS"
[ -x "$PY" ] || "$BREW_PY" -m venv "$VENV"
"$PY" -m pip install -q -U pip wheel "setuptools<81"
/usr/sbin/taskpolicy -b "$PY" -m pip install -q "demucs==$DEMUCS_VER" "basic-pitch==$BP_VER" soundfile "setuptools<81"
echo "stems: fetching weights (htdemucs, htdemucs_6s; htdemucs_ft on first use)"
HF_HUB_DISABLE_PROGRESS_BARS=1 "$PY" -c "from demucs.pretrained import get_model; get_model('htdemucs'); get_model('htdemucs_6s')"
echo "stems: selftest (4 s of synthetic audio through the real engine)"
TMP="$(mktemp -d)"
OMP_NUM_THREADS=4 HF_HUB_OFFLINE=1 /usr/sbin/taskpolicy -c utility "$PY" -I "$SCRIPT" --selftest --out "$TMP" | tail -1
rm -rf "$TMP"
check
echo "stems: done ($(free_gb) GB free after). Restart the bridge so GET /v1/jobs says stems: true."
