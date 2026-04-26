import { useMemo, useState } from "react";

import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

interface ProviderRecipe {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly install: string;
  readonly authCommand: string;
  readonly authNote: string;
  readonly docs: string;
}

const PROVIDERS: ReadonlyArray<ProviderRecipe> = [
  {
    id: "claude-code",
    label: "Claude Code",
    subtitle: "Anthropic's official coding agent CLI.",
    install: "npm install -g @anthropic-ai/claude-code",
    authCommand: "claude login",
    authNote:
      "Opens an OAuth flow in your browser. Or set ANTHROPIC_API_KEY in the environment if you prefer headless auth.",
    docs: "https://docs.claude.com/claude-code",
  },
  {
    id: "codex",
    label: "Codex",
    subtitle: "OpenAI's coding agent CLI.",
    install: "npm install -g @openai/codex",
    authCommand: "codex login",
    authNote:
      "Browser-based OAuth. Or set OPENAI_API_KEY in the environment for headless auth.",
    docs: "https://github.com/openai/codex",
  },
  {
    id: "cursor-agent",
    label: "Cursor Agent",
    subtitle: "Cursor's coding agent CLI.",
    install: "curl -fsSL https://cursor.com/install -o- | bash",
    authCommand: "cursor-agent login",
    authNote: "Authenticate via your Cursor account.",
    docs: "https://docs.cursor.com",
  },
];

type Mode = "install" | "auth";

export function ProvidersSettings() {
  const [activeId, setActiveId] = useState(PROVIDERS[0]?.id ?? "");
  const active = useMemo(
    () => PROVIDERS.find((entry) => entry.id === activeId) ?? PROVIDERS[0]!,
    [activeId],
  );

  return (
    <SettingsPageContainer>
      <SettingsSection title="Providers">
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            The CLIs that drive your coding sessions live on the environment, not on this device.
            Run the commands below in your environment's shell to install or authenticate.
          </p>

          <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-background/40 p-1">
            {PROVIDERS.map((provider) => {
              const isSelected = provider.id === active.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => setActiveId(provider.id)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {provider.label}
                </button>
              );
            })}
          </div>

          <header className="space-y-1">
            <p className="text-base font-medium text-foreground">{active.label}</p>
            <p className="text-xs text-muted-foreground">{active.subtitle}</p>
          </header>

          <ProviderStep
            mode="install"
            title="Install"
            command={active.install}
            note="Run on the machine the env is running on. SSH into Railway/Fly/your VPS, or open a terminal on your laptop."
          />

          <ProviderStep
            mode="auth"
            title="Authenticate"
            command={active.authCommand}
            note={active.authNote}
          />

          <p className="text-xs text-muted-foreground">
            Docs:{" "}
            <a
              className="text-primary hover:underline"
              href={active.docs}
              target="_blank"
              rel="noreferrer"
            >
              {active.docs}
            </a>
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Coming soon">
        <div className="px-4 py-4 text-sm text-muted-foreground sm:px-5">
          One-click <em>Install</em> and <em>Authenticate</em> buttons that drive a live terminal
          inside this page — running the commands above on your environment without you having to
          SSH in.
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function ProviderStep({
  mode,
  title,
  command,
  note,
}: {
  mode: Mode;
  title: string;
  command: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-3">
      <div className="flex items-start gap-3">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold text-muted-foreground">
          {mode === "install" ? "1" : "2"}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <pre className="overflow-x-auto rounded-md bg-card/60 px-3 py-2 font-mono text-xs">
            {command}
          </pre>
          <p className="text-xs leading-relaxed text-muted-foreground/80">{note}</p>
        </div>
      </div>
    </div>
  );
}
