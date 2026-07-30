import {
  addDays,
  average,
  clampCents,
  daysBetween,
  formatIsoDate,
  median,
  parseIsoDate,
  percentile,
  type Confidence,
} from "./money";
import type {
  DecisionSnapshot,
  Obligation,
  WorkerProfile,
} from "./types";

const FORECAST_DAYS = 14;
const LOOKBACK_DAYS = 28;

export function nextDueDate(
  asOfDate: string,
  dueDayOfMonth: number,
): string {
  const asOf = parseIsoDate(asOfDate);
  const year = asOf.getFullYear();
  const month = asOf.getMonth();
  const candidate = new Date(year, month, dueDayOfMonth);
  if (formatIsoDate(candidate) <= asOfDate) {
    return formatIsoDate(new Date(year, month + 1, dueDayOfMonth));
  }
  return formatIsoDate(candidate);
}

export function getRentObligation(worker: WorkerProfile): Obligation | null {
  return (
    worker.obligations.find((item) => item.category === "housing") ??
    worker.obligations.find((item) => /rent/i.test(item.name)) ??
    null
  );
}

export function recentWorkingDayNets(
  worker: WorkerProfile,
  lookbackDays = LOOKBACK_DAYS,
): number[] {
  const start = addDays(worker.asOfDate, -lookbackDays);
  return worker.earnings
    .filter((day) => day.date >= start && day.date <= worker.asOfDate)
    .map((day) => day.netPayCents);
}

export function expectedDailyNetCents(worker: WorkerProfile): number {
  const recent = recentWorkingDayNets(worker);
  if (!recent.length) return worker.typicalDailyNetCents;
  return median(recent);
}

export function expectedIncomeRange(
  worker: WorkerProfile,
  horizonDays = FORECAST_DAYS,
): { lowCents: number; midCents: number; highCents: number; workdaysExpected: number } {
  const recent = recentWorkingDayNets(worker);
  const daily = recent.length ? recent : [worker.typicalDailyNetCents];
  const spanStart = addDays(worker.asOfDate, -LOOKBACK_DAYS);
  const workingDaysObserved = worker.earnings.filter(
    (day) => day.date >= spanStart && day.date <= worker.asOfDate,
  ).length;
  const workdayRate = Math.min(1, workingDaysObserved / LOOKBACK_DAYS);
  const workdaysExpected = Math.max(1, Math.round(horizonDays * workdayRate));
  const lowDaily = percentile(daily, 0.25);
  const midDaily = median(daily);
  const highDaily = percentile(daily, 0.75);
  const volatilityPad = Math.round(midDaily * worker.incomeVolatility * 0.35);

  return {
    lowCents: clampCents(workdaysExpected * lowDaily - volatilityPad),
    midCents: clampCents(workdaysExpected * midDaily),
    highCents: clampCents(workdaysExpected * highDaily + volatilityPad),
    workdaysExpected,
  };
}

export function essentialObligationsDue(
  worker: WorkerProfile,
  throughDate: string,
): Obligation[] {
  return worker.obligations.filter((item) => {
    if (!item.essential) return false;
    const due = nextDueDate(worker.asOfDate, item.dueDayOfMonth);
    return due <= throughDate;
  });
}

export function protectedCents(worker: WorkerProfile): number {
  const rent = getRentObligation(worker);
  const through = rent
    ? nextDueDate(worker.asOfDate, rent.dueDayOfMonth)
    : addDays(worker.asOfDate, FORECAST_DAYS);
  const essentials = essentialObligationsDue(worker, through);
  const obligationTotal = essentials.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  );
  const outstanding = worker.advances
    .filter((item) => item.status === "outstanding")
    .reduce((sum, item) => sum + item.amountCents + item.feeCents, 0);

  // Protect upcoming essentials and outstanding advance repayments.
  // Smoothing is tracked separately and subtracted in safe-to-spend.
  return clampCents(obligationTotal + outstanding);
}

export function safeToSpendCents(input: {
  balanceCents: number;
  protectedCents: number;
  smoothingBalanceCents: number;
}): number {
  return clampCents(
    input.balanceCents - input.protectedCents - input.smoothingBalanceCents,
  );
}

export function rentWorkdaysRemaining(
  rentRemainingCents: number,
  dailyNetCents: number,
): number {
  if (rentRemainingCents <= 0) return 0;
  if (dailyNetCents <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(rentRemainingCents / dailyNetCents);
}

export function projectedCashGapCents(input: {
  worker: WorkerProfile;
  smoothingBalanceCents: number;
  missedIncomeCents?: number;
  smoothingOffsetCents?: number;
  extraExpenseCents?: number;
  horizonDays?: number;
}): number {
  const horizonDays = input.horizonDays ?? FORECAST_DAYS;
  const income = expectedIncomeRange(input.worker, horizonDays);
  const through = addDays(input.worker.asOfDate, horizonDays);
  const essentials = essentialObligationsDue(input.worker, through).reduce(
    (sum, item) => sum + item.amountCents,
    0,
  );
  const outstanding = input.worker.advances
    .filter((item) => item.status === "outstanding")
    .reduce((sum, item) => sum + item.amountCents + item.feeCents, 0);
  const availableNow = safeToSpendCents({
    balanceCents: input.worker.balanceCents,
    protectedCents: protectedCents(input.worker),
    smoothingBalanceCents: input.smoothingBalanceCents,
  });
  const expectedIn =
    income.midCents -
    (input.missedIncomeCents ?? 0) +
    (input.smoothingOffsetCents ?? 0);
  const expectedOut =
    essentials + outstanding + (input.extraExpenseCents ?? 0);

  // Negative = shortfall (cash gap). Positive = surplus.
  return expectedIn + availableNow - expectedOut;
}

export function coverageProbability(input: {
  worker: WorkerProfile;
  projectedGapCents: number;
  rentRemainingCents: number;
}): number {
  const income = expectedIncomeRange(input.worker);
  const span = Math.max(1, income.highCents - income.lowCents);
  const cushion = input.projectedGapCents;
  // Map gap relative to income uncertainty into 0–1.
  const raw = 0.55 + cushion / (span + input.rentRemainingCents + 1);
  const volatilityPenalty = input.worker.incomeVolatility * 0.18;
  return Math.max(0.05, Math.min(0.95, raw - volatilityPenalty));
}

export function confidenceFromVolatility(
  volatility: number,
  sampleSize: number,
): Confidence {
  if (sampleSize < 8 || volatility >= 0.5) return "low";
  if (volatility >= 0.35 || sampleSize < 16) return "moderate";
  return "high";
}

export function initialSmoothingBalanceCents(worker: WorkerProfile): number {
  const recent = recentWorkingDayNets(worker, 14);
  if (!recent.length) return 0;
  const daily = median(recent);
  const strongDays = recent.filter((value) => value > daily * 1.05);
  const fromStrength = strongDays.reduce(
    (sum, value) => sum + Math.round((value - daily) * 0.45),
    0,
  );
  // Simulated historical reserve — not limited by today's tight balance.
  // Safe to Spend still clamps at zero and never spends protected essentials.
  const baselineSeed = Math.round(daily * 0.55);
  return clampCents(Math.min(Math.max(fromStrength, baselineSeed), daily * 1.75));
}

export function buildDecisionSnapshot(input: {
  worker: WorkerProfile;
  smoothingBalanceCents: number;
  missedIncomeCents?: number;
  smoothingOffsetCents?: number;
  extraExpenseCents?: number;
  advanceDrawCents?: number;
  advanceFeeCents?: number;
  scenarioLabel?: string;
}): DecisionSnapshot {
  const rent = getRentObligation(input.worker);
  const rentAmountCents = rent?.amountCents ?? 0;
  const rentDueDate = rent
    ? nextDueDate(input.worker.asOfDate, rent.dueDayOfMonth)
    : addDays(input.worker.asOfDate, 14);
  const rentDueInDays = daysBetween(input.worker.asOfDate, rentDueDate);
  const dailyNet = expectedDailyNetCents(input.worker);
  const income = expectedIncomeRange(input.worker);
  const protectedAmount = protectedCents(input.worker);
  const balanceCents =
    input.worker.balanceCents +
    (input.advanceDrawCents ?? 0) -
    (input.advanceFeeCents ?? 0);
  const safe = safeToSpendCents({
    balanceCents,
    protectedCents: protectedAmount,
    smoothingBalanceCents: input.smoothingBalanceCents,
  });
  const projectedGap = projectedCashGapCents({
    worker: input.worker,
    smoothingBalanceCents: input.smoothingBalanceCents,
    missedIncomeCents: input.missedIncomeCents,
    smoothingOffsetCents: input.smoothingOffsetCents,
    extraExpenseCents:
      (input.extraExpenseCents ?? 0) + (input.advanceFeeCents ?? 0),
  });
  // Effective rent remaining after applying any smoothing offset toward coverage.
  const rentRemainingCents = clampCents(
    rentAmountCents - Math.max(0, input.smoothingOffsetCents ?? 0),
  );
  const workdays = rentWorkdaysRemaining(rentRemainingCents, dailyNet);
  const coverage = coverageProbability({
    worker: input.worker,
    projectedGapCents: projectedGap,
    rentRemainingCents,
  });
  const recent = recentWorkingDayNets(input.worker);
  const outstanding = input.worker.advances.filter(
    (item) => item.status === "outstanding",
  );
  const outstandingAdvanceCents = outstanding.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  );
  const outstandingAdvanceFeeCents = outstanding.reduce(
    (sum, item) => sum + item.feeCents,
    0,
  );

  const assumptions = [
    `As of ${input.worker.asOfDate}, using observed earnings through that date.`,
    `Typical daily net estimated from the median of the last ${Math.min(28, recent.length || 28)} working days (${formatHint(dailyNet)}).`,
    `Rent due ${rentDueDate} (${rentDueInDays} calendar days).`,
    `Forecast horizon is ${FORECAST_DAYS} days with about ${income.workdaysExpected} expected workdays.`,
    "Estimates are ranges, not guarantees.",
  ];

  if (input.missedIncomeCents) {
    assumptions.push(
      `Scenario removes ${formatHint(input.missedIncomeCents)} of expected near-term earnings.`,
    );
  }
  if (input.smoothingOffsetCents) {
    assumptions.push(
      `Simulated smoothing wallet covers ${formatHint(input.smoothingOffsetCents)} of the gap.`,
    );
  }
  if (input.advanceDrawCents) {
    assumptions.push(
      `Simulated advance adds ${formatHint(input.advanceDrawCents)} now and ${formatHint(input.advanceFeeCents ?? 0)} in fees.`,
    );
  }

  return {
    workerId: input.worker.id,
    asOfDate: input.worker.asOfDate,
    balanceCents,
    protectedCents: protectedAmount,
    smoothingBalanceCents: input.smoothingBalanceCents,
    safeToSpendCents: safe,
    rentAmountCents,
    rentRemainingCents,
    rentDueDate,
    rentDueInDays,
    workdaysRemaining:
      Number.isFinite(workdays) && workdays < 1000 ? workdays : 99,
    expectedDailyNetCents: dailyNet,
    expectedIncomeLowCents: income.lowCents,
    expectedIncomeHighCents: income.highCents,
    projectedGapCents: projectedGap,
    coverageProbability: coverage,
    outstandingAdvanceCents,
    outstandingAdvanceFeeCents,
    paidAdvanceFeesCents: input.worker.paidAdvanceFeesCents,
    confidence: confidenceFromVolatility(
      input.worker.incomeVolatility,
      recent.length,
    ),
    assumptions,
    scenarioLabel: input.scenarioLabel,
  };
}

function formatHint(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function workdayFrequency(worker: WorkerProfile): number {
  const start = addDays(worker.asOfDate, -LOOKBACK_DAYS);
  const count = worker.earnings.filter(
    (day) => day.date >= start && day.date <= worker.asOfDate,
  ).length;
  return count / LOOKBACK_DAYS;
}

export function averageRecentDailyNet(worker: WorkerProfile): number {
  return average(recentWorkingDayNets(worker));
}
