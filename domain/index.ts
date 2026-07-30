export type { DecisionSnapshot, CopilotAnswer } from "./types";
export {
  buildDecisionSnapshot,
  coverageProbability,
  expectedDailyNetCents,
  expectedIncomeRange,
  getRentObligation,
  initialSmoothingBalanceCents,
  nextDueDate,
  projectedCashGapCents,
  protectedCents,
  recentWorkingDayNets,
  rentWorkdaysRemaining,
  safeToSpendCents,
} from "./forecast";
export {
  applySmoothingContribution,
  applySmoothingWithdrawal,
  lastEarningCents,
  recommendSmoothingContribution,
  recommendSmoothingOffset,
  seedExplanation,
} from "./allocation";
export {
  applyDayOffPlan,
  compareDayOffScenario,
  estimateAdvanceFeeCents,
  expectedTomorrowIncomeCents,
  simulateAdvanceImpact,
} from "./scenario";
export {
  formatCad,
  formatCadWhole,
  dollarsToCents,
  centsToDollars,
  clampCents,
} from "./money";
