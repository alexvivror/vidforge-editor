"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Projects", icon: "🏠" },
  { href: "/editor", label: "Editor", icon: "✂️" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function Topbar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 5 L20 12 L8 19 Z" />
              <path d="M3 8 L3 16" />
            </svg>
          </div>
          VidForge
        </div>
        <nav className="nav nav-desktop">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-item ${isActive(n.href) ? "active" : ""}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-spacer" />
        <div className="topbar-actions">
          <span className="badge">100% local</span>
        </div>
      </header>
      {/* mobile bottom nav */}
      <nav className="bottom-nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`bottom-nav-item ${isActive(n.href) ? "active" : ""}`}>
            <span className="bottom-nav-icon">{n.icon}</span>
            <span className="bottom-nav-label">{n.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
