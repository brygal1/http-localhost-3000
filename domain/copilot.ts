import type { Confidence } from "@/domain/money";
import { formatCadWhole } from "@/domain/money";
import type { CopilotAnswer, DecisionSnapshot } from "@/domain/types";

function coverageLabel(probability: number): string {
  if (probability >= 0.75) return "likely on track";
  if (probability >= 0.5) return "possible with a careful plan";
  return "under pressure";
}

function gapPhrase(gapCents: number): string {
  if (gapCents >= 0) {
    return `about ${formatCadWhole(gapCents)} of cushion in the next two weeks`;
  }
  return `about ${formatCadWhole(Math.abs(gapCents))} short over the next two weeks`;
}

/**
 * Deterministic template fallback. Uses only DecisionSnapshot numbers —
 * never invents fees, balances, or probabilities.
 */
export function buildFallbackAnswer(input: {
  question: string;
  snapshot: DecisionSnapshot;
  baseline?: DecisionSnapshot;
}): CopilotAnswer {
  const { snapshot, baseline } = input;
  const question = input.question.toLowerCase();
  const dayOff =
    /tomorrow|day off|take .*off|miss(ed)? (a )?shift|skip/.test(question);
  const advance = /advance|earned.?wage|payday loan|cash out/.test(question);
  const confidence: Confidence = snapshot.confidence;

  if (dayOff) {
    const worsened =
      baseline &&
      snapshot.projectedGapCents < baseline.projectedGapCents;
    const directAnswer =
      snapshot.coverageProbability >= 0.55 && snapshot.projectedGapCents >= -15_000
        ? `You can take tomorrow off if you protect rent and use your smoothing wallet carefully.`
        : `Taking tomorrow off is risky for rent unless you apply smoothing support and recover quickly.`;

    const consequence = baseline
      ? `Rent still needs ${formatCadWhole(snapshot.rentRemainingCents)} in ${snapshot.rentDueInDays} days (about ${snapshot.workdaysRemaining} typical workdays). The forecast moves from ${gapPhrase(baseline.projectedGapCents)} to ${gapPhrase(snapshot.projectedGapCents)}${worsened ? " without a recovery plan" : ""}.`
      : `Rent still needs ${formatCadWhole(snapshot.rentRemainingCents)} (${snapshot.workdaysRemaining} typical workdays). Coverage looks ${coverageLabel(snapshot.coverageProbability)}.`;

    const nextAction =
      snapshot.smoothingBalanceCents > 0
        ? `Apply a simulated smoothing-wallet offset, then prioritize your next ${Math.max(1, snapshot.workdaysRemaining)} workdays for rent before any free spending.`
        : `Keep Safe to Spend at ${formatCadWhole(snapshot.safeToSpendCents)}, protect the ${formatCadWhole(snapshot.protectedCents)} set aside for essentials, and bank the next strong day into smoothing instead of taking an advance.`;

    return {
      directAnswer,
      consequence,
      nextAction,
      confidence,
      assumptions: snapshot.assumptions,
      source: "fallback",
    };
  }

  if (advance) {
    return {
      directAnswer:
        "An advance should be a last resort after smoothing and schedule recovery.",
      consequence: `You already have ${formatCadWhole(snapshot.outstandingAdvanceCents)} outstanding advances and ${formatCadWhole(snapshot.paidAdvanceFeesCents)} in repaid advance fees on record. Fees shrink what reaches rent.`,
      nextAction: `Use Safe to Spend (${formatCadWhole(snapshot.safeToSpendCents)}) and your smoothing wallet (${formatCadWhole(snapshot.smoothingBalanceCents)}) first. Only model an advance if the rent gap remains after that.`,
      confidence,
      assumptions: snapshot.assumptions,
      source: "fallback",
    };
  }

  return {
    directAnswer: `Safe to Spend today is ${formatCadWhole(snapshot.safeToSpendCents)} — not your full ${formatCadWhole(snapshot.balanceCents)} balance.`,
    consequence: `${formatCadWhole(snapshot.protectedCents)} is protected for upcoming essentials, with ${formatCadWhole(snapshot.smoothingBalanceCents)} in your Income Smoothing Wallet. Rent needs ${formatCadWhole(snapshot.rentRemainingCents)} in ${snapshot.rentDueInDays} days (about ${snapshot.workdaysRemaining} typical workdays). Coverage looks ${coverageLabel(snapshot.coverageProbability)}.`,
    nextAction:
      snapshot.projectedGapCents < 0
        ? `Treat free spending as paused, keep the smoothing wallet ready for a thin day, and aim your next workdays at closing ${formatCadWhole(Math.abs(snapshot.projectedGapCents))} of projected gap.`
        : `Keep contributions flowing into smoothing after strong days so a day off does not force an advance.`,
    confidence,
    assumptions: snapshot.assumptions,
    source: "fallback",
  };
}

export async function explainWithOptionalAi(input: {
  question: string;
  snapshot: DecisionSnapshot;
  baseline?: DecisionSnapshot;
}): Promise<CopilotAnswer> {
  const fallback = buildFallbackAnswer(input);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are ShiftAhead's Cashflow Copilot for variable-income workers.
Explain calculated results only. Never invent balances, fees, probabilities, or obligations.
Never shame the worker. Prefer smoothing and schedule recovery before advances.
Return JSON with keys: directAnswer, consequence, nextAction, confidence, assumptions.
confidence must be "low", "moderate", or "high".
assumptions must be an array of strings copied or lightly rephrased from the snapshot assumptions.
Use only numbers present in the DecisionSnapshot.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              question: input.question,
              snapshot: input.snapshot,
              baseline: input.baseline ?? null,
            }),
          },
        ],
      }),
    });

    if (!response.ok) return fallback;
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return fallback;
    const parsed = JSON.parse(content) as Partial<CopilotAnswer>;
    if (
      !parsed.directAnswer ||
      !parsed.consequence ||
      !parsed.nextAction ||
      !parsed.confidence ||
      !Array.isArray(parsed.assumptions)
    ) {
      return fallback;
    }
    return {
      directAnswer: parsed.directAnswer,
      consequence: parsed.consequence,
      nextAction: parsed.nextAction,
      confidence: parsed.confidence,
      assumptions: parsed.assumptions,
      source: "ai",
    };
  } catch {
    return fallback;
  }
}
