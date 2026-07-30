import { clampCents } from "./money";
import {
  applySmoothingWithdrawal,
  recommendSmoothingOffset,
} from "./allocation";
import {
  buildDecisionSnapshot,
  expectedDailyNetCents,
} from "./forecast";
import type {
  AdvanceImpact,
  DayOffComparison,
  WorkerProfile,
} from "./types";

export function expectedTomorrowIncomeCents(worker: WorkerProfile): number {
  return expectedDailyNetCents(worker);
}

export function compareDayOffScenario(input: {
  worker: WorkerProfile;
  smoothingBalanceCents: number;
}): DayOffComparison {
  const missedIncomeCents = expectedTomorrowIncomeCents(input.worker);
  const baseline = buildDecisionSnapshot({
    worker: input.worker,
    smoothingBalanceCents: input.smoothingBalanceCents,
    scenarioLabel: "Baseline",
  });
  const withoutSmoothing = buildDecisionSnapshot({
    worker: input.worker,
    smoothingBalanceCents: input.smoothingBalanceCents,
    missedIncomeCents,
    scenarioLabel: "Tomorrow off",
  });
  const offset = recommendSmoothingOffset({
    worker: input.worker,
    smoothingBalanceCents: input.smoothingBalanceCents,
    missedIncomeCents,
  });
  const withSmoothing = buildDecisionSnapshot({
    worker: input.worker,
    smoothingBalanceCents: input.smoothingBalanceCents - offset,
    missedIncomeCents,
    smoothingOffsetCents: offset,
    scenarioLabel: "Tomorrow off + smoothing",
  });

  return {
    baseline,
    withoutSmoothing,
    withSmoothing,
    missedIncomeCents,
    smoothingOffsetCents: offset,
    gapDeltaCents:
      withSmoothing.projectedGapCents - withoutSmoothing.projectedGapCents,
    workdaysDelta:
      withSmoothing.workdaysRemaining - withoutSmoothing.workdaysRemaining,
  };
}

/**
 * Estimate advance fee from the worker's repaid-advance history when available.
 * Falls back to a conservative sample median-like 2.5% + $1.99 floor.
 */
export function estimateAdvanceFeeCents(
  worker: WorkerProfile,
  requestedCents: number,
): number {
  const repaid = worker.advances.filter(
    (item) => item.status === "repaid" && item.amountCents > 0,
  );
  if (repaid.length) {
    const rates = repaid.map((item) => item.feeCents / item.amountCents);
    const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    return clampCents(Math.max(199, Math.round(requestedCents * avgRate)));
  }
  return clampCents(Math.max(199, Math.round(requestedCents * 0.025)));
}

export function simulateAdvanceImpact(input: {
  worker: WorkerProfile;
  smoothingBalanceCents: number;
  requestedCents: number;
}): AdvanceImpact {
  const feeCents = estimateAdvanceFeeCents(
    input.worker,
    input.requestedCents,
  );
  const snapshot = buildDecisionSnapshot({
    worker: input.worker,
    smoothingBalanceCents: input.smoothingBalanceCents,
    advanceDrawCents: input.requestedCents,
    advanceFeeCents: feeCents,
    extraExpenseCents: input.requestedCents + feeCents,
    scenarioLabel: "Earned-wage advance",
  });

  return {
    requestedCents: input.requestedCents,
    feeCents,
    totalRepayCents: input.requestedCents + feeCents,
    nextEarningsHaircutCents: input.requestedCents + feeCents,
    snapshot,
    assumptions: [
      "Advance fees use repaid advances as the best available proxy for fees paid.",
      "Cancelled advance fees are kept separate and not treated as paid.",
      "Repayment is modeled as a haircut on upcoming earnings.",
      "This is a simulation — no real advance is created.",
    ],
  };
}

export function applyDayOffPlan(input: {
  worker: WorkerProfile;
  smoothingBalanceCents: number;
}): {
  smoothingBalanceCents: number;
  offsetCents: number;
  snapshot: ReturnType<typeof buildDecisionSnapshot>;
} {
  const comparison = compareDayOffScenario(input);
  const withdrawn = applySmoothingWithdrawal(
    input.smoothingBalanceCents,
    comparison.smoothingOffsetCents,
  );
  const snapshot = buildDecisionSnapshot({
    worker: input.worker,
    smoothingBalanceCents: withdrawn.balanceCents,
    missedIncomeCents: comparison.missedIncomeCents,
    smoothingOffsetCents: withdrawn.offsetCents,
    scenarioLabel: "Applied recovery plan",
  });
  return {
    smoothingBalanceCents: withdrawn.balanceCents,
    offsetCents: withdrawn.offsetCents,
    snapshot,
  };
}
