import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("error", (event) => {
  if (!event.error && (!event.message || event.message === "Script error." || event.message === "")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (!event.error) {
    console.warn("[Non-critical error]", event.message, event.filename ? `@ ${event.filename}:${event.lineno}:${event.colno}` : "");
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
}, true);

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Unhandled rejection]", event.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
