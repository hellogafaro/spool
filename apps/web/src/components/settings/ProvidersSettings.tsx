import { useCallback, useMemo, useState } from "react";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { type ProviderKind } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { normalizeModelSlug } from "@t3tools/shared/model";

import { isWorkOsConfigured } from "~/auth/workos";
import { useSavedEnvironmentRuntimeStore } from "~/environments/runtime";
import { useSettings, useUpdateSettings } from "~/hooks/useSettings";
import { MAX_CUSTOM_MODEL_LENGTH } from "~/modelSelection";
import { useServerConfig, useServerProviders } from "~/rpc/serverState";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import {
  getProviderEnvironmentState,
  getProviderEnvironmentUnavailableMessage,
  type ProviderEnvironmentState,
} from "./provider-environment-state";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

interface ProviderRecipe {
  readonly id: ProviderKind;
  readonly fallbackLabel: string;
  readonly docs: string;
}

const RECIPES: ReadonlyArray<ProviderRecipe> = [
  {
    id: "claudeAgent",
    fallbackLabel: "Claude Code",
    docs: "https://code.claude.com/docs/en/setup",
  },
  { id: "codex", fallbackLabel: "Codex", docs: "https://github.com/openai/codex" },
  { id: "cursor", fallbackLabel: "Cursor", docs: "https://docs.cursor.com/en/cli" },
  { id: "opencode", fallbackLabel: "OpenCode", docs: "https://opencode.ai/docs/" },
];

export function ProvidersSettings() {
  const serverConfig = useServerConfig();
  const liveProviders = useServerProviders();
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const runtimeById = useSavedEnvironmentRuntimeStore((state) => state.byId);
  const [customModelInput, setCustomModelInput] = useState<Partial<Record<ProviderKind, string>>>(
    {},
  );
  const [customModelError, setCustomModelError] = useState<
    Partial<Record<ProviderKind, string | null>>
  >({});

  const environmentState = useMemo(
    () =>
      getProviderEnvironmentState({
        workOsConfigured: isWorkOsConfigured,
        hasServerConfig: serverConfig !== null,
        runtimeStates: Object.values(runtimeById),
      }),
    [runtimeById, serverConfig],
  );
  const hasOnlineEnv = environmentState === "connected";

  const known = useMemo(() => {
    return RECIPES.map((recipe) => {
      const live = liveProviders.find((entry) => entry.provider === recipe.id);
      return { recipe, live, label: live?.displayName ?? recipe.fallbackLabel };
    });
  }, [liveProviders]);

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
              {getProviderEnvironmentUnavailableMessage(environmentState)}
            </div>
          ) : null}
        </div>
      </SettingsSection>

      {known.map(({ recipe, live, label }) => {
        const config = settings.providers[recipe.id];
        const defaults = DEFAULT_UNIFIED_SETTINGS.providers[recipe.id];
        const error = customModelError[recipe.id] ?? null;
        return (
          <SettingsSection
            key={recipe.id}
            title={label}
            trunkOwned
            headerAction={
              <ProviderActions
                live={live}
                environmentState={environmentState}
                enabled={config.enabled}
                label={label}
                onEnabledChange={(enabled) => patchProvider(recipe.id, { enabled })}
              />
            }
          >
            <div className="space-y-4 px-4 py-4 sm:px-5">
              <p className="text-xs leading-relaxed text-muted-foreground/80">
                Use the environment terminal and follow the{" "}
                <a
                  className="text-foreground underline-offset-2 hover:underline"
                  href={recipe.docs}
                  target="_blank"
                  rel="noreferrer"
                >
                  official {label} instructions
                </a>{" "}
                to install and authenticate this CLI.
              </p>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Binary path</span>
                <Input
                  value={config.binaryPath}
                  placeholder={defaults.binaryPath || "Auto-detect"}
                  onChange={(e) => patchProvider(recipe.id, { binaryPath: e.target.value })}
                  className="h-7 text-xs"
                />
              </label>

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Custom models</span>
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

              <ProviderAdvancedFields
                providerId={recipe.id}
                config={config}
                patch={(patch) => patchProvider(recipe.id, patch)}
              />
            </div>
          </SettingsSection>
        );
      })}
    </SettingsPageContainer>
  );
}

function ProviderActions({
  live,
  environmentState,
  enabled,
  onEnabledChange,
  label,
}: {
  live: ReturnType<typeof useServerProviders>[number] | undefined;
  environmentState: ProviderEnvironmentState;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  label: string;
}) {
  const status = (() => {
    if (environmentState === "connecting") {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          Connecting
        </span>
      );
    }
    if (environmentState !== "connected") {
      return <Badge tone="muted">Unknown</Badge>;
    }
    if (!live) {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          Checking
        </span>
      );
    }
    return <ProviderStatusBadge live={live} />;
  })();

  return (
    <span className="flex items-center gap-2">
      {status}
      <Switch
        checked={enabled}
        onCheckedChange={(checked) => onEnabledChange(Boolean(checked))}
        aria-label={`Enable ${label}`}
      />
    </span>
  );
}

function ProviderStatusBadge({ live }: { live: ReturnType<typeof useServerProviders>[number] }) {
  if (!live.enabled) {
    return <Badge tone="muted">Disabled</Badge>;
  }
  if (!live.installed) {
    return <Badge tone="warn">CLI missing</Badge>;
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

function ProviderAdvancedFields({
  providerId,
  config,
  patch,
}: {
  providerId: ProviderKind;
  config: Record<string, unknown>;
  patch: (patch: Record<string, unknown>) => void;
}) {
  const fields: ReadonlyArray<{
    key: string;
    label: string;
    placeholder?: string;
    type?: "text" | "password";
  }> = (() => {
    if (providerId === "codex") {
      return [{ key: "homePath", label: "Home path", placeholder: "Auto-detect" }];
    }
    if (providerId === "claudeAgent") {
      return [{ key: "launchArgs", label: "Launch args", placeholder: "Extra CLI flags" }];
    }
    if (providerId === "opencode") {
      return [
        { key: "serverUrl", label: "Server URL", placeholder: "https://opencode.example.com" },
        { key: "serverPassword", label: "Server password", type: "password" as const },
      ];
    }
    return [];
  })();

  if (fields.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        Advanced
      </span>
      {fields.map((field) => {
        const value = typeof config[field.key] === "string" ? (config[field.key] as string) : "";
        return (
          <label key={field.key} className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
            <Input
              type={field.type ?? "text"}
              value={value}
              {...(field.placeholder ? { placeholder: field.placeholder } : {})}
              onChange={(e) => patch({ [field.key]: e.target.value })}
              className="h-7 text-xs"
            />
          </label>
        );
      })}
    </div>
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
