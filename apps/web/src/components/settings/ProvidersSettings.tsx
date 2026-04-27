import { useCallback, useMemo, useState } from "react";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { type ProviderKind } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { normalizeModelSlug } from "@t3tools/shared/model";

import { useClaimedEnvironments } from "~/auth/useClaimedEnvironments";
import { useSettings, useUpdateSettings } from "~/hooks/useSettings";
import { MAX_CUSTOM_MODEL_LENGTH } from "~/modelSelection";
import { useServerProviders } from "~/rpc/serverState";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { ProviderInstallButton } from "./ProviderInstallButton";
import { ProviderSetupDialog } from "./ProviderSetupDialog";
import { PROVIDER_COMMANDS } from "./providerCommands";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

interface ProviderRecipe {
  readonly id: ProviderKind;
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
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const [setupProviderId, setSetupProviderId] = useState<ProviderKind | null>(null);
  const [openDetails, setOpenDetails] = useState<Partial<Record<ProviderKind, boolean>>>({});
  const [customModelInput, setCustomModelInput] = useState<Partial<Record<ProviderKind, string>>>(
    {},
  );
  const [customModelError, setCustomModelError] = useState<
    Partial<Record<ProviderKind, string | null>>
  >({});

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

  const patchProvider = useCallback(
    (provider: ProviderKind, patch: Record<string, unknown>) => {
      updateSettings({
        providers: {
          ...settings.providers,
          [provider]: { ...settings.providers[provider], ...patch },
        },
      });
    },
    [settings.providers, updateSettings],
  );

  const addCustomModel = useCallback(
    (provider: ProviderKind) => {
      const raw = customModelInput[provider] ?? "";
      const normalized = normalizeModelSlug(raw, provider);
      const setError = (message: string | null) =>
        setCustomModelError((existing) => ({ ...existing, [provider]: message }));

      if (!normalized) {
        setError("Enter a model slug.");
        return;
      }
      if (normalized.length > MAX_CUSTOM_MODEL_LENGTH) {
        setError(`Model slugs must be ${MAX_CUSTOM_MODEL_LENGTH} characters or less.`);
        return;
      }
      const existing = settings.providers[provider].customModels;
      if (existing.includes(normalized)) {
        setError("That custom model is already saved.");
        return;
      }
      const builtIn = liveProviders
        .find((candidate) => candidate.provider === provider)
        ?.models.some((option) => !option.isCustom && option.slug === normalized);
      if (builtIn) {
        setError("That model is already built in.");
        return;
      }

      updateSettings({
        providers: {
          ...settings.providers,
          [provider]: {
            ...settings.providers[provider],
            customModels: [...existing, normalized],
          },
        },
      });
      setCustomModelInput((prev) => ({ ...prev, [provider]: "" }));
      setError(null);
    },
    [customModelInput, liveProviders, settings.providers, updateSettings],
  );

  const removeCustomModel = useCallback(
    (provider: ProviderKind, slug: string) => {
      updateSettings({
        providers: {
          ...settings.providers,
          [provider]: {
            ...settings.providers[provider],
            customModels: settings.providers[provider].customModels.filter(
              (model) => model !== slug,
            ),
          },
        },
      });
    },
    [settings.providers, updateSettings],
  );

  return (
    <SettingsPageContainer>
      <SettingsSection title="Providers" trunkOwned>
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
            {known.map(({ recipe, live, label }) => {
              const config = settings.providers[recipe.id];
              const defaults = DEFAULT_UNIFIED_SETTINGS.providers[recipe.id];
              const isOpen = Boolean(openDetails[recipe.id]);
              const error = customModelError[recipe.id] ?? null;
              return (
                <li key={recipe.id} className="rounded-md border border-border/70 bg-card/60">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
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
                    <div className="flex shrink-0 items-center gap-2">
                      <ProviderActions
                        providerId={recipe.id}
                        live={live}
                        hasOnlineEnv={hasOnlineEnv}
                        hasRecipe={Boolean(PROVIDER_COMMANDS[recipe.id])}
                        onSetup={() => setSetupProviderId(recipe.id)}
                      />
                      <Switch
                        checked={config.enabled}
                        onCheckedChange={(checked) =>
                          patchProvider(recipe.id, { enabled: Boolean(checked) })
                        }
                        aria-label={`Enable ${label}`}
                      />
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="size-6 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setOpenDetails((prev) => ({ ...prev, [recipe.id]: !prev[recipe.id] }))
                        }
                        aria-label={`Toggle ${label} details`}
                      >
                        <ChevronDownIcon
                          className={cn("size-3.5 transition-transform", isOpen && "rotate-180")}
                        />
                      </Button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="space-y-3 border-t border-border/70 px-3 py-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          Binary path
                        </span>
                        <Input
                          value={config.binaryPath}
                          placeholder={defaults.binaryPath || "Auto-detect"}
                          onChange={(e) => patchProvider(recipe.id, { binaryPath: e.target.value })}
                          className="h-7 text-xs"
                        />
                      </label>

                      <div className="space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Custom models
                        </span>
                        {config.customModels.length > 0 ? (
                          <ul className="space-y-1">
                            {config.customModels.map((slug) => (
                              <li
                                key={slug}
                                className="flex items-center justify-between gap-2 rounded border border-border/60 bg-background/40 px-2 py-1"
                              >
                                <code className="truncate text-xs text-foreground">{slug}</code>
                                <Button
                                  size="icon-xs"
                                  variant="ghost"
                                  className="size-5 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeCustomModel(recipe.id, slug)}
                                  aria-label={`Remove ${slug}`}
                                >
                                  <XMarkIcon className="size-3" />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="flex gap-1.5">
                          <Input
                            value={customModelInput[recipe.id] ?? ""}
                            placeholder="Add a model slug"
                            onChange={(e) =>
                              setCustomModelInput((prev) => ({
                                ...prev,
                                [recipe.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addCustomModel(recipe.id);
                              }
                            }}
                            className="h-7 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            onClick={() => addCustomModel(recipe.id)}
                          >
                            Add
                          </Button>
                        </div>
                        {error ? <p className="text-xs text-destructive">{error}</p> : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </SettingsSection>

      {setupRow ? (
        <ProviderSetupDialog
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
  live,
  hasOnlineEnv,
  hasRecipe,
  onSetup,
}: {
  providerId: ProviderKind;
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
