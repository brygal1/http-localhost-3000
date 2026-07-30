import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyDayOffPlan,
  compareDayOffScenario,
  estimateAdvanceFeeCents,
  recommendSmoothingContribution,
  rentWorkdaysRemaining,
  safeToSpendCents,
  simulateAdvanceImpact,
} from "../../domain/index";
import type { WorkerProfile } from "../../domain/types";

function fixtureWorker(overrides: Partial<WorkerProfile> = {}): WorkerProfile {
  const base: WorkerProfile = {
    id: "W-TEST",
    city: "Calgary",
    province: "AB",
    occupation: "Event / venue staff",
    payType: "hourly",
    incomeVolatility: 0.5,
    tipShare: 0.2,
    typicalDailyNetCents: 17_300,
    householdSize: 2,
    dependents: 1,
    hasBankAccount: true,
    usesPrepaidCard: false,
    hasSideGig: false,
    commuteMode: "transit",
    rentBurdenBand: "high",
    asOfDate: "2026-06-28",
    balanceCents: 60_400,
    earnings: [
      { id: "e1", date: "2026-06-20", shiftType: "evening", hoursWorked: 8, netPayCents: 18_200, tipsCents: 2_000, paidSameDay: true, payMethod: "direct_deposit" },
      { id: "e2", date: "2026-06-21", shiftType: "evening", hoursWorked: 7, netPayCents: 12_400, tipsCents: 800, paidSameDay: true, payMethod: "direct_deposit" },
      { id: "e3", date: "2026-06-22", shiftType: "evening", hoursWorked: 8, netPayCents: 19_100, tipsCents: 2_400, paidSameDay: true, payMethod: "direct_deposit" },
      { id: "e4", date: "2026-06-24", shiftType: "evening", hoursWorked: 8, netPayCents: 16_800, tipsCents: 1_500, paidSameDay: true, payMethod: "direct_deposit" },
      { id: "e5", date: "2026-06-25", shiftType: "evening", hoursWorked: 9, netPayCents: 21_000, tipsCents: 3_000, paidSameDay: true, payMethod: "direct_deposit" },
      { id: "e6", date: "2026-06-26", shiftType: "evening", hoursWorked: 8, netPayCents: 17_500, tipsCents: 1_800, paidSameDay: true, payMethod: "direct_deposit" },
      { id: "e7", date: "2026-06-27", shiftType: "evening", hoursWorked: 8, netPayCents: 15_200, tipsCents: 1_100, paidSameDay: true, payMethod: "direct_deposit" },
      { id: "e8", date: "2026-06-28", shiftType: "evening", hoursWorked: 8, netPayCents: 22_400, tipsCents: 3_200, paidSameDay: true, payMethod: "direct_deposit" },
    ],
    obligations: [
      {
        id: "o1",
        name: "Rent",
        category: "housing",
        amountCents: 113_400,
        frequency: "monthly",
        dueDayOfMonth: 1,
        autopay: true,
        essential: true,
      },
      {
        id: "o2",
        name: "Transit pass",
        category: "transit",
        amountCents: 11_200,
        frequency: "monthly",
        dueDayOfMonth: 1,
        autopay: true,
        essential: true,
      },
    ],
    advances: [
      {
        id: "a1",
        requestedAt: "2026-05-10T12:00:00",
        amountCents: 10_000,
        feeCents: 299,
        status: "repaid",
        repaidAt: "2026-05-14T12:00:00",
        repaymentSource: "same_day_earnings",
        reasonCode: "rent",
      },
      {
        id: "a2",
        requestedAt: "2026-06-20T12:00:00",
        amountCents: 8_000,
        feeCents: 199,
        status: "outstanding",
        repaidAt: null,
        repaymentSource: null,
        reasonCode: "childcare",
      },
    ],
    weeks: [],
    paidAdvanceFeesCents: 299,
    cancelledAdvanceFeesCents: 0,
  };
  return { ...base, ...overrides };
}

describe("safeToSpendCents", () => {
  it("never presents the raw balance as fully spendable", () => {
    const safe = safeToSpendCents({
      balanceCents: 60_400,
      protectedCents: 124_600,
      smoothingBalanceCents: 8_000,
    });
    assert.equal(safe, 0);
  });

  it("never falls below zero", () => {
    assert.equal(
      safeToSpendCents({
        balanceCents: 5_000,
        protectedCents: 20_000,
        smoothingBalanceCents: 1_000,
      }),
      0,
    );
  });

  it("subtracts protected and smoothing once", () => {
    assert.equal(
      safeToSpendCents({
        balanceCents: 100_000,
        protectedCents: 40_000,
        smoothingBalanceCents: 10_000,
      }),
      50_000,
    );
  });
});

describe("rentWorkdaysRemaining", () => {
  it("expresses remaining rent in typical workdays", () => {
    assert.equal(rentWorkdaysRemaining(113_400, 17_300), 7);
  });

  it("returns zero when rent is covered", () => {
    assert.equal(rentWorkdaysRemaining(0, 17_300), 0);
  });
});

describe("smoothing allocation", () => {
  it("recommends more after a strong day than a weak day", () => {
    const worker = fixtureWorker();
    const strong = recommendSmoothingContribution({
      worker,
      lastEarningCents: 24_000,
      availableAfterProtectionCents: 20_000,
      currentSmoothingCents: 5_000,
    });
    const weak = recommendSmoothingContribution({
      worker,
      lastEarningCents: 9_000,
      availableAfterProtectionCents: 20_000,
      currentSmoothingCents: 5_000,
    });
    assert.ok(strong.afterStrongDay);
    assert.equal(weak.afterStrongDay, false);
    assert.ok(strong.recommendedContributionCents > weak.recommendedContributionCents);
  });

  it("never recommends more than available after protection", () => {
    const worker = fixtureWorker();
    const result = recommendSmoothingContribution({
      worker,
      lastEarningCents: 30_000,
      availableAfterProtectionCents: 1_500,
      currentSmoothingCents: 0,
    });
    assert.ok(result.recommendedContributionCents <= 1_500);
  });
});

describe("day-off scenario comparison", () => {
  it("worsens the projected gap when tomorrow is taken off", () => {
    const worker = fixtureWorker();
    const comparison = compareDayOffScenario({
      worker,
      smoothingBalanceCents: 12_000,
    });
    assert.ok(comparison.missedIncomeCents > 0);
    assert.ok(
      comparison.withoutSmoothing.projectedGapCents <
        comparison.baseline.projectedGapCents,
    );
  });

  it("improves the day-off outcome when smoothing is applied", () => {
    const worker = fixtureWorker();
    const comparison = compareDayOffScenario({
      worker,
      smoothingBalanceCents: 20_000,
    });
    assert.ok(comparison.smoothingOffsetCents > 0);
    assert.ok(
      comparison.withSmoothing.projectedGapCents >
        comparison.withoutSmoothing.projectedGapCents,
    );
    const applied = applyDayOffPlan({
      worker,
      smoothingBalanceCents: 20_000,
    });
    assert.ok(applied.offsetCents > 0);
    assert.ok(applied.smoothingBalanceCents < 20_000);
  });
});

describe("advance fee impact", () => {
  it("keeps fees grounded in repaid advance history", () => {
    const worker = fixtureWorker();
    const fee = estimateAdvanceFeeCents(worker, 10_000);
    assert.equal(fee, 299);
  });

  it("shows repayment haircut on next earnings", () => {
    const worker = fixtureWorker();
    const impact = simulateAdvanceImpact({
      worker,
      smoothingBalanceCents: 5_000,
      requestedCents: 10_000,
    });
    assert.equal(impact.feeCents, 299);
    assert.equal(impact.totalRepayCents, 10_299);
    assert.equal(impact.nextEarningsHaircutCents, 10_299);
    assert.ok(impact.snapshot.assumptions.length > 0);
  });
});
