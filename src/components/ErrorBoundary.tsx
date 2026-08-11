"use client";

import { Component, type ReactNode } from "react";

// ---------- Error boundary: never silently fail ----------
interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[vidforge] error boundary:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24 }}>
          <div className="card" style={{ maxWidth: 440, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
            <p className="sub" style={{ marginBottom: 16, wordBreak: "break-word" }}>
              {this.state.error.message || "An unexpected error occurred."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="btn btn-primary btn-sm" onClick={() => this.setState({ error: null })}>Try again</button>
              <button className="btn btn-ghost btn-sm" onClick={() => (window.location.href = "/")}>Go home</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
