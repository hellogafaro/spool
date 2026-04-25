import { TurnId } from "@t3tools/contracts";

export type ThreadPanelTab = "tasks" | "diff" | "files";

export interface DiffRouteSearch {
  panel?: ThreadPanelTab | undefined;
  diffTurnId?: TurnId | undefined;
  diffFilePath?: string | undefined;
}

function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function stripDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "panel" | "diff" | "plan" | "tasks" | "diffTurnId" | "diffFilePath"> {
  const {
    panel: _panel,
    diff: _diff,
    plan: _plan,
    tasks: _tasks,
    diffTurnId: _diffTurnId,
    diffFilePath: _diffFilePath,
    ...rest
  } = params;
  return rest as Omit<T, "panel" | "diff" | "plan" | "tasks" | "diffTurnId" | "diffFilePath">;
}

export function clearThreadPanelSearchParams<T extends Record<string, unknown>>(params: T) {
  return {
    ...stripDiffSearchParams(params),
    panel: undefined,
    diff: undefined,
    plan: undefined,
    tasks: undefined,
    diffTurnId: undefined,
    diffFilePath: undefined,
  };
}

function parsePanel(value: unknown): ThreadPanelTab | undefined {
  return value === "tasks" || value === "diff" || value === "files" ? value : undefined;
}

export function parseDiffRouteSearch(search: Record<string, unknown>): DiffRouteSearch {
  const legacyDiff = isDiffOpenValue(search.diff);
  const legacyPlan = isDiffOpenValue(search.plan) || isDiffOpenValue(search.tasks);
  const panel =
    parsePanel(search.panel) ?? (legacyDiff ? "diff" : legacyPlan ? "tasks" : undefined);
  const diffTurnIdRaw = panel === "diff" ? normalizeSearchString(search.diffTurnId) : undefined;
  const diffTurnId = diffTurnIdRaw ? TurnId.make(diffTurnIdRaw) : undefined;
  const diffFilePath =
    panel === "diff" && diffTurnId ? normalizeSearchString(search.diffFilePath) : undefined;

  return {
    ...(panel ? { panel } : {}),
    ...(diffTurnId ? { diffTurnId } : {}),
    ...(diffFilePath ? { diffFilePath } : {}),
  };
}
