import { clampCents } from "./money";
import {
  expectedDailyNetCents,
  recentWorkingDayNets,
} from "./forecast";
import type { SmoothingRecommendation, WorkerProfile } from "./types";

/**
 * Recommend a variable contribution after an earning day.
 * Strong days contribute more; weak days contribute less.
 * Never recommends consuming funds already needed for protected essentials.
 */
export function recommendSmoothingContribution(input: {
  worker: WorkerProfile;
  lastEarningCents: number;
  availableAfterProtectionCents: number;
  currentSmoothingCents: number;
}): SmoothingRecommendation {
  const typical = expectedDailyNetCents(input.worker);
  const delta = input.lastEarningCents - typical;
  const afterStrongDay = delta > 0;
  const baseRate = afterStrongDay ? 0.28 : 0.08;
  const volatilityBoost = input.worker.incomeVolatility * 0.1;
  const raw = Math.round(
    Math.max(0, input.lastEarningCents) * (baseRate + volatilityBoost) +
      Math.max(0, delta) * 0.2,
  );
  const room = clampCents(input.availableAfterProtectionCents);
  const maxContributionCents = clampCents(
    Math.min(room, Math.round(typical * 1.25)),
  );
  const minContributionCents = afterStrongDay
    ? clampCents(Math.min(maxContributionCents, Math.round(typical * 0.05)))
    : 0;
  const recommendedContributionCents = clampCents(
    Math.min(maxContributionCents, Math.max(minContributionCents, raw)),
  );

  const reason = afterStrongDay
    ? "Yesterday was stronger than your typical day, so ShiftAhead suggests banking more into your smoothing wallet."
    : "Yesterday was softer than usual, so the suggested contribution stays light to protect what you need now.";

  return {
    recommendedContributionCents,
    minContributionCents,
    maxContributionCents,
    reason,
    afterStrongDay,
  };
}

export function lastEarningCents(worker: WorkerProfile): number {
  const recent = [...worker.earnings].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  return recent[0]?.netPayCents ?? worker.typicalDailyNetCents;
}

export function applySmoothingContribution(
  currentCents: number,
  contributionCents: number,
): number {
  return clampCents(currentCents + contributionCents);
}

export function applySmoothingWithdrawal(
  currentCents: number,
  withdrawalCents: number,
): { balanceCents: number; offsetCents: number } {
  const offsetCents = clampCents(Math.min(currentCents, withdrawalCents));
  return {
    balanceCents: clampCents(currentCents - offsetCents),
    offsetCents,
  };
}

/**
 * How much of the smoothing wallet to use against a missed-income day.
 * Caps at the missed amount and never exceeds the wallet balance.
 */
export function recommendSmoothingOffset(input: {
  worker: WorkerProfile;
  smoothingBalanceCents: number;
  missedIncomeCents: number;
}): number {
  if (input.missedIncomeCents <= 0 || input.smoothingBalanceCents <= 0) {
    return 0;
  }
  const typical = expectedDailyNetCents(input.worker);
  // Cover most of a missed day, leave a small residual buffer when possible.
  const target = Math.round(input.missedIncomeCents * 0.7);
  const reserve = Math.round(typical * 0.15);
  const usable = clampCents(input.smoothingBalanceCents - reserve);
  return clampCents(Math.min(target, usable, input.missedIncomeCents));
}

export function seedExplanation(worker: WorkerProfile, seedCents: number): string {
  const recent = recentWorkingDayNets(worker, 14);
  if (!recent.length || seedCents <= 0) {
    return "Your Income Smoothing Wallet starts empty in this simulation.";
  }
  return "Your Income Smoothing Wallet is seeded from recent stronger earning days — simulated, not a real transfer.";
}
