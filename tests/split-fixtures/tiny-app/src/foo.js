import { S } from "./state.js";

export function bump() {
  S.count++;
  return S.count;
}

export let lastEl = null;

export function touchDom() {
  lastEl = document.getElementById("marker");
  return lastEl;
}

const PI_ISH = 3; // const: no setter
export function pi() { return PI_ISH; }
