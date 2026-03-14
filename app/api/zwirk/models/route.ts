import { NextResponse } from "next/server";

type GeminiModelsResponse = {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
};

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ error: "LLM not configured" }, { status: 500 });
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "ListModels failed" }, { status: res.status });
    }

    const data = (await res.json()) as GeminiModelsResponse;
    const models =
      data.models
        ?.filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
        .map((m) => m.name)
        .filter((name): name is string => typeof name === "string") ?? [];

    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ListModels error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
