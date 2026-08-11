import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Unified image search: Unsplash | Pexels | Pixabay (server-side key proxy)
export async function POST(req: NextRequest) {
  try {
    const { query, provider, key } = await req.json();
    if (!key || !query) return NextResponse.json({ error: "query + key required" }, { status: 400 });

    if (provider === "unsplash") {
      const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=6`, {
        headers: { Authorization: `Client-ID ${key}` },
      });
      const d = await res.json();
      return NextResponse.json(
        (d.results || []).map((p: any) => ({ url: p.urls.regular, alt: p.alt_description || query, source: "unsplash" }))
      );
    }
    if (provider === "pexels") {
      const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6`, {
        headers: { Authorization: key },
      });
      const d = await res.json();
      return NextResponse.json(
        (d.photos || []).map((p: any) => ({ url: p.src.large, alt: p.alt || query, source: "pexels" }))
      );
    }
    if (provider === "pixabay") {
      const res = await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&per_page=6&image_type=photo`);
      const d = await res.json();
      return NextResponse.json(
        (d.hits || []).map((h: any) => ({ url: h.webformatURL, alt: h.tags || query, source: "pixabay" }))
      );
    }
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
