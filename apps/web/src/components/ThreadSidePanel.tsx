import type { EnvironmentId } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import { lazy, memo, Suspense, useEffect, useState } from "react";

import type { ActivePlanState, LatestProposedPlanState } from "../session-logic";
import type { ThreadPanelTab } from "../diffRouteSearch";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { ClipboardDocumentListIcon, CodeBracketSquareIcon, DocumentIcon } from "@heroicons/react/16/solid";
import PlanSidebar from "./PlanSidebar";
import { FilesPanel } from "./files/FilesPanel";
import { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "./DiffPanelShell";

const DiffPanel = lazy(() => import("./DiffPanel"));

interface ThreadSidePanelProps {
  activeTab: ThreadPanelTab;
  mode: "sheet" | "sidebar";
  onTabChange: (tab: ThreadPanelTab) => void;
  tasks: {
    activePlan: ActivePlanState | null;
    activeProposedPlan: LatestProposedPlanState | null;
    label: string;
    environmentId: EnvironmentId;
    markdownCwd: string | undefined;
    workspaceRoot: string | undefined;
    timestampFormat: TimestampFormat;
  };
  files: {
    environmentId: EnvironmentId;
    workspaceRoot: string | undefined;
  };
}

const PANEL_TABS: Array<{
  value: ThreadPanelTab;
  label: string;
  icon: typeof ClipboardDocumentListIcon;
}> = [
  { value: "tasks", label: "Tasks", icon: ClipboardDocumentListIcon },
  { value: "diff", label: "Diff", icon: CodeBracketSquareIcon },
  { value: "files", label: "Files", icon: DocumentIcon },
];

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => (
  <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
    <DiffPanelLoadingState label="Loading diff viewer..." />
  </DiffPanelShell>
);

export const ThreadSidePanel = memo(function ThreadSidePanel({
  activeTab,
  mode,
  onTabChange,
  tasks,
  files,
}: ThreadSidePanelProps) {
  const [hasOpenedDiff, setHasOpenedDiff] = useState(activeTab === "diff");

  useEffect(() => {
    if (activeTab === "diff") {
      setHasOpenedDiff(true);
    }
  }, [activeTab]);

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col bg-background text-foreground",
        mode === "sidebar" && "w-full",
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 px-2">
        <div className="flex min-w-0 items-center gap-1">
          {PANEL_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.value}
                type="button"
                size="sm"
                variant={activeTab === tab.value ? "secondary" : "ghost"}
                className="gap-1.5"
                onClick={() => onTabChange(tab.value)}
              >
                <Icon />
                <span>{tab.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {activeTab === "tasks" ? (
          <PlanSidebar
            activePlan={tasks.activePlan}
            activeProposedPlan={tasks.activeProposedPlan}
            label={tasks.label}
            environmentId={tasks.environmentId}
            markdownCwd={tasks.markdownCwd}
            workspaceRoot={tasks.workspaceRoot}
            timestampFormat={tasks.timestampFormat}
            mode={mode}
          />
        ) : null}
        {hasOpenedDiff ? (
          <div className={cn("h-full min-h-0", activeTab !== "diff" && "hidden")}>
            <DiffWorkerPoolProvider>
              <Suspense fallback={<DiffLoadingFallback mode={mode} />}>
                <DiffPanel mode={mode} />
              </Suspense>
            </DiffWorkerPoolProvider>
          </div>
        ) : null}
        {activeTab === "files" ? (
          <FilesPanel
            environmentId={files.environmentId}
            workspaceRoot={files.workspaceRoot}
            mode={mode}
          />
        ) : null}
      </div>
    </div>
  );
});
