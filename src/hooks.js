// src/hooks.js (layer 0) — docs/split-phase2-plan.md §1 M1. Upcall ports: a
// one-line synchronous forwarder per name, so a lower layer can call a
// higher layer's body without an illegal import. The real body (renamed
// `XImpl`) lives in whichever module actually needs it; src/wire.js's
// installHooks() is the only place that fills `S.hooks`. Every existing
// call site keeps calling the ORIGINAL bare name — only the import line at
// each call site changes, to import the port from here instead of the
// (former) home module — so a port never touches moved code, just where it
// resolves from. check.mjs rule 10 enforces this file's shape: nothing here
// but the `S` import, the `need` helper, and forwarders of this exact AST
// shape.
import { S } from "./state.js";
const need = n => { throw new Error(`hook ${n} not installed`); }; // fail loud
export function setInfo(...a) { return (S.hooks.setInfo || need("setInfo"))(...a); }
export function logErr(...a) { return (S.hooks.logErr || need("logErr"))(...a); }
export function logDebug(...a) { return (S.hooks.logDebug || need("logDebug"))(...a); }
export function appConfirm(...a) { return (S.hooks.appConfirm || need("appConfirm"))(...a); }
export function updateJobsBtn(...a) { return (S.hooks.updateJobsBtn || need("updateJobsBtn"))(...a); }
