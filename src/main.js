// src/main.js — entry point (docs/split-plan.md §1, step 0b). Imports
// app.js, which still holds nearly the whole app pre-split (later steps move
// pieces out of it into their own modules). Wires the e2e devtools mirror,
// gated so production never pays for it (§3.4).
import "./app.js";
import { exposeGlobals } from "./devtools.js";

if (typeof window !== "undefined" && window.__NR_EXPOSE) exposeGlobals();
