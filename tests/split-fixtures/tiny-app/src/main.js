import { EDITION } from "./edition.js";
import { S } from "./state.js";
import { bump } from "./foo.js";

export function initMain1() {
  S.label = EDITION;
  bump();
}
initMain1();
