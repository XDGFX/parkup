// Checks for the "out by" rule in app.js. Run: node prototype/app-ui/outby.check.mjs
import fs from "node:fs";
import assert from "node:assert/strict";
const dir = new URL(".", import.meta.url).pathname;
globalThis.window = globalThis; globalThis.addEventListener = () => {};
eval(fs.readFileSync(dir + "data.js", "utf8"));
const src = fs.readFileSync(dir + "app.js", "utf8");
const helpers = src.slice(0, src.indexOf("// ---------- Variant A"));
const { outBy, canStay } = new Function(helpers + "; return { outBy: typeof outBy === 'undefined' ? undefined : outBy, canStay: typeof canStay === 'undefined' ? undefined : canStay };")();
assert.equal(typeof outBy, "function", "outBy is defined");

const WEEKDAYS = [1, 2, 3, 4, 5], ALL = [1, 2, 3, 4, 5, 6, 7];
const at = (s) => new Date(s);
const hhmm = (d) => d && d.toString().slice(0, 21);
const kerb = (rules) => ({ rules });

// The user's example: 2P 6am–6pm, park the evening before → out by 8am.
const twoP = kerb([{ days: ALL, start: 6, end: 18, kind: "limit", label: "2P 6am–6pm" }]);
let r = outBy(twoP, at("2026-09-30T21:00"));
assert.equal(hhmm(r.at), hhmm(at("2026-10-01T08:00")), "2P from 6am → out by 8am");
assert.match(r.why, /2P/);

// Parked inside the limit: 2 hours from arrival.
assert.equal(hhmm(outBy(twoP, at("2026-10-01T10:30")).at), hhmm(at("2026-10-01T12:30")), "mid-limit arrival");

// Parked late in the limit so it ends first: stay overnight, out by 8am the next day.
assert.equal(hhmm(outBy(twoP, at("2026-10-01T17:00")).at), hhmm(at("2026-10-02T08:00")), "limit ends before 2 h is up");

// Weekday-only limit, parked Friday night → out by Monday 9am.
const wk = kerb([{ days: WEEKDAYS, start: 7, end: 18, kind: "limit", label: "2P 7am–6pm Mon–Fri" }]);
assert.equal(hhmm(outBy(wk, at("2026-10-02T21:00")).at), hhmm(at("2026-10-05T09:00")), "Friday night → Monday 9am");

// No parking 5–7am → out by 5am.
const ban = kerb([{ days: ALL, start: 5, end: 7, kind: "no", label: "No parking 5–7am" }]);
r = outBy(ban, at("2026-09-30T18:00"));
assert.equal(hhmm(r.at), hhmm(at("2026-10-01T05:00")), "no parking at 5am");
assert.equal(r.why, "No parking 5–7am");

// No signs → no time to leave by.
assert.equal(outBy(kerb([]), at("2026-09-30T18:00")), null, "unsigned kerb");
// canStay: overnight windows need 8 hours from the window start; shorter windows need their whole length.
assert.equal(typeof canStay, "function", "canStay is defined");
const win = (from, hours) => ({ from: at(from), to: new Date(+at(from) + hours * 3600e3) });
assert.equal(canStay(ban, win("2026-09-30T18:00", 13)), true, "Keith St: out by 5am is 11 h, enough for overnight");
const harts = kerb([{ days: ALL, start: 22, end: 24, kind: "no", label: "No parking 10pm–6am" }, { days: ALL, start: 0, end: 6, kind: "no", label: "" }]);
assert.equal(canStay(harts, win("2026-09-30T18:00", 13)), false, "Harts Rd: out by 10pm is only 4 h");
assert.equal(canStay(ban, win("2026-09-30T22:00", 9)), false, "arriving at 10pm, out by 5am is 7 h");
assert.equal(canStay(wk, win("2026-09-30T15:00", 3)), false, "Now at 3pm on a weekday 2P: out by 5pm, short of 3 h");
assert.equal(canStay(wk, win("2026-09-30T19:00", 3)), true, "Now at 7pm: no limit until tomorrow");
assert.equal(canStay(kerb([]), win("2026-09-30T18:00", 13)), true, "unsigned kerb");
console.log("all outBy and canStay checks pass");
