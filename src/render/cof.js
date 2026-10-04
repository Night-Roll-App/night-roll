import { spellPc } from "../theory/chords.js";
import { SF_MAJOR } from "../theory/chords.js";
import { S } from "../state.js";
import { sfDeclaredAt } from "../model/song.js";
import { curTick } from "./roll.js";
import { css } from "./roll.js";
import { spellFor } from "../theory/chords.js";

export const cofCanvas = document.getElementById("cofcanvas");
export const cofCtx = cofCanvas.getContext("2d");
export function cofMinor(sf) { return spellPc((((sf * 7) % 12 + 12) % 12 + 9) % 12, sf) + "m"; }
export function cofDim(sf) { return spellPc((((sf * 7) % 12 + 12) % 12 + 11) % 12, sf) + "dim"; }
export function cofSigLabel(sf) { return sf === 0 ? "♮" : Math.abs(sf) + (sf > 0 ? "♯" : "♭"); }
export function cofMajorName(sf) { return sf === 6 ? "F♯/G♭" : SF_MAJOR[sf]; }
export const wrapSf = sf => { let s = ((sf + 6) % 12 + 12) % 12 - 6; return s === -6 ? 6 : s; };
// -6 shows as F#/Gb
export function drawCof() {
  const size = Math.min(window.innerWidth * 0.84, 380);
  const dpr = window.devicePixelRatio || 1;
  cofCanvas.width = size * dpr;
  cofCanvas.height = size * dpr;
  cofCanvas.style.width = size + "px";
  cofCanvas.style.height = size + "px";
  const c = cofCtx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2, R = size / 2 - 2;
  const rings = [[0.74, 1.0], [0.50, 0.74], [0.30, 0.50]]; // major / minor / dim (fractions of R)
  const win = off => wrapSf(S.cofSf + off); // degree window: -1=IV, 0=I, +1=V
  const govern = S.song ? sfDeclaredAt(curTick()) : null;
  const rotVal = S.cofDragRot !== null ? S.cofDragRot : S.cofRot; // wheel rotation (fractional mid-drag)
  for (let i = 0; i < 12; i++) {
    const sf = wrapSf(i > 6 ? i - 12 : i);
    const rel = (((sf - rotVal) % 12) + 12) % 12; // wedge position: rotVal sits at 12 o'clock
    const a0 = (rel - 0.5) * Math.PI / 6 - Math.PI / 2, a1 = a0 + Math.PI / 6;
    const inWin = [win(-1), win(0), win(1)].includes(sf);
    for (let ring = 0; ring < 3; ring++) {
      const [rIn, rOut] = rings[ring];
      // window shading: majors light for IV I V, minors for ii vi iii, dim only under I
      const lit = ring < 2 ? inWin : sf === win(0);
      c.beginPath();
      c.arc(cx, cy, R * rOut, a0, a1);
      c.arc(cx, cy, R * rIn, a1, a0, true);
      c.closePath();
      c.fillStyle = lit ? "rgba(212,175,55,0.16)" : css("--panel2");
      c.fill();
      c.strokeStyle = css("--grid");
      c.stroke();
    }
    if (govern !== null && sf === wrapSf(govern)) { // song's key: gold rim on its major wedge
      c.beginPath();
      c.arc(cx, cy, R * 0.995, a0, a1);
      c.strokeStyle = css("--gold");
      c.lineWidth = 3;
      c.stroke();
      c.lineWidth = 1;
    }
    const mid = (a0 + a1) / 2;
    const put = (txt, rFrac, font, color) => {
      c.font = font;
      c.fillStyle = color;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(txt, cx + Math.cos(mid) * R * rFrac, cy + Math.sin(mid) * R * rFrac);
    };
    put(cofMajorName(sf), 0.90, "bold 15px " + css("--mono"), css("--text"));
    put(cofSigLabel(sf), 0.79, "10px " + css("--mono"), css("--dim"));
    put(cofMinor(sf), 0.62, "12px " + css("--mono"), css("--text"));
    put(cofDim(sf), 0.40, "9px " + css("--mono"), css("--dim"));
    // degree labels ride the window
    if (sf === win(0)) { put("I", 0.955, "bold 10px " + css("--mono"), css("--gold")); put("vi", 0.545, "bold 9px " + css("--mono"), css("--gold")); put("vii°", 0.325, "bold 8px " + css("--mono"), css("--gold")); }
    if (sf === win(-1)) { put("IV", 0.955, "bold 10px " + css("--mono"), css("--gold")); put("ii", 0.545, "bold 9px " + css("--mono"), css("--gold")); }
    if (sf === win(1)) { put("V", 0.955, "bold 10px " + css("--mono"), css("--gold")); put("iii", 0.545, "bold 9px " + css("--mono"), css("--gold")); }
  }
  // detail: everything about the window's center key
  const sf = win(0);
  const sp = spellFor(sf);
  const tonicPc = (((sf * 7) % 12) + 12) % 12;
  const scale = [0, 2, 4, 5, 7, 9, 11].map(iv => { const s = sp[(tonicPc + iv) % 12]; return s.letter + (s.acc || ""); });
  const triads = [scale[0], scale[1] + "m", scale[2] + "m", scale[3], scale[4], scale[5] + "m", scale[6] + "°"];
  const DEGS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  const accs = sf === 0 ? "no accidentals"
    : sf > 0 ? ["F♯", "C♯", "G♯", "D♯", "A♯", "E♯"].slice(0, sf).join(" ")
    : ["B♭", "E♭", "A♭", "D♭", "G♭", "C♭"].slice(0, -sf).join(" ");
  document.getElementById("cofdetail").innerHTML =
    "<b>" + cofMajorName(sf) + " major</b> · " + cofSigLabel(sf) + " (" + accs + ") · relative " + cofMinor(sf) + "\n" +
    "scale: " + scale.join(" ") + "\n" +
    DEGS.map((d, i) => d + " " + triads[i]).join("  ·  ") + "\n" +
    "V of " + cofMajorName(sf) + " is " + cofMajorName(wrapSf(sf + 1)) + " · IV is " + cofMajorName(wrapSf(sf - 1));
}
