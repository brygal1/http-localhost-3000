import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "sample-data");

/** @param {string} input */
function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

/** @param {string} name */
async function load(name) {
  return parseCsv(await readFile(path.join(source, name), "utf8"));
}

/** @param {unknown} value */
function number(value) {
  return Number(value || 0);
}

/** @param {number} dollars */
function toCents(dollars) {
  return Math.round(dollars * 100);
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string} key
 */
function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    const value = String(row[key]);
    (groups[value] ??= []).push(row);
    return groups;
  }, /** @type {Record<string, Record<string, unknown>[]>} */ ({}));
}

/**
 * High-pressure demo profiles: tight runway, advances, volatility, dependents.
 * Default W-0011 makes Safe to Spend diverge clearly from balance.
 */
const DEMO_WORKER_IDS = [
  "W-0011",
  "W-0029",
  "W-0041",
  "W-0166",
  "W-0016",
  "W-0187",
  "W-0056",
  "W-0160",
  "W-0126",
  "W-0039",
];

const DEFAULT_WORKER_ID = "W-0011";
const AS_OF_DATE = "2026-06-28";

const [
  workers,
  earnings,
  advances,
  obligations,
  weekly,
  transactions,
] = await Promise.all([
  load("workers.csv"),
  load("daily_earnings.csv"),
  load("earned_wage_advances.csv"),
  load("recurring_obligations.csv"),
  load("weekly_cashflow_summary.csv"),
  load("transactions.csv"),
]);

const earningsByWorker = groupBy(earnings, "worker_id");
const advancesByWorker = groupBy(advances, "worker_id");
const obligationsByWorker = groupBy(obligations, "worker_id");
const weeklyByWorker = groupBy(weekly, "worker_id");
const transactionsByWorker = groupBy(transactions, "worker_id");

/**
 * @param {Record<string, unknown>} worker
 */
function buildProfile(worker) {
  const workerId = String(worker.worker_id);
  const workerEarnings = (earningsByWorker[workerId] || [])
    .filter((row) => String(row.work_date) <= AS_OF_DATE)
    .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)));
  const workerAdvances = advancesByWorker[workerId] || [];
  const workerObligations = obligationsByWorker[workerId] || [];
  const workerWeeks = (weeklyByWorker[workerId] || [])
    .filter((row) => String(row.week_start) <= AS_OF_DATE)
    .sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)));
  const workerTxns = (transactionsByWorker[workerId] || [])
    .filter((row) => String(row.txn_ts).slice(0, 10) <= AS_OF_DATE)
    .sort((a, b) => String(a.txn_ts).localeCompare(String(b.txn_ts)));
  const lastTxn = workerTxns.at(-1);
  const repaidAdvances = workerAdvances.filter((row) => row.status === "repaid");
  const paidFeesCents = repaidAdvances.reduce(
    (total, row) => total + toCents(number(row.fee_cad)),
    0,
  );

  return {
    id: workerId,
    city: String(worker.city),
    province: String(worker.province),
    occupation: String(worker.occupation),
    payType: String(worker.pay_type),
    incomeVolatility: number(worker.income_volatility),
    tipShare: number(worker.tip_share),
    typicalDailyNetCents: toCents(number(worker.typical_daily_net_cad)),
    householdSize: number(worker.household_size),
    dependents: number(worker.dependents),
    hasBankAccount: worker.has_bank_account === "1",
    usesPrepaidCard: worker.uses_prepaid_card === "1",
    hasSideGig: worker.has_side_gig === "1",
    commuteMode: String(worker.commute_mode),
    rentBurdenBand: String(worker.rent_burden_band),
    asOfDate: AS_OF_DATE,
    balanceCents: lastTxn ? toCents(number(lastTxn.running_balance_cad)) : 0,
    earnings: workerEarnings.map((row) => ({
      id: String(row.earnings_id),
      date: String(row.work_date),
      shiftType: String(row.shift_type),
      hoursWorked: number(row.hours_worked),
      netPayCents: toCents(number(row.net_pay_cad)),
      tipsCents: toCents(number(row.tips_cad)),
      paidSameDay: row.paid_same_day === "1",
      payMethod: String(row.pay_method),
    })),
    obligations: workerObligations.map((row) => ({
      id: String(row.obligation_id),
      name: String(row.name),
      category: String(row.category),
      amountCents: toCents(number(row.amount_cad)),
      frequency: String(row.frequency),
      dueDayOfMonth: number(row.due_day_of_month),
      autopay: row.autopay === "1",
      essential: row.essential === "1",
    })),
    advances: workerAdvances.map((row) => ({
      id: String(row.advance_id),
      requestedAt: String(row.requested_at),
      amountCents: toCents(number(row.amount_cad)),
      feeCents: toCents(number(row.fee_cad)),
      status: String(row.status),
      repaidAt: row.repaid_at ? String(row.repaid_at) : null,
      repaymentSource: row.repayment_source ? String(row.repayment_source) : null,
      reasonCode: String(row.reason_code),
    })),
    weeks: workerWeeks.map((row) => ({
      weekStart: String(row.week_start),
      incomeCents: toCents(number(row.income_cad)),
      expenseCents: toCents(number(row.expense_cad)),
      essentialExpenseCents: toCents(number(row.essential_expense_cad)),
      netCashflowCents: toCents(number(row.net_cashflow_cad)),
      advancesCount: number(row.advances_count),
      advancesAmountCents: toCents(number(row.advances_amount_cad)),
      advanceFeesCents: toCents(number(row.advance_fees_cad)),
      endingBalanceCents: toCents(number(row.ending_balance_cad)),
      bufferDays:
        row.buffer_days_estimate === ""
          ? null
          : number(row.buffer_days_estimate),
      negativeBalance: row.negative_balance_flag === "1",
    })),
    paidAdvanceFeesCents: paidFeesCents,
    cancelledAdvanceFeesCents: workerAdvances
      .filter((row) => row.status === "cancelled")
      .reduce((total, row) => total + toCents(number(row.fee_cad)), 0),
  };
}

const workerById = Object.fromEntries(
  workers.map((worker) => [String(worker.worker_id), worker]),
);

const profiles = DEMO_WORKER_IDS.map((id) => {
  const worker = workerById[id];
  if (!worker) {
    throw new Error(`Missing demo worker ${id}`);
  }
  return buildProfile(worker);
});

const output = {
  generatedAt: new Date().toISOString(),
  asOfDate: AS_OF_DATE,
  defaultWorkerId: DEFAULT_WORKER_ID,
  coverage: {
    earningsStart: "2026-04-01",
    earningsEnd: AS_OF_DATE,
  },
  workers: profiles,
};

await writeFile(
  path.join(root, "app", "shiftahead-data.json"),
  `${JSON.stringify(output)}\n`,
);

console.log(
  `Built ShiftAhead data for ${profiles.length} workers (default ${DEFAULT_WORKER_ID}).`,
);
