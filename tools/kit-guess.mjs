// The rhythm-based percussion guess lives in src/model/kit-guess.js (the app
// uses it too: a hand-marked drum track guesses its sounds at play time);
// re-exported here so the capture pipelines keep their import.
export { guessKit, uniqueGmKeys, GM_PERC } from "../src/model/kit-guess.js";
