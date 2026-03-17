import { NextResponse } from "next/server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ProofOfWork = {
  context: string;
  brandVault: string;
  assumptions: string[];
};

const sampleProof: ProofOfWork = {
  context: "Contribution margin 34%, ROAS 3.6x, CAC ₹1,750, readiness=READY TO SCALE",
  brandVault: "Brand: Kapture • Tone: Bold & expert • Audience: Urban skincare lovers",
  assumptions: ["Assumed current CAC equals last dashboard snapshot (₹1,750)", "Assumed Meta/Google budgets align with scale plan"]
};

export async function POST(request: Request) {
  const body = (await request.json()) as { messages?: ChatMessage[] };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = messages.filter((msg) => msg.role === "user").slice(-1)[0];
  const question = lastUser?.content ?? "Plan a launch.";

  const reply = `Demo ZWIRK submits a 30-day plan for your ${question}. Keep your CAC under ₹${Math.round(
    1750
  )}, maintain ROAS > 3x, and stay within ${Math.round(15)}% lift per week.`;

  return NextResponse.json({
    reply,
    latencyMs: 50,
    proof: sampleProof
  });
}
