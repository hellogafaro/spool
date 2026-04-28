import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";

import "@xterm/xterm/css/xterm.css";
import "./index.css";

import { isElectron } from "./env";
import { ensureLocalApi } from "./localApi";
import { getRouter } from "./router";
import { APP_DISPLAY_NAME } from "./branding";
import { syncDocumentWindowControlsOverlayClass } from "./lib/windowControlsOverlay";
import { AuthProvider, isWorkOsConfigured } from "./auth/workos";

// Trunk SaaS has no UI to add T3-style remote backends, so the saved-env
// registry should always be empty. Clear any residue from prior local-T3
// testing so its UUID-keyed entries don't trigger 1013 reconnect storms
// against the relay on every boot.
if (isWorkOsConfigured) {
  void ensureLocalApi()
    .persistence.setSavedEnvironmentRegistry([])
    .catch(() => undefined);
}

// Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
const history = isElectron ? createHashHistory() : createBrowserHistory();

const router = getRouter(history);

if (isElectron) {
  syncDocumentWindowControlsOverlayClass();
}

document.title = APP_DISPLAY_NAME;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);
