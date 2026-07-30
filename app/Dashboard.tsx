"use client";

import { useMemo, useState } from "react";
import dataset from "./clientele-data.json";

type Worker = (typeof dataset.workers)[number];
type FilterKey = "city" | "occupation" | "payType" | "rentBurden";

const money = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const compactMoney = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });

const burdenRank: Record<string, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  severe: 3,
};

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function pct(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function riskScore(worker: Worker) {
  return (
    burdenRank[worker.rentBurden] * 20 +
    worker.volatility * 55 +
    worker.advanceCount * 5 +
    worker.negativeWeeks * 8 +
    (worker.banked ? 0 : 12) +
    (worker.dependents ? 5 : 0)
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "plain",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "plain" | "acid" | "coral";
}) {
  return (
    <article className={`metric metric--${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {values.map((item) => (
          <option value={item} key={item}>
            {titleCase(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Dashboard() {
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    city: "all",
    occupation: "all",
    payType: "all",
    rentBurden: "all",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      dataset.workers.filter((worker) =>
        (Object.entries(filters) as [FilterKey, string][]).every(
          ([key, value]) => value === "all" || worker[key] === value,
        ),
      ),
    [filters],
  );

  const summary = useMemo(() => {
    const highBurden = filtered.filter((worker) =>
      ["high", "severe"].includes(worker.rentBurden),
    ).length;
    const advanceUsers = filtered.filter((worker) => worker.advanceCount > 0).length;
    const unbankedOrPrepaid = filtered.filter(
      (worker) => !worker.banked || worker.prepaid,
    ).length;
    const withDependents = filtered.filter((worker) => worker.dependents > 0).length;
    const highVolatility = filtered.filter((worker) => worker.volatility >= 0.45).length;
    return {
      highBurden,
      advanceUsers,
      unbankedOrPrepaid,
      withDependents,
      highVolatility,
      medianDailyNet: median(filtered.map((worker) => worker.dailyNet)),
      medianSameDay: median(filtered.map((worker) => worker.sameDayPct)),
      totalAdvances: filtered.reduce((total, worker) => total + worker.advanceCount, 0),
      advanceFees: filtered.reduce((total, worker) => total + worker.advanceFees, 0),
    };
  }, [filtered]);

  const occupationRows = useMemo(() => {
    const grouped = new Map<string, Worker[]>();
    filtered.forEach((worker) => {
      grouped.set(worker.occupation, [...(grouped.get(worker.occupation) || []), worker]);
    });
    return [...grouped.entries()]
      .map(([occupation, workers]) => ({
        occupation,
        count: workers.length,
        dailyNet: median(workers.map((worker) => worker.dailyNet)),
        volatility: workers.reduce((sum, worker) => sum + worker.volatility, 0) / workers.length,
        advanceRate: pct(
          workers.filter((worker) => worker.advanceCount > 0).length,
          workers.length,
        ),
        pressureRate: pct(
          workers.filter((worker) => ["high", "severe"].includes(worker.rentBurden))
            .length,
          workers.length,
        ),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  const advanceReasons = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((worker) => {
      Object.entries(worker.advanceReasons).forEach(([reason, count]) => {
        counts[reason] = (counts[reason] || 0) + count;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const payTypes = useMemo(
    () =>
      dataset.filters.payTypes.map((payType) => ({
        payType,
        count: filtered.filter((worker) => worker.payType === payType).length,
      })),
    [filtered],
  );

  const weekly = useMemo(() => {
    const dates = new Map<string, { net: number; count: number }>();
    filtered.forEach((worker) =>
      worker.weekly.forEach((week) => {
        const current = dates.get(week.date) || { net: 0, count: 0 };
        dates.set(week.date, {
          net: current.net + week.net,
          count: current.count + 1,
        });
      }),
    );
    return [...dates.entries()]
      .map(([date, value]) => ({ date, net: value.net / value.count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const selected =
    filtered.find((worker) => worker.id === selectedId) ||
    [...filtered].sort((a, b) => riskScore(b) - riskScore(a))[0] ||
    null;

  const maxOccupation = Math.max(1, ...occupationRows.map((row) => row.count));
  const maxReason = Math.max(1, ...advanceReasons.map(([, count]) => count));
  const maxWeekly = Math.max(1, ...weekly.map((week) => Math.abs(week.net)));
  const topPressureOccupation = [...occupationRows].sort(
    (a, b) => b.advanceRate + b.pressureRate - (a.advanceRate + a.pressureRate),
  )[0];

  function setFilter(key: FilterKey, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setSelectedId(null);
  }

  function clearFilters() {
    setFilters({
      city: "all",
      occupation: "all",
      payType: "all",
      rentBurden: "all",
    });
    setSelectedId(null);
  }

  return (
    <main>
      <header className="topbar">
        <a href="#top" className="brand" aria-label="Daily Earnings Atlas home">
          <span className="brand-mark">DEA</span>
          <span>Daily Earnings Atlas</span>
        </a>
        <div className="coverage">
          <span className="live-dot" />
          Sample window: Apr–Jun 2026
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">CLIENTELE EXPLORER / ALBERTA</div>
        <h1>
          Who earns daily—
          <br />
          and where does <em>pressure</em> show up?
        </h1>
        <div className="hero-foot">
          <p>
            Explore the lives behind variable income. Filter the cohort, compare
            occupations, and trace the signals that precede a cash shortfall.
          </p>
          <div className="source-count">
            <strong>{dataset.counts.workers}</strong>
            <span>worker profiles</span>
            <small>{whole.format(dataset.counts.transactions)} transactions observed</small>
          </div>
        </div>
      </section>

      <section className="filterbar" aria-label="Cohort filters">
        <div className="filter-heading">
          <span>COHORT LENS</span>
          <strong>{filtered.length} people</strong>
        </div>
        <FilterSelect
          label="City"
          value={filters.city}
          values={dataset.filters.cities}
          onChange={(value) => setFilter("city", value)}
        />
        <FilterSelect
          label="Occupation"
          value={filters.occupation}
          values={dataset.filters.occupations}
          onChange={(value) => setFilter("occupation", value)}
        />
        <FilterSelect
          label="Pay model"
          value={filters.payType}
          values={dataset.filters.payTypes}
          onChange={(value) => setFilter("payType", value)}
        />
        <FilterSelect
          label="Rent burden"
          value={filters.rentBurden}
          values={dataset.filters.rentBurdens}
          onChange={(value) => setFilter("rentBurden", value)}
        />
        <button className="reset" type="button" onClick={clearFilters}>
          Reset
        </button>
      </section>

      {filtered.length ? (
        <>
          <section className="metrics" aria-label="Cohort summary">
            <Metric
              label="Typical take-home"
              value={`${money.format(summary.medianDailyNet)}/day`}
              detail="Median reported daily net"
              tone="acid"
            />
            <Metric
              label="Housing pressure"
              value={`${pct(summary.highBurden, filtered.length)}%`}
              detail="High or severe rent burden"
            />
            <Metric
              label="Advance reliance"
              value={`${pct(summary.advanceUsers, filtered.length)}%`}
              detail={`${summary.totalAdvances} advances observed`}
              tone="coral"
            />
            <Metric
              label="Access friction"
              value={`${pct(summary.unbankedOrPrepaid, filtered.length)}%`}
              detail="Unbanked or using prepaid"
            />
          </section>

          <section className="insight-strip">
            <span className="insight-index">01</span>
            <p>
              <strong>{pct(summary.withDependents, filtered.length)}%</strong> support
              dependents, while <strong>{pct(summary.highVolatility, filtered.length)}%</strong>{" "}
              face high income volatility. In this cohort,{" "}
              <strong>{topPressureOccupation?.occupation}</strong> shows the strongest
              combined housing and advance pressure.
            </p>
          </section>

          <section className="dashboard-grid">
            <article className="panel pressure-panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">INCOME PRESSURE MAP</span>
                  <h2>Predictability vs. daily take-home</h2>
                </div>
                <div className="legend">
                  <span><i className="dot dot--coral" /> Used an advance</span>
                  <span><i className="dot dot--sage" /> No advance</span>
                </div>
              </div>
              <div className="scatter">
                <div className="axis-label axis-label--y">Higher daily net ↑</div>
                <div className="axis-label axis-label--x">More volatile →</div>
                <div className="scatter-grid">
                  {filtered.map((worker) => {
                    const left = Math.max(
                      2,
                      Math.min(98, ((worker.volatility - 0.15) / 0.45) * 100),
                    );
                    const top = Math.max(
                      3,
                      Math.min(95, 100 - ((worker.dailyNet - 90) / 150) * 100),
                    );
                    return (
                      <button
                        type="button"
                        key={worker.id}
                        className={`plot-dot ${
                          worker.advanceCount ? "plot-dot--advance" : ""
                        } ${selected?.id === worker.id ? "plot-dot--selected" : ""}`}
                        style={{ left: `${left}%`, top: `${top}%` }}
                        onClick={() => setSelectedId(worker.id)}
                        aria-label={`${worker.id}, ${worker.occupation}, ${money.format(
                          worker.dailyNet,
                        )} typical daily net`}
                        title={`${worker.id} · ${worker.occupation}`}
                      />
                    );
                  })}
                </div>
              </div>
              <p className="chart-note">
                Each dot is one worker. Select a dot to inspect the profile.
              </p>
            </article>

            <article className="panel composition-panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">HOW THEY’RE PAID</span>
                  <h2>Income model</h2>
                </div>
                <span className="big-index">02</span>
              </div>
              <div className="pay-composition">
                {payTypes.map((item, index) => (
                  <div className="pay-row" key={item.payType}>
                    <span className={`pay-swatch pay-swatch--${index}`} />
                    <strong>{titleCase(item.payType)}</strong>
                    <div className="bar-track">
                      <span
                        style={{ width: `${pct(item.count, filtered.length)}%` }}
                      />
                    </div>
                    <b>{pct(item.count, filtered.length)}%</b>
                  </div>
                ))}
              </div>
              <div className="micro-facts">
                <div>
                  <strong>{Math.round(summary.medianSameDay)}%</strong>
                  <span>median earnings paid same day</span>
                </div>
                <div>
                  <strong>{pct(summary.withDependents, filtered.length)}%</strong>
                  <span>support at least one dependent</span>
                </div>
              </div>
            </article>

            <article className="panel occupation-panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">OCCUPATION MIX</span>
                  <h2>Who is in the cohort?</h2>
                </div>
                <span className="panel-aside">Median net / day</span>
              </div>
              <div className="occupation-bars">
                {occupationRows.slice(0, 9).map((row) => (
                  <button
                    type="button"
                    className="occupation-row"
                    key={row.occupation}
                    onClick={() => setFilter("occupation", row.occupation)}
                  >
                    <span className="occupation-name">{row.occupation}</span>
                    <span className="occupation-track">
                      <i style={{ width: `${(row.count / maxOccupation) * 100}%` }} />
                    </span>
                    <strong>{row.count}</strong>
                    <b>{money.format(row.dailyNet)}</b>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel advance-panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">CASH GAP SIGNALS</span>
                  <h2>Why advances happen</h2>
                </div>
                <span className="fee-total">{money.format(summary.advanceFees)} in fees</span>
              </div>
              {advanceReasons.length ? (
                <div className="reason-list">
                  {advanceReasons.map(([reason, count]) => (
                    <div className="reason-row" key={reason}>
                      <span>{titleCase(reason)}</span>
                      <div className="reason-track">
                        <i style={{ width: `${(count / maxReason) * 100}%` }} />
                      </div>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-note">No advances in this filtered cohort.</p>
              )}
              <p className="chart-note">
                Reasons are self-reported at the time of request.
              </p>
            </article>

            <article className="panel cashflow-panel">
              <div className="panel-head">
                <div>
                  <span className="panel-kicker">THREE-MONTH RHYTHM</span>
                  <h2>Average weekly net cashflow</h2>
                </div>
                <span className="panel-aside">Above / below zero</span>
              </div>
              <div className="weekly-chart">
                {weekly.map((week) => {
                  const height = Math.max(4, (Math.abs(week.net) / maxWeekly) * 47);
                  return (
                    <div className="week-column" key={week.date}>
                      <span className="week-value">{compactMoney.format(week.net)}</span>
                      <i className="zero-line" />
                      <b
                        className={week.net >= 0 ? "positive" : "negative"}
                        style={{
                          height: `${height}%`,
                          bottom: week.net >= 0 ? "50%" : `calc(50% - ${height}%)`,
                        }}
                      />
                      <span className="week-label">
                        {new Date(`${week.date}T12:00:00`).toLocaleDateString("en-CA", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>

            {selected && (
              <article className="panel profile-panel" aria-live="polite">
                <div className="profile-top">
                  <div>
                    <span className="panel-kicker">WORKER PROFILE</span>
                    <h2>{selected.id}</h2>
                    <p>{selected.occupation} · {selected.city}</p>
                  </div>
                  <span className={`burden burden--${selected.rentBurden}`}>
                    {titleCase(selected.rentBurden)} rent burden
                  </span>
                </div>
                <div className="profile-number">
                  <strong>{money.format(selected.dailyNet)}</strong>
                  <span>typical daily take-home</span>
                </div>
                <dl className="profile-grid">
                  <div>
                    <dt>Pay model</dt>
                    <dd>{titleCase(selected.payType)}</dd>
                  </div>
                  <div>
                    <dt>Income volatility</dt>
                    <dd>{Math.round(selected.volatility * 100)}%</dd>
                  </div>
                  <div>
                    <dt>Monthly rent</dt>
                    <dd>{money.format(selected.rent)}</dd>
                  </div>
                  <div>
                    <dt>Dependents</dt>
                    <dd>{selected.dependents}</dd>
                  </div>
                  <div>
                    <dt>Advances</dt>
                    <dd>{selected.advanceCount}</dd>
                  </div>
                  <div>
                    <dt>Paid same day</dt>
                    <dd>{Math.round(selected.sameDayPct)}%</dd>
                  </div>
                </dl>
                <div className="profile-signal">
                  <span>What stands out</span>
                  <p>
                    {selected.advanceCount
                      ? `${selected.advanceCount} advance${
                          selected.advanceCount === 1 ? "" : "s"
                        } totaling ${money.format(selected.advanceTotal)} were recorded.`
                      : "No earned wage advances were recorded."}{" "}
                    Rent equals approximately{" "}
                    <strong>
                      {selected.dailyNet
                        ? (selected.rent / selected.dailyNet).toFixed(1)
                        : "0"}{" "}
                      typical workdays
                    </strong>
                    .
                  </p>
                </div>
              </article>
            )}
          </section>

          <section className="segment-table-section">
            <div className="section-heading">
              <div>
                <span className="panel-kicker">SEGMENT BENCHMARKS</span>
                <h2>Where product needs diverge</h2>
              </div>
              <p>Use these differences to choose who you are designing for first.</p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Occupation</th>
                    <th>People</th>
                    <th>Median daily net</th>
                    <th>Income volatility</th>
                    <th>Advance users</th>
                    <th>High rent pressure</th>
                  </tr>
                </thead>
                <tbody>
                  {occupationRows.map((row) => (
                    <tr key={row.occupation}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setFilter("occupation", row.occupation)}
                        >
                          {row.occupation}
                        </button>
                      </td>
                      <td>{row.count}</td>
                      <td>{money.format(row.dailyNet)}</td>
                      <td>{Math.round(row.volatility * 100)}%</td>
                      <td>{row.advanceRate}%</td>
                      <td>{row.pressureRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="takeaway">
            <span className="insight-index">03</span>
            <div>
              <span className="panel-kicker">PRODUCT OPPORTUNITY</span>
              <h2>Design for the next decision, not the last transaction.</h2>
              <p>
                This cohort’s challenge is timing: irregular earnings meet fixed,
                essential obligations. A useful product should translate upcoming bills
                into workdays, show what is safe today, and surface a likely gap before
                it becomes an advance request.
              </p>
            </div>
          </section>
        </>
      ) : (
        <section className="no-results">
          <strong>No workers match this combination.</strong>
          <p>Reset the cohort lens to continue exploring.</p>
          <button type="button" onClick={clearFilters}>Reset filters</button>
        </section>
      )}

      <footer>
        <div>
          <strong>Daily Earnings Atlas</strong>
          <span>Hackathon research prototype</span>
        </div>
        <p>
          Descriptive sample data, not a credit or eligibility model. Earnings cover{" "}
          {dataset.coverage.earningsStart} through {dataset.coverage.earningsEnd}.
          Worker IDs are synthetic identifiers.
        </p>
      </footer>
    </main>
  );
}
