import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { API_BASE } from "@/lib/api";

setBaseUrl(API_BASE);

createRoot(document.getElementById("root")!).render(<App />);
