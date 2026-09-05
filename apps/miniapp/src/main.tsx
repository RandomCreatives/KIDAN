import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthStatusBar } from "./auth/AuthStatusBar";
import { AuthGate } from "./auth/AuthGate";
import { initializeTelegram } from "./lib/telegram";
import "./styles/global.css";

initializeTelegram();

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found");

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <AuthStatusBar />
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
);
