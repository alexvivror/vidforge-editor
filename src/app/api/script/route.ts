import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Script generation via OpenCode Zen (OpenAI-compatible chat completions)
export async function POST(req: NextRequest) {
  try {
    const { topic, style, outline, key, model } = await req.json();
    if (!key) return NextResponse.json({ error: "OpenCode Zen API key required" }, { status: 400 });

    const system = `You are a professional video script writer. Write a ${style} narration script
for a video about "${topic}". Requirements:
- Natural spoken language, no markdown, one sentence per line
- Opening hook, body covering the outline points, closing call to action
- Keep numbers/technical terms exact
- Total 150-250 words
Return ONLY the script text.`;

    const res = await fetch(`${process.env.OPENCODEZEN_BASE || "https://opencodezen.ai/api/v1"}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: model || "deepseek-v4-flash-free",
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ topic, outline: outline || [] }) },
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: `OpenCode Zen error ${res.status}: ${body.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ script: data.choices[0].message.content.trim(), provider: "opencodezen" });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
