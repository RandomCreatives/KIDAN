import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { AuthStatusBar } from "./auth/AuthStatusBar";
import { initializeTelegram } from "./lib/telegram";
import "./styles/global.css";

initializeTelegram();

const root = document.getElementById("root");
if (!root) throw new Error("Application root was not found");

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <AuthStatusBar />
      <App />
    </AuthProvider>
  </StrictMode>,
);
