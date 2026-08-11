import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Avatar generation via NVIDIA NIM (image gen model endpoint)
export async function POST(req: NextRequest) {
  try {
    const { prompt, key, model } = await req.json();
    if (!key) return NextResponse.json({ error: "NVIDIA NIM key required" }, { status: 400 });

    const res = await fetch("https://ai.api.nvidia.com/v1/genai/nvidia/sdxl", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        prompt: `professional video presenter avatar, ${prompt}, studio lighting, 4k, photorealistic`,
        seed: 42,
        height: 1024,
        width: 1024,
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `NVIDIA NIM ${res.status}` }, { status: 502 });
    const d = await res.json();
    const b64 = d?.artifacts?.[0]?.base64;
    if (!b64) return NextResponse.json({ error: "no image in response" }, { status: 502 });
    return NextResponse.json({ provider: "nvidia_nim", imageBase64: b64, mime: "image/png" });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
