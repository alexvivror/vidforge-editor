import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VidForge Editor — Browser AI Video Editor",
  description: "Local-first AI video editor: WebCodecs, Canvas, WebGL, Web Audio, and an AI Director that plans and executes your video.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
