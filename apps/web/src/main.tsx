import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { useAuthStore } from "@/store/authStore";
import { Buffer } from "buffer";

// Polyfill Buffer for client-side PDF generation
window.Buffer = Buffer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).process = { env: {} };

// Restore Supabase session and subscribe to auth changes
useAuthStore.getState().initializeAuth();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
