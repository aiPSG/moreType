import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Catches render-time crashes so the app degrades to a readable error screen
 * with a recovery action instead of a blank white page. Most crashes here are
 * triggered by stored data, so we offer a one-click reset of localStorage.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a copy in the console for debugging.
    console.error("moreType crashed:", error, info);
    this.setState({ info });
  }

  reset = () => {
    try {
      localStorage.removeItem("moretype.state.v1");
    } catch {
      /* ignore */
    }
    location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          maxWidth: 760,
          margin: "8vh auto",
          padding: 24,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#15151b",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
        <p style={{ color: "#555" }}>
          moreType hit an error while rendering. This is often caused by saved
          data from an older version. You can reset your saved letters &
          alphabets to recover (this clears local data for this site).
        </p>
        <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
          <button
            onClick={this.reset}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #4f46e5",
              background: "#4f46e5",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reset data &amp; reload
          </button>
          <button
            onClick={() => location.reload()}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
        <pre
          style={{
            background: "#f6f6f8",
            border: "1px solid #e6e6ec",
            borderRadius: 8,
            padding: 12,
            overflow: "auto",
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {error.message}
          {"\n\n"}
          {error.stack}
          {info?.componentStack}
        </pre>
      </div>
    );
  }
}
