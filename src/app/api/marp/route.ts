import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Marp presentation: markdown -> HTML deck (server-side marp-cli)
export async function POST(req: NextRequest) {
  try {
    const { title, outline, style } = await req.json();
    if (!outline?.length) return NextResponse.json({ error: "outline required" }, { status: 400 });

    const md = [
      "---", "marp: true", "theme: default", "size: 16:9", "paginate: false",
      "style: |",
      "  section { background: #12121E; color: #ECECF2; font-family: Inter, sans-serif; padding: 56px 64px; }",
      "  h1 { color: #fff; font-size: 44px; }",
      "  h2 { color: #F5C518; font-size: 18px; text-transform: uppercase; letter-spacing: 1.5px; }",
      "  li { font-size: 24px; line-height: 1.6; }",
      "---", "",
      `# ${title || "Presentation"}`, "",
      `**${style || "presentation"}** · VidForge AI`, "",
      ...outline.flatMap((s: string, i: number) => ["---", "", `## Slide ${i + 1}`, "", `### ${s}`, ""]),
    ].join("\n");

    // Use marp-cli via npx if quickly available; otherwise return markdown immediately
    // (frontend renders markdown natively). Never block the AI pipeline on this.
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const exec = promisify(execFile);
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");

    const tmp = path.join(os.tmpdir(), `marp-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, "deck.md"), md);
    let html = "";
    try {
      await exec("npx", ["--yes", "@marp-team/marp-cli@latest", "--html", path.join(tmp, "deck.md"), "-o", path.join(tmp, "deck.html")], {
        timeout: 30000, cwd: tmp,
      });
      html = fs.readFileSync(path.join(tmp, "deck.html"), "utf8");
    } catch (e: any) {
      // fast fallback: markdown-only response so the pipeline continues
      console.log("[marp] cli unavailable, returning markdown:", String(e?.message || e).slice(0, 100));
    }
    return NextResponse.json({ marp: md, html, slides: outline.length, title: title || "Presentation" });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
