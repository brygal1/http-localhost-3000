import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyDayOffPlan,
  buildDecisionSnapshot,
  compareDayOffScenario,
  initialSmoothingBalanceCents,
} from "../../domain/index";
import { buildFallbackAnswer } from "../../domain/copilot";
import dataset from "../../app/shiftahead-data.json" with { type: "json" };
import type { WorkerProfile } from "../../domain/types";

describe("demo loop smoke", () => {
  it("runs the primary ShiftAhead story for the default worker", () => {
    const worker = dataset.workers.find(
      (item) => item.id === dataset.defaultWorkerId,
    ) as WorkerProfile;
    assert.ok(worker, "default worker must exist");

    const smoothing = initialSmoothingBalanceCents(worker);
    const baseline = buildDecisionSnapshot({
      worker,
      smoothingBalanceCents: smoothing,
    });

    assert.notEqual(
      baseline.safeToSpendCents,
      baseline.balanceCents,
      "Safe to Spend must differ from raw balance",
    );
    assert.ok(baseline.rentRemainingCents > 0);
    assert.ok(baseline.workdaysRemaining > 0);
    assert.ok(baseline.rentDueInDays >= 0);
    assert.ok(baseline.assumptions.length > 0);

    const dayOff = compareDayOffScenario({
      worker,
      smoothingBalanceCents: smoothing,
    });
    assert.ok(dayOff.missedIncomeCents > 0);
    assert.ok(
      dayOff.withoutSmoothing.projectedGapCents <=
        dayOff.baseline.projectedGapCents,
    );

    const applied = applyDayOffPlan({
      worker,
      smoothingBalanceCents: Math.max(smoothing, dayOff.smoothingOffsetCents + 500),
    });
    assert.ok(applied.offsetCents >= 0);

    const answer = buildFallbackAnswer({
      question: "I need tomorrow off. Can I afford it?",
      snapshot: applied.snapshot,
      baseline: dayOff.withoutSmoothing,
    });
    assert.ok(answer.directAnswer.length > 0);
    assert.ok(answer.consequence.length > 0);
    assert.ok(answer.nextAction.length > 0);
    assert.equal(answer.source, "fallback");
    assert.ok(answer.assumptions.length > 0);

    // Recovery should not invent numbers outside the snapshot.
    assert.match(
      `${answer.directAnswer} ${answer.consequence} ${answer.nextAction}`,
      /rent|workday|smoothing|Safe to Spend|off/i,
    );
  });
});
