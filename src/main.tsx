import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fonts are self-hosted from the app's own origin (docs/design.md).
import "@fontsource/schibsted-grotesk/400.css";
import "@fontsource/schibsted-grotesk/500.css";
import "@fontsource/schibsted-grotesk/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "./styles/tokens.css";
import "./ui/app.css";
import { countVisit } from "./ui/analytics.ts";
import { App } from "./ui/App.tsx";
import { registerServiceWorker } from "./ui/serviceWorker.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
countVisit();
