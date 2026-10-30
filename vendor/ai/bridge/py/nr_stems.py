#!/usr/bin/env python3
"""nr_stems.py — one recording in, stems + a notes-only MIDI song out. Run by bridge/stems.mjs with `python -I`.

    nr_stems.py --in FILE --out DIR [--model htdemucs|htdemucs_6s|htdemucs_ft] [--name slug] [--json]
                [--drums kit|frame|off] [--no-mix] [--preset default|clean|detail]
                [--onset F] [--frame F] [--min-note-ms F] [--fmin F] [--fmax F] [--per-stem JSON]
                [--device auto|cpu|mps] [--segment SECONDS]
    nr_stems.py --selftest --out DIR          # 4 s of synthetic audio through the whole chain; exit 1 unless song.mid has notes

Stdout is one JSON object per line: {"stage": "separate", "pct": 0.31}, {"stage": "notes", "stem": "bass", "pct": 0.4},
{"stage": "write"}, and last {"done": true, "counts": {...}, "files": [...]}. Anything else goes to stderr.

What it writes under --out: <stem>.wav (16-bit, the model's rate), mix.wav (the decoded input, when the mix is transcribed),
<stem>.mid per stem, song.mid (all stems, one track each, 120 bpm, PPQ 480), notes.json (counts, durations, options).
The MIDI carries notes and track names only: no key signature, no time signature, no markers, no pitch bends.
A pitched stem's notes come from Basic Pitch; the drums stem goes through a band-energy onset detector (kick / snare or
body / hat by where the energy sits in a 50 ms window) — facts read off the signal, no per-recording table.
This file knows nothing about any app.
"""
import argparse
import json
import math
import os
import sys
import time
from pathlib import Path

PITCHED = ("bass", "vocals", "other", "guitar", "piano")
PRESETS = {"default": (0.5, 0.3, 127.7), "clean": (0.6, 0.4, 180.0), "detail": (0.4, 0.25, 90.0)}  # onset, frame, min note ms
RANGES = {"bass": (30.0, 500.0), "vocals": (80.0, 1100.0), "other": (55.0, 2100.0), "mix": (55.0, 2100.0), "guitar": (55.0, 2100.0), "piano": (27.5, 4200.0)}
DRUM_MAPS = {"kit": {"low": 36, "mid": 41, "broad": 38, "high": 42}, "frame": {"low": 36, "mid": 41, "broad": 41, "high": 45}}
BPM, PPQ, SIXTEENTH = 120.0, 480, 0.125


def say(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def parse_args(argv):
    p = argparse.ArgumentParser(add_help=True)
    p.add_argument("--in", dest="inp")
    p.add_argument("--out", required=True)
    p.add_argument("--model", default="htdemucs", choices=["htdemucs", "htdemucs_6s", "htdemucs_ft"])
    p.add_argument("--name", default="")
    p.add_argument("--json", action="store_true")  # always on; kept so the flag list matches the bridge
    p.add_argument("--drums", default="kit", choices=["kit", "frame", "off"])
    p.add_argument("--no-mix", action="store_true")
    p.add_argument("--preset", default="default", choices=sorted(PRESETS))
    p.add_argument("--onset", type=float, default=0.0)
    p.add_argument("--frame", type=float, default=0.0)
    p.add_argument("--min-note-ms", type=float, default=0.0)
    p.add_argument("--fmin", type=float, default=0.0)
    p.add_argument("--fmax", type=float, default=0.0)
    p.add_argument("--per-stem", default="")
    p.add_argument("--device", default="auto", choices=["auto", "cpu", "mps"])  # auto: mps when torch has it (4x faster here, same stems), else cpu
    p.add_argument("--segment", type=float, default=0.0)
    p.add_argument("--selftest", action="store_true")
    return p.parse_args(argv)


def separate(inp, out, model, device, segment):
    """Demucs → {stem: wav tensor}, the decoded mix, and the sample rate; progress on stdout."""
    import torch
    from demucs.api import Separator, save_audio

    if device == "auto":
        device = "mps" if torch.backends.mps.is_available() else "cpu"
    log(f"device {device}")
    kw = {"model": model, "device": device, "progress": False}
    if segment:
        kw["segment"] = segment
    last = {"pct": -1.0}

    def cb(info):  # keys: model_idx_in_bag, shift_idx, segment_offset, state, audio_length, models (demucs.api docstring)
        if info.get("state") != "end":
            return
        models, shifts, length = max(1, info.get("models", 1)), max(1, getattr(sep, "_shifts", 1) or 1), max(1, info.get("audio_length", 1))
        done_units = (info.get("model_idx_in_bag", 0) * shifts + info.get("shift_idx", 0)) * length + min(length, info.get("segment_offset", 0) + getattr(sep, "_segment_len", 0))
        pct = min(0.99, done_units / float(models * shifts * length))
        if pct - last["pct"] >= 0.01:
            last["pct"] = pct
            say({"stage": "separate", "pct": round(pct, 3)})

    sep = Separator(callback=cb, **kw)
    try:  # the segment length in frames, for a progress bar that moves at the END of a chunk
        sep._segment_len = int((sep._segment or 7.8) * sep.samplerate)
    except Exception:  # noqa: BLE001 — a private attribute; the bar is cosmetic
        sep._segment_len = 0
    say({"stage": "separate", "pct": 0.0})
    origin, stems = sep.separate_audio_file(Path(inp))
    say({"stage": "separate", "pct": 1.0})
    for name, wav in stems.items():
        save_audio(wav, out / f"{name}.wav", samplerate=sep.samplerate, bits_per_sample=16)
    save_audio(origin, out / "mix.wav", samplerate=sep.samplerate, bits_per_sample=16)
    return list(stems.keys()), sep.samplerate, device


def transcribe(path, onset, frame, min_ms, fmin, fmax):
    """Basic Pitch → [(start_s, end_s, pitch, amplitude)], bends dropped."""
    from basic_pitch.inference import predict

    _, _, events = predict(str(path), onset_threshold=onset, frame_threshold=frame, minimum_note_length=min_ms,
                           minimum_frequency=fmin or None, maximum_frequency=fmax or None, multiple_pitch_bends=False, melodia_trick=True)
    return [(float(s), float(e), int(p), float(a)) for (s, e, p, a, _bends) in events]


def drum_notes(path, drum_map):
    """Onsets on the drums stem, each placed by where its energy sits: low → kick, high → hat, mid → body or snare when broadband."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(path), sr=22050, mono=True)
    if not len(y) or float(np.abs(y).max()) < 1e-4:
        return []
    env = librosa.onset.onset_strength(y=y, sr=sr)
    frames = librosa.onset.onset_detect(onset_envelope=env, sr=sr, backtrack=False)
    if not len(frames):
        return []
    times = librosa.frames_to_time(frames, sr=sr)
    strengths = env[frames]
    top = float(strengths.max()) or 1.0
    win = int(0.05 * sr)
    freqs = np.fft.rfftfreq(win, 1.0 / sr)
    low, mid, high = freqs < 150, (freqs >= 150) & (freqs < 1200), freqs >= 5000
    notes = []
    for t, s in zip(times, strengths):
        i = int(t * sr)
        seg = y[i:i + win]
        if len(seg) < win // 2:
            continue
        spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), n=win)) ** 2
        tot = float(spec.sum()) or 1.0
        e_low, e_mid, e_high = spec[low].sum() / tot, spec[mid].sum() / tot, spec[high].sum() / tot
        geo = float(np.exp(np.mean(np.log(spec + 1e-12))))
        flat = geo / (float(spec.mean()) + 1e-12)  # spectral flatness: ~1 noisy, ~0 tonal
        if e_low >= max(e_mid, e_high):
            pitch = drum_map["low"]
        elif e_high >= e_mid:
            pitch = drum_map["high"]
        else:
            pitch = drum_map["broad"] if flat > 0.3 else drum_map["mid"]
        vel = int(min(127, max(40, 40 + 87 * (s / top))))
        notes.append((float(t), float(t) + SIXTEENTH, pitch, vel))
    return notes


def write_midi(path, tracks):
    """tracks: [(name, is_drum, [(start, end, pitch, velocity)])] → a file with notes and track names only."""
    import pretty_midi

    pm = pretty_midi.PrettyMIDI(initial_tempo=BPM, resolution=PPQ)
    for name, is_drum, notes in tracks:
        inst = pretty_midi.Instrument(program=0, is_drum=is_drum, name=name)
        for start, end, pitch, vel in notes:
            if end <= start:
                end = start + 0.05
            inst.notes.append(pretty_midi.Note(velocity=int(vel), pitch=int(pitch), start=float(start), end=float(end)))
        pm.instruments.append(inst)
    pm.write(str(path))
    strip_verdict_metas(path)


def strip_verdict_metas(path):
    """pretty_midi writes a default 4/4 time signature; the file must carry no meter, key, marker or text — only notes and names."""
    import mido

    mf = mido.MidiFile(str(path))
    for track in mf.tracks:
        kept, carry = [], 0
        for msg in track:
            if msg.is_meta and msg.type in ("time_signature", "key_signature", "marker", "text", "lyrics", "cue_marker"):
                carry += msg.time
                continue
            msg.time += carry
            carry = 0
            kept.append(msg)
        track[:] = kept
    mf.save(str(path))


def run(a):
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    stems, sr, device = separate(a.inp, out, a.model, a.device, a.segment)
    t_sep = time.time() - t0
    onset, frame, min_ms = PRESETS[a.preset]
    onset, frame, min_ms = a.onset or onset, a.frame or frame, a.min_note_ms or min_ms
    per = {}
    if a.per_stem:
        try:
            per = {k: v for k, v in json.loads(a.per_stem).items() if isinstance(v, dict)}
        except json.JSONDecodeError:
            log("--per-stem is not JSON; ignored")
    jobs = [s for s in stems if s in PITCHED] + ([] if a.no_mix else ["mix"])
    counts, tracks, durations = {}, [], {}
    for i, stem in enumerate(jobs):
        say({"stage": "notes", "stem": stem, "pct": round(i / max(1, len(jobs)), 3)})
        lo, hi = RANGES.get(stem, (0.0, 0.0))
        r = per.get(stem) or {}
        lo, hi = float(r.get("fmin") or a.fmin or lo), float(r.get("fmax") or a.fmax or hi)
        t1 = time.time()
        notes = transcribe(out / f"{stem}.wav", onset, frame, min_ms, lo, hi)
        durations[stem] = round(time.time() - t1, 1)
        midi_notes = [(s, e, p, int(min(127, max(1, round(40 + 87 * amp))))) for (s, e, p, amp) in notes]
        counts[stem] = len(midi_notes)
        tracks.append((stem, False, midi_notes))
    if "drums" in stems and a.drums != "off":
        say({"stage": "notes", "stem": "drums", "pct": 0.95})
        t1 = time.time()
        dn = drum_notes(out / "drums.wav", DRUM_MAPS[a.drums])
        durations["drums"] = round(time.time() - t1, 1)
        counts["drums"] = len(dn)
        tracks.insert(0, ("drums", True, dn))
    say({"stage": "write"})
    for name, is_drum, notes in tracks:
        write_midi(out / f"{name}.mid", [(name, is_drum, notes)])
    write_midi(out / "song.mid", tracks)
    files = sorted(f.name for f in out.iterdir() if f.suffix in (".wav", ".mid", ".json") or f.name == "notes.json")
    info = {"name": a.name, "model": a.model, "samplerate": sr, "stems": stems, "counts": counts, "secs": {"separate": round(t_sep, 1), **durations},
            "options": {"drums": a.drums, "mix": not a.no_mix, "preset": a.preset, "onset": onset, "frame": frame, "min_note_ms": min_ms, "fmin": a.fmin, "fmax": a.fmax, "per_stem": per, "device": device},
            "bpm": BPM, "ppq": PPQ}
    (out / "notes.json").write_text(json.dumps(info, indent=1))
    files = sorted(set(files) | {"notes.json"})
    say({"done": True, "counts": counts, "files": files, "secs": info["secs"]})


def selftest(a):
    """4 s of two sines + clicks through the real chain on htdemucs; the install script's last step."""
    import numpy as np
    import soundfile as sf

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    sr, n = 44100, 44100 * 4
    t = np.arange(n) / sr
    y = 0.3 * np.sin(2 * np.pi * 220 * t) + 0.2 * np.sin(2 * np.pi * 440 * t) * (t > 2)
    for k in range(8):
        i = int(k * 0.5 * sr)
        y[i:i + 400] += np.exp(-np.arange(400) / 60.0) * 0.8
    wav = out / "selftest.wav"
    sf.write(str(wav), np.stack([y, y], axis=1), sr, subtype="PCM_16")
    a.inp, a.model, a.no_mix, a.drums = str(wav), "htdemucs", False, "kit"
    run(a)
    size = (out / "song.mid").stat().st_size
    counts = json.loads((out / "notes.json").read_text())["counts"]
    log(f"selftest: song.mid {size} bytes, counts {counts}")
    if size < 50 or sum(counts.values()) == 0:
        log("selftest FAILED: no notes came out")
        return 1
    return 0


def main(argv):
    a = parse_args(argv)
    if a.selftest:
        return selftest(a)
    if not a.inp or not os.path.isfile(a.inp):
        log("--in: no such file")
        return 2
    run(a)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
