// The calibration match rule: every good and poor call of the user's must match; a maybe may go either way.
import { describe, expect, it } from "vitest";
import { calibrate } from "../src/evaluate/calibrate.ts";
import type { Evaluation } from "../src/evaluate/check.ts";

const spot = (id: string, known: string) => ({ id, street: id, suburb: "Taringa", known });
const evals = (verdicts: Record<string, string>) =>
  new Map(Object.entries(verdicts).map(([id, verdict]) => [id, { candidate: id, verdict } as unknown as Evaluation]));

describe("calibration match rule", () => {
  const spots = [spot("a", "good: lovely"), spot("b", "poor: houses"), spot("c", "maybe throughout (revised)")];

  it("passes when the good and poor calls match and a maybe is a near miss", () => {
    const r = calibrate(spots, evals({ a: "good", b: "poor", c: "good" }));
    expect(r.passed).toBe(true);
    expect(r.exact).toBe(2);
    expect(r.nearMisses).toBe(1);
  });

  it("fails when a good spot comes back maybe", () => {
    const r = calibrate(spots, evals({ a: "maybe", b: "poor", c: "maybe" }));
    expect(r.passed).toBe(false);
    expect(r.failures).toEqual([{ id: "a", known: "good", verdict: "maybe" }]);
  });

  it("fails when a poor spot comes back good", () => {
    expect(calibrate(spots, evals({ a: "good", b: "good", c: "maybe" })).passed).toBe(false);
  });

  it("fails when a spot has no evaluation", () => {
    const r = calibrate(spots, evals({ a: "good", b: "poor" }));
    expect(r.passed).toBe(false);
    expect(r.missing).toEqual(["c"]);
  });
});
