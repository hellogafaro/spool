import { useMemo } from "react";

import { useClaimedEnvironments } from "~/auth/useClaimedEnvironments";
import { useServerProviders } from "~/rpc/serverState";
import { Spinner } from "../ui/spinner";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

interface ProviderRecipe {
  readonly id: string;
  readonly fallbackLabel: string;
  readonly install: string;
  readonly authCommand: string;
  readonly authNote: string;
  readonly docs: string;
}

const RECIPES: ReadonlyArray<ProviderRecipe> = [
  {
    id: "claudeAgent",
    fallbackLabel: "Claude Code",
    install: "npm install -g @anthropic-ai/claude-code",
    authCommand: "claude login",
    authNote: "Browser-based OAuth. Or set ANTHROPIC_API_KEY in the environment for headless auth.",
    docs: "https://docs.claude.com/claude-code",
  },
  {
    id: "codex",
    fallbackLabel: "Codex",
    install: "npm install -g @openai/codex",
    authCommand: "codex login",
    authNote: "Browser-based OAuth. Or set OPENAI_API_KEY in the environment for headless auth.",
    docs: "https://github.com/openai/codex",
  },
  {
    id: "cursorAgent",
    fallbackLabel: "Cursor Agent",
    install: "curl -fsSL https://cursor.com/install -o- | bash",
    authCommand: "cursor-agent login",
    authNote: "Authenticate via your Cursor account.",
    docs: "https://docs.cursor.com",
  },
];

export function ProvidersSettings() {
  const environments = useClaimedEnvironments();
  const liveProviders = useServerProviders();

  const hasOnlineEnv = useMemo(
    () => environments.data?.some((entry) => entry.online) ?? false,
    [environments.data],
  );

  const known = useMemo(() => {
    return RECIPES.map((recipe) => {
      const live = liveProviders.find((entry) => entry.provider === recipe.id);
      return { recipe, live, label: live?.displayName ?? recipe.fallbackLabel };
    });
  }, [liveProviders]);

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

          <ul className="space-y-3">
            {known.map(({ recipe, live, label }) => (
              <li
                key={recipe.id}
                className="space-y-3 rounded-lg border border-border/70 bg-background/40 px-3 py-3"
              >
                <header className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    {live?.version ? (
                      <p className="text-xs text-muted-foreground">v{live.version}</p>
                    ) : null}
                  </div>
                  <ProviderBadges live={live} hasOnlineEnv={hasOnlineEnv} />
                </header>

                {needsInstall(live) ? (
                  <Step number={1} title="Install on the environment">
                    <pre className="overflow-x-auto rounded-md bg-card/60 px-3 py-2 font-mono text-xs">
                      {recipe.install}
                    </pre>
                  </Step>
                ) : null}

                {needsAuth(live) ? (
                  <Step number={needsInstall(live) ? 2 : 1} title="Authenticate">
                    <pre className="overflow-x-auto rounded-md bg-card/60 px-3 py-2 font-mono text-xs">
                      {recipe.authCommand}
                    </pre>
                    <p className="text-xs leading-relaxed text-muted-foreground/80">
                      {recipe.authNote}
                    </p>
                  </Step>
                ) : null}

                {live?.message ? (
                  <p className="text-xs text-muted-foreground">{live.message}</p>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  Docs:{" "}
                  <a
                    className="text-primary hover:underline"
                    href={recipe.docs}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {recipe.docs}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function ProviderBadges({
  live,
  hasOnlineEnv,
}: {
  live: ReturnType<typeof useServerProviders>[number] | undefined;
  hasOnlineEnv: boolean;
}) {
  if (!hasOnlineEnv) {
    return <Badge tone="muted">Unknown</Badge>;
  }
  if (!live) {
    return <Badge tone="warn">Not installed</Badge>;
  }
  if (!live.installed) {
    return <Badge tone="warn">Not installed</Badge>;
  }
  if (live.auth.status !== "authenticated") {
    return <Badge tone="warn">Auth needed</Badge>;
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

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold text-muted-foreground">
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {children}
      </div>
    </div>
  );
}

function needsInstall(live: ReturnType<typeof useServerProviders>[number] | undefined): boolean {
  if (!live) return true;
  return !live.installed;
}

function needsAuth(live: ReturnType<typeof useServerProviders>[number] | undefined): boolean {
  if (!live) return false;
  return live.installed && live.auth.status !== "authenticated";
}
