import { explainWithOptionalAi } from "@/domain/copilot";
import type { DecisionSnapshot } from "@/domain/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      question?: string;
      snapshot?: DecisionSnapshot;
      baseline?: DecisionSnapshot;
    };

    const question = body.question?.trim();
    if (!question || !body.snapshot) {
      return Response.json(
        { error: "question and snapshot are required" },
        { status: 400 },
      );
    }

    const answer = await explainWithOptionalAi({
      question,
      snapshot: body.snapshot,
      baseline: body.baseline,
    });

    return Response.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
