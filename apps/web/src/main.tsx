import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@xterm/xterm/css/xterm.css";
import "./index.css";

import { isElectron } from "./env";
import { getRouter } from "./router";
import { APP_DISPLAY_NAME } from "./branding";
import { syncDocumentWindowControlsOverlayClass } from "./lib/windowControlsOverlay";
import { TrunkAuthProvider } from "./auth/workos";
import { SignedOutGate } from "./auth/SignedOutGate";

// Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
const history = isElectron ? createHashHistory() : createBrowserHistory();

// Hoisted so SignedOutGate (which sits outside the router) can use TanStack
// Query for /me, while the router still gets the same client via context.
const queryClient = new QueryClient();

const router = getRouter(history, queryClient);

if (isElectron) {
  syncDocumentWindowControlsOverlayClass();
}

document.title = APP_DISPLAY_NAME;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TrunkAuthProvider>
        <SignedOutGate>
          <RouterProvider router={router} />
        </SignedOutGate>
      </TrunkAuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
