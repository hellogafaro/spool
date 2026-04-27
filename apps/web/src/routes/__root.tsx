import { type ServerLifecycleWelcomePayload } from "@t3tools/contracts";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime";
import {
  Outlet,
  createRootRouteWithContext,
  type ErrorComponentProps,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef } from "react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";

import { APP_DISPLAY_NAME } from "../branding";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../components/ui/empty";
import { TrunkLogo } from "../components/ui/trunk-logo";
import { AppSidebarLayout } from "../components/AppSidebarLayout";
import { CommandPalette } from "../components/CommandPalette";
import { EnvironmentConnectionBanner } from "../components/EnvironmentConnectionBanner";
import {
  SlowRpcAckToastCoordinator,
  WebSocketConnectionCoordinator,
  WebSocketConnectionSurface,
} from "../components/WebSocketConnectionSurface";
import { Button } from "../components/ui/button";
import {
  AnchoredToastProvider,
  stackedThreadToast,
  ToastProvider,
  toastManager,
} from "../components/ui/toast";
import { resolveAndPersistPreferredEditor } from "../editorPreferences";
import { readLocalApi } from "../localApi";
import { useSettings } from "../hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  derivePhysicalProjectKeyFromPath,
} from "../logicalProject";
import {
  getServerConfigUpdatedNotification,
  ServerConfigUpdatedNotification,
  startServerStateSync,
  useServerConfig,
  useServerConfigUpdatedSubscription,
  useServerWelcomeSubscription,
} from "../rpc/serverState";
import { useStore } from "../store";
import { useUiStateStore } from "../uiStateStore";
import { syncBrowserChromeTheme } from "../hooks/useTheme";
import {
  ensureEnvironmentConnectionBootstrapped,
  getPrimaryEnvironmentConnection,
  startEnvironmentConnectionService,
} from "../environments/runtime";
import { configureClientTracing } from "../observability/clientTracing";
import { isWorkOsConfigured } from "../auth/workos";
import { useEnvironmentGate } from "../auth/useEnvironmentGate";
import {
  ensurePrimaryEnvironmentReady,
  resolveInitialServerAuthGateState,
  updatePrimaryEnvironmentDescriptor,
} from "../environments/primary";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  beforeLoad: async () => {
    const [, authGateState] = await Promise.all([
      ensurePrimaryEnvironmentReady(),
      resolveInitialServerAuthGateState(),
    ]);
    return {
      authGateState,
    };
  },
  component: RootRouteView,
  errorComponent: RootRouteErrorView,
  head: () => ({
    meta: [{ name: "title", content: APP_DISPLAY_NAME }],
  }),
});

function RootRouteView() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { authGateState } = Route.useRouteContext();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      syncBrowserChromeTheme();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  if (pathname === "/pair") {
    return <Outlet />;
  }

  if (pathname === "/onboarding") {
    return <Outlet />;
  }

  if (authGateState.status !== "authenticated") {
    return <Outlet />;
  }

  if (isWorkOsConfigured) {
    return <SaaSEnvironmentGuard />;
  }
  return <AuthenticatedShell />;
}

function SaaSEnvironmentGuard() {
  const { isReady } = useEnvironmentGate();
  if (!isReady) {
    return null;
  }
  return <AuthenticatedShell />;
}

function AuthenticatedShell() {
  return (
    <ToastProvider>
      <AnchoredToastProvider>
        <AuthenticatedTracingBootstrap />
        <ServerStateBootstrap />
        <EnvironmentConnectionManagerBootstrap />
        <EventRouter />
        <WebSocketConnectionCoordinator />
        <SlowRpcAckToastCoordinator />
        <WebSocketConnectionSurface>
          <EnvironmentConnectionBanner />
          <CommandPalette>
            <AppSidebarLayout>
              <Outlet />
            </AppSidebarLayout>
          </CommandPalette>
        </WebSocketConnectionSurface>
      </AnchoredToastProvider>
    </ToastProvider>
  );
}

function RootRouteErrorView({ error, reset }: ErrorComponentProps) {
  const message = errorMessage(error);
  const details = errorDetails(error);

  return (
    <Empty className="min-h-screen">
      <EmptyHeader>
        <TrunkLogo className="mb-4 size-6 text-foreground" />
        <EmptyTitle className="font-medium">Something went wrong.</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex w-full justify-center gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
        <details className="group w-full">
          <summary className="cursor-pointer list-none text-center text-sm text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">Show error details</span>
            <span className="hidden group-open:inline">Hide error details</span>
          </summary>
          <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-border/70 bg-card/60 px-3 py-2 text-left text-sm text-foreground/85">
            {details}
          </pre>
        </details>
      </EmptyContent>
    </Empty>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "An unexpected router error occurred.";
}

function errorDetails(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return "No additional error details are available.";
  }
}

function ServerStateBootstrap() {
  useEffect(() => startServerStateSync(getPrimaryEnvironmentConnection().client.server), []);

  return null;
}

function AuthenticatedTracingBootstrap() {
  useEffect(() => {
    void configureClientTracing();
  }, []);

  return null;
}

function EnvironmentConnectionManagerBootstrap() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return startEnvironmentConnectionService(queryClient);
  }, [queryClient]);

  return null;
}

function EventRouter() {
  const setActiveEnvironmentId = useStore((store) => store.setActiveEnvironmentId);
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const projectGroupingSettings = useSettings((settings) => ({
    sidebarProjectGroupingMode: settings.sidebarProjectGroupingMode,
    sidebarProjectGroupingOverrides: settings.sidebarProjectGroupingOverrides,
  }));
  const readPathname = useEffectEvent(() => pathname);
  const handledBootstrapThreadIdRef = useRef<string | null>(null);
  const seenServerConfigUpdateIdRef = useRef(getServerConfigUpdatedNotification()?.id ?? 0);
  const disposedRef = useRef(false);
  const serverConfig = useServerConfig();

  const handleWelcome = useEffectEvent((payload: ServerLifecycleWelcomePayload | null) => {
    if (!payload) return;

    updatePrimaryEnvironmentDescriptor(payload.environment);
    setActiveEnvironmentId(payload.environment.environmentId);
    void (async () => {
      await ensureEnvironmentConnectionBootstrapped(payload.environment.environmentId);
      if (disposedRef.current) {
        return;
      }

      if (!payload.bootstrapProjectId || !payload.bootstrapThreadId) {
        return;
      }
      const bootstrapEnvironmentState =
        useStore.getState().environmentStateById[payload.environment.environmentId];
      const bootstrapProject =
        bootstrapEnvironmentState?.projectById[payload.bootstrapProjectId] ?? null;
      const bootstrapProjectKey =
        (bootstrapProject
          ? deriveLogicalProjectKeyFromSettings(bootstrapProject, projectGroupingSettings)
          : null) ??
        (serverConfig?.cwd
          ? derivePhysicalProjectKeyFromPath(payload.environment.environmentId, serverConfig.cwd)
          : null) ??
        scopedProjectKey(
          scopeProjectRef(payload.environment.environmentId, payload.bootstrapProjectId),
        );
      useUiStateStore.getState().setProjectExpanded(bootstrapProjectKey, true);

      if (readPathname() !== "/") {
        return;
      }
      if (handledBootstrapThreadIdRef.current === payload.bootstrapThreadId) {
        return;
      }
      await navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId: payload.environment.environmentId,
          threadId: payload.bootstrapThreadId,
        },
        replace: true,
      });
      handledBootstrapThreadIdRef.current = payload.bootstrapThreadId;
    })().catch(() => undefined);
  });

  const handleServerConfigUpdated = useEffectEvent(
    (notification: ServerConfigUpdatedNotification | null) => {
      if (!notification) return;

      const { id, payload, source } = notification;
      if (id <= seenServerConfigUpdateIdRef.current) {
        return;
      }
      seenServerConfigUpdateIdRef.current = id;
      if (source !== "keybindingsUpdated") {
        return;
      }

      const issue = payload.issues.find((entry) => entry.kind.startsWith("keybindings."));
      if (!issue) {
        toastManager.add({
          type: "success",
          title: "Keybindings updated",
          description: "Keybindings configuration reloaded successfully.",
        });
        return;
      }

      toastManager.add(
        stackedThreadToast({
          type: "warning",
          title: "Invalid keybindings configuration",
          description: issue.message,
          actionVariant: "outline",
          actionProps: {
            children: "Open keybindings.json",
            onClick: () => {
              const api = readLocalApi();
              if (!api) {
                return;
              }

              void Promise.resolve(serverConfig ?? api.server.getConfig())
                .then((config) => {
                  const editor = resolveAndPersistPreferredEditor(config.availableEditors);
                  if (!editor) {
                    throw new Error("No available editors found.");
                  }
                  return api.shell.openInEditor(config.keybindingsConfigPath, editor);
                })
                .catch((error) => {
                  toastManager.add(
                    stackedThreadToast({
                      type: "error",
                      title: "Unable to open keybindings file",
                      description:
                        error instanceof Error ? error.message : "Unknown error opening file.",
                    }),
                  );
                });
            },
          },
        }),
      );
    },
  );

  useEffect(() => {
    if (!serverConfig) {
      return;
    }

    updatePrimaryEnvironmentDescriptor(serverConfig.environment);
    setActiveEnvironmentId(serverConfig.environment.environmentId);
  }, [serverConfig, setActiveEnvironmentId]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  useServerWelcomeSubscription(handleWelcome);
  useServerConfigUpdatedSubscription(handleServerConfigUpdated);

  return null;
}
