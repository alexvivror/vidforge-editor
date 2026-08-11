"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/create", label: "AI Create" },
  { href: "/editor", label: "Editor" },
  { href: "/studio", label: "AI Studio" },
  { href: "/settings", label: "Settings" },
];

export default function Topbar() {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 5 L20 12 L8 19 Z" />
            <path d="M3 8 L3 16" />
          </svg>
        </div>
        VidForge <span style={{ color: "var(--accent)" }}>AI</span>
      </div>
      <nav className="nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`nav-item ${pathname.startsWith(n.href) ? "active" : ""}`}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        <span className="badge">Local-first</span>
      </div>
    </header>
  );
}
