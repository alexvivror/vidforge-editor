import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// TTS: ElevenLabs or NVIDIA NIM. Audio returned as base64 (browser converts).
export async function POST(req: NextRequest) {
  try {
    const { text, provider, key, voice } = await req.json();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

    if (provider === "elevenlabs" && key) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice || "21m00Tcm4TlvDq8ikWAM"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": key,
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (!res.ok) return NextResponse.json({ error: `ElevenLabs ${res.status}` }, { status: 502 });
      const buf = Buffer.from(await res.arrayBuffer());
      return NextResponse.json({ provider: "elevenlabs", audioBase64: buf.toString("base64"), mime: "audio/mpeg" });
    }

    if (provider === "nim" && key) {
      // NVIDIA NIM hosted TTS (parakeet/tts endpoint shape)
      const res = await fetch("https://ai.api.nvidia.com/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, Accept: "audio/mpeg" },
        body: JSON.stringify({ model: "nvidia/tts", input: text, voice: "en-US-JennyNeural" }),
      });
      if (!res.ok) return NextResponse.json({ error: `NVIDIA NIM ${res.status}` }, { status: 502 });
      const buf = Buffer.from(await res.arrayBuffer());
      return NextResponse.json({ provider: "nvidia_nim", audioBase64: buf.toString("base64"), mime: "audio/mpeg" });
    }

    return NextResponse.json({ provider: "browser", note: "no TTS key — browser speechSynthesis used" });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
