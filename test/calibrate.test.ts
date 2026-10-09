// The calibration match rule: every good and poor call of the user's must match; a maybe may go either way.
// Every known place must have been judged under the current rubric version.
import { describe, expect, it } from "vitest";
import { calibrate } from "../src/evaluate/calibrate.ts";
import type { Evaluation } from "../src/evaluate/check.ts";

const place = (id: string, known: string) => ({ id, street: id, suburb: "Taringa", known });
const evals = (verdicts: Record<string, string>, rubric = "v10") =>
  new Map(Object.entries(verdicts).map(([id, verdict]) => [id, { candidate: id, verdict, rubric } as unknown as Evaluation]));

describe("calibration match rule", () => {
  const places = [place("a", "good: lovely"), place("b", "poor: houses"), place("c", "maybe throughout (revised)")];

  it("passes when the good and poor calls match and a maybe is a near miss", () => {
    const r = calibrate(places, evals({ a: "good", b: "poor", c: "good" }), "v10");
    expect(r.passed).toBe(true);
    expect(r.exact).toBe(2);
    expect(r.nearMisses).toBe(1);
  });

  it("fails when a good place comes back maybe", () => {
    const r = calibrate(places, evals({ a: "maybe", b: "poor", c: "maybe" }), "v10");
    expect(r.passed).toBe(false);
    expect(r.failures).toEqual([{ id: "a", known: "good", verdict: "maybe" }]);
  });

  it("fails when a poor place comes back good", () => {
    expect(calibrate(places, evals({ a: "good", b: "good", c: "maybe" }), "v10").passed).toBe(false);
  });

  it("fails when a known place has no evaluation", () => {
    const r = calibrate(places, evals({ a: "good", b: "poor" }), "v10");
    expect(r.passed).toBe(false);
    expect(r.missing).toEqual(["c"]);
  });

  it("fails when any known place was judged under another rubric version", () => {
    const mixed = new Map([...evals({ a: "good", b: "poor" }, "v10"), ...evals({ c: "maybe" }, "v9")]);
    const r = calibrate(places, mixed, "v10");
    expect(r.passed).toBe(false);
    expect(r.staleRubric).toEqual(["c"]);
    expect(calibrate(places, evals({ a: "good", b: "poor", c: "maybe" }, "v9"), "v10").passed).toBe(false);
  });
});
