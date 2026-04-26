import { useEffect, useState, type ReactNode } from "react";

export type InstallPlatform = "local" | "container";

export interface InstallStep {
  readonly title: string;
  readonly code?: string;
  readonly note?: string;
}

export interface InstallGuide {
  readonly id: InstallPlatform;
  readonly label: string;
  readonly subtitle: string;
  readonly steps: ReadonlyArray<InstallStep>;
}

const GUIDES: Record<InstallPlatform, InstallGuide> = {
  local: {
    id: "local",
    label: "Local machine",
    subtitle: "macOS, Linux, or Windows (WSL). One curl line.",
    steps: [
      {
        title: "Install Trunk",
        code: "curl -fsSL https://app.trunk.codes/install.sh | sh",
      },
      {
        title: "Claim and run",
        code: "trunk pair && trunk start",
        note: "trunk pair opens a sign-in URL — click it, sign in, done.",
      },
    ],
  },
  container: {
    id: "container",
    label: "Container",
    subtitle: "Railway, Render, Fly, or any Docker host.",
    steps: [
      {
        title: "Fork the template",
        code: "github.com/hellogafaro/trunk-environment",
        note: "Mount a /data volume so the environmentId survives redeploys.",
      },
      {
        title: "Watch the logs on first boot",
        note: "Container prints a sign-in URL. Open it on any device — the env claims itself.",
      },
    ],
  },
};

export function detectInstallPlatform(): InstallPlatform {
  return "local";
}

export interface InstallationGuideProps {
  readonly footer?: ReactNode;
  readonly initialPlatform?: InstallPlatform;
}

export function InstallationGuide({ footer, initialPlatform }: InstallationGuideProps) {
  const [platform, setPlatform] = useState<InstallPlatform>(initialPlatform ?? "local");
  const guide = GUIDES[platform];

  useEffect(() => {
    if (initialPlatform) setPlatform(initialPlatform);
  }, [initialPlatform]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-background/40 p-1">
        {(Object.keys(GUIDES) as InstallPlatform[]).map((id) => {
          const isSelected = id === platform;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPlatform(id)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {GUIDES[id].label}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">{guide.subtitle}</p>

      <ol className="space-y-3">
        {guide.steps.map((step, index) => (
          <li
            key={`${guide.id}-${index}`}
            className="rounded-lg border border-border/70 bg-background/40 px-3 py-3"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                {step.code ? (
                  <pre className="overflow-x-auto rounded-md bg-card/60 px-3 py-2 font-mono text-xs">
                    {step.code}
                  </pre>
                ) : null}
                {step.note ? (
                  <p className="text-xs leading-relaxed text-muted-foreground/80">{step.note}</p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {footer}
    </div>
  );
}
