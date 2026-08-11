import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Article fetch via Firecrawl (server-side key proxy)
export async function POST(req: NextRequest) {
  try {
    const { url, key } = await req.json();
    if (!url || !key) return NextResponse.json({ error: "url + key required" }, { status: 400 });

    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) return NextResponse.json({ error: `Firecrawl ${res.status}` }, { status: 502 });
    const d = await res.json();
    const text = d?.data?.markdown || "";
    return NextResponse.json({ text, provider: "firecrawl", length: text.length });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
