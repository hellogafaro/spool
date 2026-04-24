import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ProviderInteractionMode,
  type ProviderOptionDescriptor,
  type ProviderKind,
  type ProviderOptionSelection,
  type ServerProvider,
} from "@t3tools/contracts";
import {
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
} from "@t3tools/shared/model";
import { memo, useMemo } from "react";
import { ChevronDownIcon, FlashlightIcon } from "~/components/ui/icons";

import { getProviderModelCapabilities } from "../../providerModels";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuTrigger,
} from "../ui/menu";
import { cn } from "~/lib/utils";
import { getTriggerDisplayModelName } from "./providerIconUtils";

type ProviderModelsByProvider = Record<
  ProviderKind,
  ReadonlyArray<ServerProvider["models"][number]>
>;

function getCurrentModel(input: {
  provider: ProviderKind;
  model: string;
  modelOptionsByProvider: ProviderModelsByProvider;
}) {
  return (
    input.modelOptionsByProvider[input.provider].find((model) => model.slug === input.model) ?? {
      slug: input.model,
      name: input.model,
      isCustom: true,
      capabilities: null,
    }
  );
}

function getTraitsSummary(input: {
  provider: ProviderKind;
  model: string;
  models: ReadonlyArray<ServerProvider["models"][number]>;
  modelOptions: ReadonlyArray<ProviderOptionSelection> | null | undefined;
}): string {
  const caps = getProviderModelCapabilities(input.models, input.model, input.provider);
  const descriptors = getProviderOptionDescriptors({ caps, selections: input.modelOptions });

  return (
    descriptors
      .map((descriptor) => {
        if (descriptor.type === "boolean") {
          if (descriptor.id === "fastMode") {
            return descriptor.currentValue === true ? "Fast" : null;
          }
          return descriptor.currentValue === true ? descriptor.label : null;
        }
        return getProviderOptionCurrentLabel(descriptor);
      })
      .filter((label): label is string => typeof label === "string" && label.length > 0)
      .join(" · ") || ""
  );
}

function getCombinedControlsLabel(descriptor: ProviderOptionDescriptor): string {
  return descriptor.id === "reasoningEffort" ? "Intelligence" : descriptor.label;
}

function replaceDescriptorCurrentValue(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
  descriptorId: string,
  currentValue: string | boolean | undefined,
): ReadonlyArray<ProviderOptionDescriptor> {
  return descriptors.map((descriptor) =>
    descriptor.id !== descriptorId
      ? descriptor
      : descriptor.type === "boolean"
        ? {
            ...descriptor,
            ...(typeof currentValue === "boolean" ? { currentValue } : {}),
          }
        : {
            ...descriptor,
            ...(typeof currentValue === "string" ? { currentValue } : {}),
          },
  );
}

export const ComposerCombinedControlsMenu = memo(function ComposerCombinedControlsMenu(props: {
  compact?: boolean;
  provider: ProviderKind;
  model: string;
  models: ReadonlyArray<ServerProvider["models"][number]>;
  modelOptions: ReadonlyArray<ProviderOptionSelection> | null | undefined;
  modelOptionsByProvider: ProviderModelsByProvider;
  interactionMode: ProviderInteractionMode;
  showInteractionModeToggle: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProviderModelChange: (provider: ProviderKind, model: string) => void;
  onModelOptionsChange: (nextOptions: ReadonlyArray<ProviderOptionSelection> | undefined) => void;
  onInteractionModeChange: (mode: ProviderInteractionMode) => void;
}) {
  const currentModel = useMemo(
    () =>
      getCurrentModel({
        provider: props.provider,
        model: props.model,
        modelOptionsByProvider: props.modelOptionsByProvider,
      }),
    [props.model, props.modelOptionsByProvider, props.provider],
  );
  const providerModels = useMemo(
    () =>
      props.modelOptionsByProvider[props.provider].toSorted((a, b) => {
        const aIsDefault = props.provider === "codex" && a.slug === DEFAULT_MODEL_BY_PROVIDER.codex;
        const bIsDefault = props.provider === "codex" && b.slug === DEFAULT_MODEL_BY_PROVIDER.codex;
        if (aIsDefault !== bIsDefault) {
          return aIsDefault ? -1 : 1;
        }
        return 0;
      }),
    [props.modelOptionsByProvider, props.provider],
  );
  const traitsSummary = useMemo(
    () =>
      getTraitsSummary({
        provider: props.provider,
        model: props.model,
        models: props.models,
        modelOptions: props.modelOptions,
      }),
    [props.model, props.modelOptions, props.models, props.provider],
  );
  const descriptors = useMemo(() => {
    const caps = getProviderModelCapabilities(props.models, props.model, props.provider);
    return getProviderOptionDescriptors({ caps, selections: props.modelOptions });
  }, [props.model, props.modelOptions, props.models, props.provider]);
  const selectDescriptors = descriptors.filter(
    (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "select" }> =>
      descriptor.type === "select",
  );
  const fastModeDescriptor =
    descriptors.find(
      (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "boolean" }> =>
        descriptor.type === "boolean" && descriptor.id === "fastMode",
    ) ?? null;
  const otherBooleanDescriptors = descriptors.filter(
    (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "boolean" }> =>
      descriptor.type === "boolean" && descriptor.id !== "fastMode",
  );
  const updateDescriptor = (descriptorId: string, currentValue: string | boolean | undefined) => {
    props.onModelOptionsChange(
      buildProviderOptionSelectionsFromDescriptors(
        replaceDescriptorCurrentValue(descriptors, descriptorId, currentValue),
      ),
    );
  };
  const triggerLabel = [getTriggerDisplayModelName(currentModel), traitsSummary]
    .filter(Boolean)
    .join(" · ");

  return (
    <Menu open={props.open} onOpenChange={props.onOpenChange}>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            aria-label={triggerLabel || "Composer controls"}
            className={cn(
              "min-w-0 shrink justify-start overflow-hidden whitespace-nowrap text-muted-foreground/70 hover:text-foreground/80 [&_svg]:mx-0",
              !props.compact && "max-w-64 sm:max-w-72",
            )}
            data-chat-composer-combined-controls="true"
          />
        }
      >
        <span className="flex min-w-0 w-full items-center gap-2 overflow-hidden">
          <FlashlightIcon className="size-4 shrink-0" aria-hidden />
          {props.compact ? null : <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>}
          <ChevronDownIcon aria-hidden className="size-3 shrink-0 opacity-60" />
        </span>
      </MenuTrigger>
      <MenuPopup align="start" className="min-w-64">
        {selectDescriptors.map((descriptor, index) => (
          <MenuGroup key={descriptor.id}>
            {index > 0 ? <MenuDivider /> : null}
            <MenuGroupLabel>{getCombinedControlsLabel(descriptor)}</MenuGroupLabel>
            <MenuRadioGroup
              value={(getProviderOptionCurrentValue(descriptor) as string | undefined) ?? ""}
              onValueChange={(value) => {
                if (!value) return;
                updateDescriptor(descriptor.id, value);
              }}
            >
              {descriptor.options.map((option) => (
                <MenuRadioItem key={option.id} value={option.id}>
                  {option.label}
                  {option.isDefault ? " (default)" : ""}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        ))}

        {selectDescriptors.length > 0 ? <MenuDivider /> : null}

        <MenuGroup>
          <MenuGroupLabel>Model</MenuGroupLabel>
          <MenuRadioGroup
            value={props.model}
            onValueChange={(value) => {
              if (!value || value === props.model) return;
              props.onProviderModelChange(props.provider, value);
            }}
          >
            {providerModels.map((model) => (
              <MenuRadioItem key={model.slug} value={model.slug}>
                <span className={cn("truncate", model.isCustom && "font-mono")}>
                  {getTriggerDisplayModelName(model)}
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>

        {fastModeDescriptor ? (
          <>
            <MenuDivider />
            <MenuGroup>
              <MenuGroupLabel>Speed</MenuGroupLabel>
              <MenuRadioGroup
                value={fastModeDescriptor.currentValue === true ? "fast" : "standard"}
                onValueChange={(value) => {
                  updateDescriptor(fastModeDescriptor.id, value === "fast");
                }}
              >
                <MenuRadioItem value="standard" className="items-start">
                  <span className="grid gap-0.5">
                    <span>Standard</span>
                    <span className="text-muted-foreground text-xs">
                      Default speed with normal credit usage
                    </span>
                  </span>
                </MenuRadioItem>
                <MenuRadioItem value="fast" className="items-start">
                  <span className="grid gap-0.5">
                    <span>Fast</span>
                    <span className="text-muted-foreground text-xs">
                      Faster responses with increased usage
                    </span>
                  </span>
                </MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
          </>
        ) : null}

        {otherBooleanDescriptors.map((descriptor) => (
          <MenuGroup key={descriptor.id}>
            <MenuDivider />
            <MenuGroupLabel>{descriptor.label}</MenuGroupLabel>
            <MenuRadioGroup
              value={descriptor.currentValue === true ? "on" : "off"}
              onValueChange={(value) => {
                updateDescriptor(descriptor.id, value === "on");
              }}
            >
              <MenuRadioItem value="on">On</MenuRadioItem>
              <MenuRadioItem value="off">Off</MenuRadioItem>
            </MenuRadioGroup>
          </MenuGroup>
        ))}

        {props.showInteractionModeToggle ? (
          <>
            <MenuDivider />
            <MenuGroup>
              <MenuGroupLabel>Mode</MenuGroupLabel>
              <MenuRadioGroup
                value={props.interactionMode}
                onValueChange={(value) => {
                  if (!value || value === props.interactionMode) return;
                  props.onInteractionModeChange(value as ProviderInteractionMode);
                }}
              >
                <MenuRadioItem value="default">Build</MenuRadioItem>
                <MenuRadioItem value="plan">Plan</MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});
