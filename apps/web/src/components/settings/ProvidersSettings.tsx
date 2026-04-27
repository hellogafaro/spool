import { useMemo, useState } from "react";

import { useClaimedEnvironments } from "~/auth/useClaimedEnvironments";
import { useServerProviders } from "~/rpc/serverState";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { ProviderInstallButton } from "./ProviderInstallButton";
import { ProviderSetupDialog } from "./ProviderSetupDialog";
import { PROVIDER_COMMANDS } from "./providerCommands";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

interface ProviderRecipe {
  readonly id: string;
  readonly fallbackLabel: string;
  readonly docs: string;
}

const RECIPES: ReadonlyArray<ProviderRecipe> = [
  { id: "claudeAgent", fallbackLabel: "Claude Code", docs: "https://docs.claude.com/claude-code" },
  { id: "codex", fallbackLabel: "Codex", docs: "https://github.com/openai/codex" },
  { id: "opencode", fallbackLabel: "OpenCode", docs: "https://opencode.ai" },
];

export function ProvidersSettings() {
  const environments = useClaimedEnvironments();
  const liveProviders = useServerProviders();
  const [setupProviderId, setSetupProviderId] = useState<string | null>(null);

  // /me no longer carries per-env online status; we just check whether the
  // user has any paired env at all. Detailed online indicator can come back
  // later via WS connection state if needed.
  const hasOnlineEnv = useMemo(() => (environments.data?.length ?? 0) > 0, [environments.data]);

  const known = useMemo(() => {
    return RECIPES.map((recipe) => {
      const live = liveProviders.find((entry) => entry.provider === recipe.id);
      return { recipe, live, label: live?.displayName ?? recipe.fallbackLabel };
    });
  }, [liveProviders]);

  const setupRow = setupProviderId
    ? known.find(({ recipe }) => recipe.id === setupProviderId)
    : null;

  return (
    <SettingsPageContainer>
      <SettingsSection title="Providers">
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            CLIs that drive your coding sessions live on the environment, not on this device. Status
            comes from the active environment in real time.
          </p>

          {!hasOnlineEnv ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-card/40 px-4 py-4 text-sm text-muted-foreground">
              No online environment. Provider state shows up here once an environment is connected.
            </div>
          ) : null}

          <ul className="space-y-2">
            {known.map(({ recipe, live, label }) => (
              <li
                key={recipe.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card/60 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {live?.version ? `v${live.version} · ` : ""}
                    <a
                      className="hover:underline"
                      href={recipe.docs}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Docs
                    </a>
                  </p>
                </div>

                <ProviderActions
                  providerId={recipe.id}
                  providerLabel={label}
                  live={live}
                  hasOnlineEnv={hasOnlineEnv}
                  hasRecipe={Boolean(PROVIDER_COMMANDS[recipe.id])}
                  onSetup={() => setSetupProviderId(recipe.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      </SettingsSection>

      {setupRow ? (
        <ProviderSetupDialog
          // Force a fresh component (and therefore fresh PTY teardown of the
          // prior provider's setup session) when the user jumps from one
          // provider's Set up to another's without closing first.
          key={setupRow.recipe.id}
          providerId={setupRow.recipe.id}
          providerLabel={setupRow.label}
          open={setupProviderId !== null}
          onOpenChange={(next) => {
            if (!next) setSetupProviderId(null);
          }}
        />
      ) : null}
    </SettingsPageContainer>
  );
}

function ProviderActions({
  providerId,
  providerLabel: _providerLabel,
  live,
  hasOnlineEnv,
  hasRecipe,
  onSetup,
}: {
  providerId: string;
  providerLabel: string;
  live: ReturnType<typeof useServerProviders>[number] | undefined;
  hasOnlineEnv: boolean;
  hasRecipe: boolean;
  onSetup: () => void;
}) {
  if (!hasOnlineEnv) {
    return <Badge tone="muted">Unknown</Badge>;
  }
  if (!live || !live.installed) {
    return hasRecipe ? (
      <ProviderInstallButton providerId={providerId} />
    ) : (
      <Badge tone="warn">Not installed</Badge>
    );
  }
  if (live.auth.status !== "authenticated") {
    return hasRecipe ? (
      <Button size="sm" variant="outline" onClick={onSetup}>
        Set up
      </Button>
    ) : (
      <Badge tone="warn">Auth needed</Badge>
    );
  }
  if (live.status === "ready") {
    return <Badge tone="ok">Ready</Badge>;
  }
  if (live.status === "warning") {
    return <Badge tone="warn">Attention</Badge>;
  }
  if (live.status === "error") {
    return <Badge tone="bad">Error</Badge>;
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Spinner className="size-3" />
      Checking
    </span>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "muted";
  children: React.ReactNode;
}) {
  const className =
    tone === "ok"
      ? "bg-emerald-500/15 text-emerald-500"
      : tone === "warn"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "bg-destructive/15 text-destructive"
          : "bg-muted/40 text-muted-foreground";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${className}`}
    >
      {children}
    </span>
  );
}
