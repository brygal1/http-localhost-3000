import type { Confidence } from "./money";

export interface EarningsDay {
  id: string;
  date: string;
  shiftType: string;
  hoursWorked: number;
  netPayCents: number;
  tipsCents: number;
  paidSameDay: boolean;
  payMethod: string;
}

export interface Obligation {
  id: string;
  name: string;
  category: string;
  amountCents: number;
  frequency: string;
  dueDayOfMonth: number;
  autopay: boolean;
  essential: boolean;
}

export interface Advance {
  id: string;
  requestedAt: string;
  amountCents: number;
  feeCents: number;
  status: string;
  repaidAt: string | null;
  repaymentSource: string | null;
  reasonCode: string;
}

export interface WeekSummary {
  weekStart: string;
  incomeCents: number;
  expenseCents: number;
  essentialExpenseCents: number;
  netCashflowCents: number;
  advancesCount: number;
  advancesAmountCents: number;
  advanceFeesCents: number;
  endingBalanceCents: number;
  bufferDays: number | null;
  negativeBalance: boolean;
}

export interface WorkerProfile {
  id: string;
  city: string;
  province: string;
  occupation: string;
  payType: string;
  incomeVolatility: number;
  tipShare: number;
  typicalDailyNetCents: number;
  householdSize: number;
  dependents: number;
  hasBankAccount: boolean;
  usesPrepaidCard: boolean;
  hasSideGig: boolean;
  commuteMode: string;
  rentBurdenBand: string;
  asOfDate: string;
  balanceCents: number;
  earnings: EarningsDay[];
  obligations: Obligation[];
  advances: Advance[];
  weeks: WeekSummary[];
  paidAdvanceFeesCents: number;
  cancelledAdvanceFeesCents: number;
}

export interface DecisionSnapshot {
  workerId: string;
  asOfDate: string;
  balanceCents: number;
  protectedCents: number;
  smoothingBalanceCents: number;
  safeToSpendCents: number;
  rentAmountCents: number;
  rentRemainingCents: number;
  rentDueDate: string;
  rentDueInDays: number;
  workdaysRemaining: number;
  expectedDailyNetCents: number;
  expectedIncomeLowCents: number;
  expectedIncomeHighCents: number;
  projectedGapCents: number;
  coverageProbability: number;
  outstandingAdvanceCents: number;
  outstandingAdvanceFeeCents: number;
  paidAdvanceFeesCents: number;
  confidence: Confidence;
  assumptions: string[];
  scenarioLabel?: string;
}

export interface CopilotAnswer {
  directAnswer: string;
  consequence: string;
  nextAction: string;
  confidence: Confidence;
  assumptions: string[];
  source: "ai" | "fallback";
}

export interface SmoothingRecommendation {
  recommendedContributionCents: number;
  minContributionCents: number;
  maxContributionCents: number;
  reason: string;
  afterStrongDay: boolean;
}

export interface DayOffComparison {
  baseline: DecisionSnapshot;
  withoutSmoothing: DecisionSnapshot;
  withSmoothing: DecisionSnapshot;
  missedIncomeCents: number;
  smoothingOffsetCents: number;
  gapDeltaCents: number;
  workdaysDelta: number;
}

export interface AdvanceImpact {
  requestedCents: number;
  feeCents: number;
  totalRepayCents: number;
  nextEarningsHaircutCents: number;
  snapshot: DecisionSnapshot;
  assumptions: string[];
}

export interface SimulationState {
  workerId: string;
  smoothingBalanceCents: number;
  appliedDayOff: boolean;
  appliedSmoothingOffsetCents: number;
  appliedContributionCents: number;
  appliedAdvanceCents: number;
  appliedAdvanceFeeCents: number;
}
