"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  applyDayOffPlan,
  applySmoothingContribution,
  buildDecisionSnapshot,
  compareDayOffScenario,
  formatCad,
  formatCadWhole,
  initialSmoothingBalanceCents,
  lastEarningCents,
  protectedCents,
  recommendSmoothingContribution,
  seedExplanation,
  simulateAdvanceImpact,
} from "@/domain";
import { buildFallbackAnswer } from "@/domain/copilot";
import type { CopilotAnswer, DecisionSnapshot, WorkerProfile } from "@/domain/types";
import { workerLabel } from "@/data/repository";

const STORAGE_KEY = "shiftahead-sim-v1";

type StoredSim = {
  workerId: string;
  smoothingBalanceCents: number;
  appliedDayOff: boolean;
  appliedOffsetCents: number;
  contributionCents: number;
};

function defaultSim(workerId: string, seed: number): StoredSim {
  return {
    workerId,
    smoothingBalanceCents: seed,
    appliedDayOff: false,
    appliedOffsetCents: 0,
    contributionCents: 0,
  };
}

function loadSim(workerId: string, seed: number): StoredSim {
  if (typeof window === "undefined") return defaultSim(workerId, seed);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSim(workerId, seed);
    const parsed = JSON.parse(raw) as StoredSim;
    if (parsed.workerId !== workerId) return defaultSim(workerId, seed);
    return parsed;
  } catch {
    return defaultSim(workerId, seed);
  }
}

export default function ShiftAheadApp({
  workers,
  defaultWorkerId,
}: {
  workers: WorkerProfile[];
  defaultWorkerId: string;
}) {
  const [workerId, setWorkerId] = useState(defaultWorkerId);
  const worker = workers.find((item) => item.id === workerId) ?? workers[0]!;

  return (
    <main className="sa">
      <div className="sa-glow" aria-hidden="true" />
      <header className="sa-top">
        <div className="sa-brand">
          <span className="sa-mark">SA</span>
          <div>
            <p className="sa-product">ShiftAhead</p>
            <p className="sa-tag">Safe today · rent still covered</p>
          </div>
        </div>
        <Link className="sa-research" href="/research">
          Research atlas
        </Link>
      </header>

      <section className="sa-shell">
        <label className="sa-profile">
          <span>Worker profile</span>
          <select
            value={worker.id}
            onChange={(event) => setWorkerId(event.target.value)}
            aria-label="Select sample worker profile"
          >
            {workers.map((item) => (
              <option key={item.id} value={item.id}>
                {workerLabel(item)} ({item.id})
              </option>
            ))}
          </select>
        </label>

        <p className="sa-context">
          {worker.occupation} in {worker.city} · {worker.payType} pay ·{" "}
          {worker.dependents
            ? `${worker.dependents} dependent${worker.dependents > 1 ? "s" : ""}`
            : "no dependents"}{" "}
          · as of {worker.asOfDate}
        </p>

        <WorkerExperience key={worker.id} worker={worker} />
      </section>
    </main>
  );
}

function WorkerExperience({ worker }: { worker: WorkerProfile }) {
  const seed = initialSmoothingBalanceCents(worker);
  const [sim, setSim] = useState<StoredSim>(() => loadSim(worker.id, seed));
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [contribution, setContribution] = useState(() => {
    const protectedAmount = protectedCents(worker);
    const available = Math.max(
      0,
      worker.balanceCents - protectedAmount - seed,
    );
    return recommendSmoothingContribution({
      worker,
      lastEarningCents: lastEarningCents(worker),
      availableAfterProtectionCents: available,
      currentSmoothingCents: seed,
    }).recommendedContributionCents;
  });
  const [copilotQuestion, setCopilotQuestion] = useState(
    "I need tomorrow off. Can I afford it?",
  );
  const [copilotAnswer, setCopilotAnswer] = useState<CopilotAnswer | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sim));
  }, [sim]);

  const baseline = useMemo(
    () =>
      buildDecisionSnapshot({
        worker,
        smoothingBalanceCents: sim.smoothingBalanceCents,
        scenarioLabel: "Today",
      }),
    [worker, sim.smoothingBalanceCents],
  );

  const dayOff = useMemo(
    () =>
      compareDayOffScenario({
        worker,
        smoothingBalanceCents: sim.smoothingBalanceCents,
      }),
    [worker, sim.smoothingBalanceCents],
  );

  const activeSnapshot: DecisionSnapshot = useMemo(() => {
    if (sim.appliedDayOff) {
      return buildDecisionSnapshot({
        worker,
        smoothingBalanceCents: sim.smoothingBalanceCents,
        missedIncomeCents: dayOff.missedIncomeCents,
        smoothingOffsetCents: sim.appliedOffsetCents,
        scenarioLabel: "Applied recovery plan",
      });
    }
    if (scenarioOpen) return dayOff.withoutSmoothing;
    return baseline;
  }, [baseline, dayOff, scenarioOpen, sim, worker]);

  const recommendation = useMemo(() => {
    const available = Math.max(
      0,
      worker.balanceCents -
        protectedCents(worker) -
        sim.smoothingBalanceCents,
    );
    return recommendSmoothingContribution({
      worker,
      lastEarningCents: lastEarningCents(worker),
      availableAfterProtectionCents: available,
      currentSmoothingCents: sim.smoothingBalanceCents,
    });
  }, [worker, sim.smoothingBalanceCents]);

  const advance = useMemo(
    () =>
      simulateAdvanceImpact({
        worker,
        smoothingBalanceCents: sim.smoothingBalanceCents,
        requestedCents: Math.max(10_000, Math.round(dayOff.missedIncomeCents)),
      }),
    [worker, sim.smoothingBalanceCents, dayOff.missedIncomeCents],
  );

  function askCopilot(
    question: string,
    snapshot: DecisionSnapshot,
    baselineSnap?: DecisionSnapshot,
  ) {
    startTransition(async () => {
      try {
        const response = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            snapshot,
            baseline: baselineSnap,
          }),
        });
        if (!response.ok) throw new Error("copilot unavailable");
        const payload = (await response.json()) as { answer: CopilotAnswer };
        setCopilotAnswer(payload.answer);
      } catch {
        setCopilotAnswer(
          buildFallbackAnswer({
            question,
            snapshot,
            baseline: baselineSnap,
          }),
        );
      }
    });
  }

  function runDayOffQuestion() {
    setScenarioOpen(true);
    setCopilotQuestion("I need tomorrow off. Can I afford it?");
    askCopilot(
      "I need tomorrow off. Can I afford it?",
      dayOff.withoutSmoothing,
      baseline,
    );
  }

  function applyRecovery() {
    const plan = applyDayOffPlan({
      worker,
      smoothingBalanceCents: sim.smoothingBalanceCents,
    });
    setSim((current) => ({
      ...current,
      smoothingBalanceCents: plan.smoothingBalanceCents,
      appliedDayOff: true,
      appliedOffsetCents: plan.offsetCents,
    }));
    setScenarioOpen(true);
    askCopilot(
      "I applied the smoothing recovery plan after taking tomorrow off. What changed?",
      plan.snapshot,
      dayOff.withoutSmoothing,
    );
  }

  function bankContribution() {
    const amount = Math.min(
      contribution,
      recommendation.maxContributionCents,
    );
    setSim((current) => ({
      ...current,
      smoothingBalanceCents: applySmoothingContribution(
        current.smoothingBalanceCents,
        amount,
      ),
      contributionCents: current.contributionCents + amount,
    }));
  }

  function resetSimulation() {
    setSim(defaultSim(worker.id, seed));
    setScenarioOpen(false);
    setShowAdvance(false);
    setCopilotAnswer(null);
    setContribution(recommendation.recommendedContributionCents);
  }

  const coveragePct = Math.round(activeSnapshot.coverageProbability * 100);
  const gapLabel =
    activeSnapshot.projectedGapCents >= 0
      ? `${formatCadWhole(activeSnapshot.projectedGapCents)} cushion`
      : `${formatCadWhole(Math.abs(activeSnapshot.projectedGapCents))} short`;

  return (
    <>
      <section className="sa-hero" aria-labelledby="safe-to-spend-heading">
        <p className="sa-kicker">Safe to Spend Today</p>
        <h1 id="safe-to-spend-heading" className="sa-primary">
          {formatCadWhole(activeSnapshot.safeToSpendCents)}
        </h1>
        <p className="sa-hero-copy">
          Not your full balance. {formatCadWhole(activeSnapshot.protectedCents)}{" "}
          is protected for upcoming essentials, and{" "}
          {formatCadWhole(activeSnapshot.smoothingBalanceCents)} sits in your
          Income Smoothing Wallet.
        </p>
        <div className="sa-ledger" role="list">
          <div role="listitem">
            <span>Balance</span>
            <strong>{formatCad(activeSnapshot.balanceCents)}</strong>
          </div>
          <div role="listitem">
            <span>Protected</span>
            <strong>{formatCad(activeSnapshot.protectedCents)}</strong>
          </div>
          <div role="listitem">
            <span>Smoothing</span>
            <strong>{formatCad(activeSnapshot.smoothingBalanceCents)}</strong>
          </div>
          <div role="listitem" className="sa-ledger-safe">
            <span>Safe to Spend</span>
            <strong>{formatCad(activeSnapshot.safeToSpendCents)}</strong>
          </div>
        </div>
      </section>

      <section className="sa-panel" aria-labelledby="rent-runway-heading">
        <div className="sa-panel-head">
          <div>
            <p className="sa-kicker">Rent Runway</p>
            <h2 id="rent-runway-heading">
              {formatCadWhole(activeSnapshot.rentRemainingCents)} left
            </h2>
          </div>
          <div className="sa-pill" aria-label="Rent due timing">
            Due in {activeSnapshot.rentDueInDays} days
          </div>
        </div>
        <div className="sa-runway-grid">
          <article>
            <span>Typical workdays needed</span>
            <strong>{activeSnapshot.workdaysRemaining}</strong>
          </article>
          <article>
            <span>Expected daily net</span>
            <strong>{formatCadWhole(activeSnapshot.expectedDailyNetCents)}</strong>
          </article>
          <article>
            <span>Coverage outlook</span>
            <strong>{coveragePct}%</strong>
          </article>
          <article>
            <span>14-day cash gap</span>
            <strong>{gapLabel}</strong>
          </article>
        </div>
        <p className="sa-note">
          Expected near-term income range{" "}
          {formatCadWhole(activeSnapshot.expectedIncomeLowCents)}–
          {formatCadWhole(activeSnapshot.expectedIncomeHighCents)}. Estimates,
          not guarantees · confidence {activeSnapshot.confidence}.
        </p>
      </section>

      <section className="sa-panel sa-action" aria-labelledby="day-off-heading">
        <p className="sa-kicker">What if</p>
        <h2 id="day-off-heading">Can I take tomorrow off?</h2>
        <p className="sa-copy">
          Missing about {formatCadWhole(dayOff.missedIncomeCents)} of expected
          earnings. Smoothing can offset{" "}
          {formatCadWhole(dayOff.smoothingOffsetCents)} in this simulation.
        </p>
        <div className="sa-compare">
          <div>
            <span>Without support</span>
            <strong>
              {dayOff.withoutSmoothing.projectedGapCents >= 0 ? "+" : "−"}
              {formatCadWhole(Math.abs(dayOff.withoutSmoothing.projectedGapCents))}
            </strong>
            <em>{dayOff.withoutSmoothing.workdaysRemaining} workdays to rent</em>
          </div>
          <div className="sa-compare-better">
            <span>With smoothing</span>
            <strong>
              {dayOff.withSmoothing.projectedGapCents >= 0 ? "+" : "−"}
              {formatCadWhole(Math.abs(dayOff.withSmoothing.projectedGapCents))}
            </strong>
            <em>{dayOff.withSmoothing.workdaysRemaining} workdays to rent</em>
          </div>
        </div>
        <div className="sa-actions">
          <button
            type="button"
            className="sa-btn sa-btn-primary"
            onClick={runDayOffQuestion}
          >
            Ask the Copilot
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-secondary"
            onClick={applyRecovery}
            disabled={dayOff.smoothingOffsetCents <= 0 && !sim.appliedDayOff}
          >
            Apply recovery plan
          </button>
        </div>
        {sim.appliedDayOff ? (
          <p className="sa-success" role="status">
            Simulated plan applied: {formatCadWhole(sim.appliedOffsetCents)} from
            smoothing used toward the missed day. Rent runway updated.
          </p>
        ) : null}
      </section>

      <section className="sa-panel" aria-labelledby="smoothing-heading">
        <p className="sa-kicker">Income Smoothing Wallet</p>
        <h2 id="smoothing-heading">
          {formatCadWhole(sim.smoothingBalanceCents)}
        </h2>
        <p className="sa-copy">{seedExplanation(worker, seed)}</p>
        <p className="sa-copy">{recommendation.reason}</p>
        <label className="sa-slider">
          <span>
            Suggested contribution after latest earning (
            {formatCadWhole(lastEarningCents(worker))})
          </span>
          <input
            type="range"
            min={recommendation.minContributionCents}
            max={Math.max(
              recommendation.maxContributionCents,
              recommendation.minContributionCents,
            )}
            step={100}
            value={contribution}
            onChange={(event) => setContribution(Number(event.target.value))}
            aria-valuetext={formatCadWhole(contribution)}
          />
          <strong>{formatCadWhole(contribution)}</strong>
        </label>
        <div className="sa-actions">
          <button
            type="button"
            className="sa-btn sa-btn-secondary"
            onClick={bankContribution}
          >
            Bank into smoothing
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-ghost"
            onClick={resetSimulation}
          >
            Reset simulation
          </button>
        </div>
        <p className="sa-note">
          Simulated reserve only — never spends money already protected for rent
          and essentials.
        </p>
      </section>

      <section className="sa-panel sa-copilot" aria-labelledby="copilot-heading">
        <p className="sa-kicker">AI Cashflow Copilot</p>
        <h2 id="copilot-heading">Grounded in your numbers</h2>
        <label className="sa-ask">
          <span>Ask a cash-timing question</span>
          <textarea
            value={copilotQuestion}
            onChange={(event) => setCopilotQuestion(event.target.value)}
            rows={3}
          />
        </label>
        <div className="sa-actions">
          <button
            type="button"
            className="sa-btn sa-btn-primary"
            disabled={pending}
            onClick={() => askCopilot(copilotQuestion, activeSnapshot, baseline)}
          >
            {pending ? "Thinking…" : "Explain this"}
          </button>
          <button
            type="button"
            className="sa-btn sa-btn-ghost"
            onClick={() => {
              setCopilotQuestion("I need tomorrow off. Can I afford it?");
              runDayOffQuestion();
            }}
          >
            Use day-off prompt
          </button>
        </div>
        {copilotAnswer ? (
          <article className="sa-answer" aria-live="polite">
            <p className="sa-answer-direct">{copilotAnswer.directAnswer}</p>
            <p>
              <span>Consequence</span>
              {copilotAnswer.consequence}
            </p>
            <p>
              <span>Next action</span>
              {copilotAnswer.nextAction}
            </p>
            <p className="sa-note">
              Confidence {copilotAnswer.confidence} · source{" "}
              {copilotAnswer.source === "ai" ? "live model" : "offline fallback"}
            </p>
            <ul>
              {copilotAnswer.assumptions.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ) : (
          <p className="sa-note">
            The Copilot explains calculated results only. It does not invent
            amounts or move money.
          </p>
        )}
      </section>

      <section className="sa-panel" aria-labelledby="advance-heading">
        <div className="sa-panel-head">
          <div>
            <p className="sa-kicker">Advance impact</p>
            <h2 id="advance-heading">Compare before borrowing</h2>
          </div>
          <button
            type="button"
            className="sa-btn sa-btn-ghost"
            onClick={() => setShowAdvance((value) => !value)}
            aria-expanded={showAdvance}
          >
            {showAdvance ? "Hide" : "Show"} scenario
          </button>
        </div>
        {showAdvance ? (
          <>
            <p className="sa-copy">
              A simulated {formatCadWhole(advance.requestedCents)} advance would
              add {formatCadWhole(advance.feeCents)} in fees. Next earnings would
              repay about {formatCadWhole(advance.totalRepayCents)}.
            </p>
            <p className="sa-note">
              Paid advance fees on record:{" "}
              {formatCadWhole(worker.paidAdvanceFeesCents)}. Prefer smoothing and
              schedule recovery first.
            </p>
          </>
        ) : (
          <p className="sa-note">
            Optional after the core loop — shows fee and repayment haircut using
            repaid advances as the fee proxy.
          </p>
        )}
      </section>

      <footer className="sa-footer">
        <p>
          ShiftAhead is a hackathon prototype using sample Clientèle data. All
          wallet moves are simulated.
        </p>
        <Link href="/research">See the Daily Earnings Atlas research view</Link>
      </footer>
    </>
  );
}
