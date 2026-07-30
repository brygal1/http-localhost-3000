import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "sample-data");

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

async function load(name) {
  return parseCsv(await readFile(path.join(source, name), "utf8"));
}

function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    const value = row[key];
    (groups[value] ??= []).push(row);
    return groups;
  }, {});
}

function number(value) {
  return Number(value || 0);
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + number(row[key]), 0);
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

const [
  workers,
  earnings,
  advances,
  obligations,
  weekly,
] = await Promise.all([
  load("workers.csv"),
  load("daily_earnings.csv"),
  load("earned_wage_advances.csv"),
  load("recurring_obligations.csv"),
  load("weekly_cashflow_summary.csv"),
]);

const earningsByWorker = groupBy(earnings, "worker_id");
const advancesByWorker = groupBy(advances, "worker_id");
const obligationsByWorker = groupBy(obligations, "worker_id");
const weeklyByWorker = groupBy(weekly, "worker_id");

const profiles = workers.map((worker) => {
  const workerEarnings = earningsByWorker[worker.worker_id] || [];
  const workerAdvances = advancesByWorker[worker.worker_id] || [];
  const workerObligations = obligationsByWorker[worker.worker_id] || [];
  const workerWeeks = weeklyByWorker[worker.worker_id] || [];
  const plausibleBuffers = workerWeeks
    .map((week) => number(week.buffer_days_estimate))
    .filter((value) => value >= 0 && value <= 365)
    .sort((a, b) => a - b);
  const medianBuffer = plausibleBuffers.length
    ? plausibleBuffers[Math.floor(plausibleBuffers.length / 2)]
    : null;
  const monthlyEssential = workerObligations
    .filter((item) => item.essential === "1")
    .reduce(
      (total, item) =>
        total + number(item.amount_cad) * (item.frequency === "biweekly" ? 26 / 12 : 1),
      0,
    );
  const rent = workerObligations.find((item) => item.category === "housing");

  return {
    id: worker.worker_id,
    city: worker.city,
    occupation: worker.occupation,
    payType: worker.pay_type,
    dailyNet: number(worker.typical_daily_net_cad),
    volatility: number(worker.income_volatility),
    tipShare: number(worker.tip_share),
    householdSize: number(worker.household_size),
    dependents: number(worker.dependents),
    banked: worker.has_bank_account === "1",
    prepaid: worker.uses_prepaid_card === "1",
    sideGig: worker.has_side_gig === "1",
    commute: worker.commute_mode,
    rentBurden: worker.rent_burden_band,
    workingDays: workerEarnings.length,
    observedNet: sum(workerEarnings, "net_pay_cad"),
    sameDayPct: workerEarnings.length
      ? (workerEarnings.filter((item) => item.paid_same_day === "1").length /
          workerEarnings.length) *
        100
      : 0,
    paymentMethods: countBy(workerEarnings, "pay_method"),
    monthlyEssential,
    rent: rent ? number(rent.amount_cad) : 0,
    obligationCount: workerObligations.length,
    advanceCount: workerAdvances.length,
    advanceTotal: sum(workerAdvances, "amount_cad"),
    advanceFees: sum(workerAdvances, "fee_cad"),
    outstandingAdvances: workerAdvances.filter((item) => item.status === "outstanding").length,
    advanceReasons: countBy(workerAdvances, "reason_code"),
    negativeWeeks: workerWeeks.filter((item) => item.negative_balance_flag === "1").length,
    lowBufferWeeks: workerWeeks.filter(
      (item) =>
        item.buffer_days_estimate !== "" &&
        number(item.buffer_days_estimate) >= 0 &&
        number(item.buffer_days_estimate) < 3,
    ).length,
    observedWeeks: workerWeeks.length,
    medianBuffer,
    weekly: workerWeeks.map((item) => ({
      date: item.week_start,
      income: number(item.income_cad),
      expense: number(item.expense_cad),
      essential: number(item.essential_expense_cad),
      net: number(item.net_cashflow_cad),
    })),
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  coverage: {
    earningsStart: earnings.reduce(
      (earliest, row) => (row.work_date < earliest ? row.work_date : earliest),
      earnings[0].work_date,
    ),
    earningsEnd: earnings.reduce(
      (latest, row) => (row.work_date > latest ? row.work_date : latest),
      earnings[0].work_date,
    ),
  },
  counts: {
    workers: workers.length,
    earnings: earnings.length,
    transactions: 31726,
    obligations: obligations.length,
    advances: advances.length,
    weeks: weekly.length,
  },
  filters: {
    cities: [...new Set(workers.map((worker) => worker.city))].sort(),
    occupations: [...new Set(workers.map((worker) => worker.occupation))].sort(),
    payTypes: [...new Set(workers.map((worker) => worker.pay_type))].sort(),
    rentBurdens: ["low", "moderate", "high", "severe"],
  },
  workers: profiles,
};

await writeFile(
  path.join(root, "app", "clientele-data.json"),
  `${JSON.stringify(output)}\n`,
);

console.log(`Built ${profiles.length} worker profiles.`);
