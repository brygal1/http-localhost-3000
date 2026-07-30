# ADR 0001: ShiftAhead hackathon product and architecture

- **Status:** Accepted
- **Date:** 2026-07-29
- **Decision owners:** Hackathon team
- **Time horizon:** Hackathon prototype

## Decision summary

We will build **ShiftAhead**, a mobile-first cash-timing tool for workers with
variable daily income.

The product will answer one central question:

> What is safe today, and what needs to happen next so rent is still covered?

The core demo will combine:

1. Safe to Spend Today
2. Rent Runway expressed in dollars and workdays
3. A 7–14 day cash-gap forecast
4. A “Can I take tomorrow off?” scenario
5. A simulated Income Smoothing Wallet
6. An AI Cashflow Copilot that explains deterministic calculations

We will optimize for a complete, memorable two-minute demo. We will not build
production banking infrastructure, a general-purpose budgeting platform, or
long-term operational tooling.

## Context

The event prompt asks us to go beyond money-in/money-out budgeting and design
for a worker who earns daily.

The supplied sample contains:

- 220 workers
- 12,204 daily earning records
- 31,726 transactions
- 849 recurring obligations
- 535 earned-wage advances

Our analysis found:

- Housing is the largest category in the worst cashflow week for 212 of 220
  workers, approximately 96%.
- The median worker's worst weekly net cashflow is approximately **-$1,343**.
- Negative weeks are dominated by fixed and essential costs: housing,
  childcare, groceries, remittances, debt payments, and transit.
- Repaid advances contain **$1,231.47** in fees. These fees are a symptom of
  timing pressure, but they are smaller than the underlying housing drawdowns.
- The core problem is not mainly retrospective overspending. It is the collision
  between unpredictable earnings and large, predictable obligations.

Traditional budgeting charts therefore do not address the highest-value
decision. A worker needs to know whether today's choice threatens a future
essential payment and how to recover before needing an advance.

## Judging strategy

The build will deliberately target the published scoring criteria.

| Criterion | Weight | Product response |
| --- | ---: | --- |
| Innovation & Originality | 25% | Translate rent into workdays, smooth irregular earnings, and answer day-off questions using the worker's actual history |
| Technical Execution | 25% | Deterministic cashflow engine, scenario comparison, uncertainty ranges, and schema-grounded AI explanations |
| Functional Completeness | 20% | One complete loop from earnings to forecast to decision to revised plan |
| Problem–Solution Fit | 20% | Directly address the dataset's dominant pain: rent and essential bills colliding with variable income |
| UX & Design | 5% | Polished mobile-first experience with one clear primary number and plain language |
| Learning & Ambition | 5% | Combine financial modeling, income smoothing, scenario simulation, and grounded generative AI |

We will not sacrifice the first 90% of the score to chase infrastructure that
judges will not see.

## Product decision

### Primary user

A worker paid daily, hourly, or through gig work whose income varies while rent
and essential obligations remain fixed.

The worker may have dependents, work-related transit or childcare costs, delayed
payment methods, and prior earned-wage advances.

### Job to be done

> When my income changes day by day, help me understand what I can safely use
> now and what I need to earn or protect before my next essential bill.

### Core product loop

1. The worker opens ShiftAhead and selects or receives a sample profile.
2. The app shows balance, protected funds, smoothing balance, and Safe to Spend.
3. Rent Runway shows the amount remaining and the typical workdays required.
4. The worker asks, “I need tomorrow off. Can I afford it?”
5. The deterministic engine calculates the before-and-after scenario.
6. The Income Smoothing Wallet offsets part of the missed income.
7. The AI explains the consequence and proposes a short recovery plan.
8. The worker applies the simulated plan and sees the runway update.

This loop must work without the AI. AI improves comprehension; it is not the
owner of the financial answer.

## Required features

### 1. Safe to Spend Today

Show:

- Current balance
- Amount protected for upcoming essential obligations
- Income Smoothing Wallet balance
- Safe-to-spend amount
- A short explanation of the calculation

The raw account balance must never be presented as fully spendable.

### 2. Rent Runway

Show:

- Rent amount and due date
- Amount protected
- Amount remaining
- Calendar days remaining
- Typical workdays remaining
- Expected coverage range or confidence

Rent is the primary visual obligation because it is the dominant drawdown in
the sample data.

### 3. Cash-gap forecast

Use recent earnings, working-day history, upcoming obligations, outstanding
advance impact, and the worker's income-volatility field to estimate the next
7–14 days.

The output must contain a range and assumptions. It must not imply certainty.

### 4. What-if simulator

The required scenario is:

> Can I take tomorrow off?

Optional preset scenarios, if time allows:

- Earn less tonight
- Add a workday
- Buy groceries
- Pay an unexpected bill
- Take an advance

Scenarios remain temporary until the user applies them.

### 5. Income Smoothing Wallet

Simulate a separate reserve that:

- Receives more after a strong earning day
- Receives less after a weak earning day
- Can cover part of a future low-income or no-income day
- Never consumes money already protected for essential obligations

The app will recommend an allocation after an earning event. The user may
approve or adjust it. No real money movement is in scope.

### 6. AI Cashflow Copilot

The AI will answer plain-language questions using a calculated snapshot.

It may:

- Explain the result
- Compare two scenarios
- Translate dollars into workdays
- Name the largest consequence
- Recommend the next practical action
- State assumptions and uncertainty

It may not:

- Invent balances, fees, probabilities, or obligations
- Perform hidden financial calculations
- Make credit or eligibility decisions
- Move money
- Shame the worker
- Present an advance before lower-cost options

## Technical decision

### Stack

We will retain the working repository stack:

- TypeScript with strict mode
- Next.js App Router and React
- Vinext and the existing Sites/Cloudflare deployment
- Existing CSS/Tailwind capability
- Build-time ingestion of the supplied CSV data
- Local browser persistence for simulated decisions
- One server-only AI route when an API connection is available

This stack is already installed and deployed. Replatforming would spend
hackathon time without improving the scored demo.

### Explicitly excluded infrastructure

We will not add:

- User authentication
- A production database
- Bank or payroll integrations
- Real transfers or wallet custody
- Background jobs or queues
- Event streaming
- A microservice or monorepo architecture
- Production observability or on-call tooling
- A trained machine-learning model
- Large state-management frameworks
- Broad browser/device test matrices

The prototype may use sample worker selection and local state.

## Architecture

The dependency direction is:

```text
CSV sample data
      ↓
validated normalized records
      ↓
deterministic financial engine
      ↓
DecisionSnapshot
     ↙              ↘
worker-facing UI     AI explanation
```

### Canonical ownership

- **Data ingestion** owns CSV parsing and normalization.
- **Financial engine** owns money, forecasts, allocations, and scenarios.
- **DecisionSnapshot** is the only input contract for AI explanations.
- **UI** owns presentation and user interaction, not financial formulas.
- **AI** owns wording and action-plan explanation, not numeric truth.

### Lean source shape

```text
app/
  page.tsx                 Worker-facing ShiftAhead experience
  research/page.tsx        Existing Daily Earnings Atlas
  api/copilot/route.ts     Optional AI endpoint

features/
  today/
  rent-runway/
  smoothing-wallet/
  scenarios/
  copilot/

domain/
  money.ts
  forecast.ts
  allocation.ts
  scenario.ts
  decision-snapshot.ts

data/
  ingest.ts
  repository.ts

tests/
  domain/
  demo-flow/
```

We will not create a package for every concept. Files should be split only when
the split makes the core logic easier to understand or test.

## Financial calculation rules

1. Store calculated money as integer cents.
2. Keep financial functions pure and deterministic.
3. Keep raw sample records immutable.
4. Return assumptions with forecasts.
5. Display likely ranges rather than false precision.
6. Never count protected funds twice.
7. Never let Safe to Spend fall below zero.
8. Keep cancelled advance fees separate from paid fees.
9. Treat fees on repaid advances as the best available proxy for fees paid.
10. Mark simulated balances and transfers clearly.

The first implementation can use straightforward medians, rolling history, and
empirical ranges. Predictive-model sophistication is not required for the
hackathon.

## AI implementation

The calculation engine will produce a structure similar to:

```ts
interface DecisionSnapshot {
  safeToSpendCents: number;
  protectedCents: number;
  smoothingBalanceCents: number;
  rentRemainingCents: number;
  rentDueInDays: number;
  workdaysRemaining: number;
  projectedGapCents: number;
  coverageProbability: number;
  confidence: "low" | "moderate" | "high";
  assumptions: string[];
}
```

The AI response will be structured as:

```ts
interface CopilotAnswer {
  directAnswer: string;
  consequence: string;
  nextAction: string;
  confidence: "low" | "moderate" | "high";
  assumptions: string[];
}
```

If a live AI connection is unavailable, a deterministic template-based fallback
will generate the same response shape. The demo must never depend on network
availability.

## UX decision

The worker experience will be:

- Mobile-first
- Calm and nonjudgmental
- Focused on one primary number
- Explicit about protected money
- Written in plain language
- Accessible by keyboard and touch
- Clear about estimates and simulation

We will avoid:

- Generic money-in/money-out charts on the primary screen
- Financial-health scores
- Dense analytical tables
- Excessive warnings
- Gamifying financial stress
- Generic blue fintech styling

The existing research dashboard can retain its editorial analytical style. The
worker product should feel like its approachable companion.

## Minimum quality bar

We want reliable demo quality, not production infrastructure.

Required:

- Strict TypeScript
- Lint and typecheck
- Successful production build
- Focused unit tests for:
  - Safe to Spend
  - Rent workdays remaining
  - Smoothing allocation
  - Day-off scenario comparison
  - Advance fee impact
- One automated or repeatable smoke test for the core demo loop
- Keyboard-accessible primary interactions
- Graceful AI fallback

Not required:

- Global coverage targets
- Exhaustive component tests
- Cross-browser matrices
- Load testing
- Production security review
- Full CI/CD redesign
- Long-lived migrations or operational runbooks

One `verify` command may combine the relevant checks if it can be added quickly.
It must not become a project of its own.

## Functional acceptance criteria

The prototype is complete when:

1. A sample worker can be selected.
2. Safe to Spend differs from the raw balance.
3. Rent Runway shows dollars and typical workdays remaining.
4. The Income Smoothing Wallet recommends a variable contribution.
5. Taking tomorrow off changes the projected gap and rent coverage.
6. Applying smoothing changes the day-off scenario.
7. The AI or fallback answers using only the calculated snapshot.
8. An advance scenario shows its fee and next-earnings impact.
9. The original research dashboard remains accessible.
10. The complete story can be demonstrated in under two minutes.

## Demo script

1. Open a high-volatility sample worker.
2. Point out that the balance is higher than Safe to Spend because rent is
   protected.
3. Show rent in both dollars and remaining workdays.
4. Ask the Copilot: “I need tomorrow off. Can I afford it?”
5. Show the forecast weakening.
6. Apply a suggested smoothing-wallet withdrawal and recovery allocation.
7. Show improved rent coverage and the avoided advance.
8. Open the research dashboard briefly to show that the product decision came
   from the supplied dataset.

## Trade-offs and consequences

### Positive

- The product is differentiated from ordinary budgeting tools.
- The demo is grounded in the supplied data.
- The deterministic engine makes the AI credible.
- The happy path remains functional when AI is unavailable.
- The technical scope is achievable during a hackathon.
- The story directly maps to the scoring rubric.

### Negative

- Forecasts are illustrative and should not be treated as financial advice.
- Local simulated state will not follow users across devices.
- Sample profiles replace real account aggregation.
- The smoothing wallet does not move or custody funds.
- The simple forecast will not capture every employment pattern.
- The architecture is optimized for one polished prototype, not immediate scale.

These trade-offs are accepted for the hackathon.

## Deferred decisions

The following require a new decision after the hackathon, not expansion of this
build:

- Real bank, payroll, or employer connectivity
- Identity and account ownership
- Persistent wallet state
- Regulated money movement
- Production-grade forecasting
- Personalized notifications
- Bill negotiation integrations
- Security, privacy, and compliance architecture
- Commercial advance or lending partnerships

## Revisit trigger

Revisit this ADR only if:

- The judging requirements change,
- The team cannot complete the core demo loop in the available time, or
- A required platform capability proves unavailable.

When scope pressure appears, remove optional scenarios and polish before
weakening the core loop or adding infrastructure.
