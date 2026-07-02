import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Signal the boot watchdog in index.html that the bundle started; without it
// the watchdog retries the bundle with a cache-busting URL and then reports
// the failure on screen.
(window as unknown as { __MT_BOOTED: boolean }).__MT_BOOTED = true;
