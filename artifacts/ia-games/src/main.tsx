import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { API_BASE } from "@/lib/api";
import { getSessionToken } from "@/lib/session";

setBaseUrl(API_BASE);
// Attach the signed session token (when present) to every generated-hook request.
setAuthTokenGetter(() => getSessionToken());

const root = document.getElementById("root")!;
createRoot(root).render(<App />);

// Remove inline splash screen once React has mounted
const splash = document.getElementById("splash");
if (splash) {
  splash.style.transition = "opacity 0.3s";
  splash.style.opacity = "0";
  setTimeout(() => splash.remove(), 350);
}
