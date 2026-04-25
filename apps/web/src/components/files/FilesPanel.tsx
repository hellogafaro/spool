import { useQuery } from "@tanstack/react-query";
import type { EnvironmentId, ProjectBrowseDirectoryEntry } from "@t3tools/contracts";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";

import {
  projectBrowseDirectoryQueryOptions,
  projectReadFileQueryOptions,
} from "~/lib/projectReactQuery";
import { cn } from "~/lib/utils";
import { useTheme } from "~/hooks/useTheme";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { ArrowLeftIcon, ArrowPathIcon, ChevronRightIcon, FolderIcon } from "@heroicons/react/16/solid";
import { VscodeEntryIcon } from "../chat/VscodeEntryIcon";

type ExpandedDirectoryState = Record<string, boolean>;

interface FilesPanelProps {
  environmentId: EnvironmentId;
  workspaceRoot: string | undefined;
  mode?: "sheet" | "sidebar";
}

const EMPTY_ENTRIES: ProjectBrowseDirectoryEntry[] = [];

function entrySortKey(entry: ProjectBrowseDirectoryEntry): string {
  return `${entry.kind === "directory" ? "0" : "1"}:${entry.name}`;
}

function formatError(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : "Workspace request failed.";
}

export const FilesPanel = memo(function FilesPanel({
  environmentId,
  workspaceRoot,
  mode = "sidebar",
}: FilesPanelProps) {
  const { resolvedTheme } = useTheme();
  const [expandedDirectories, setExpandedDirectories] = useState<ExpandedDirectoryState>({
    "": true,
  });
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const rootQuery = useQuery(
    projectBrowseDirectoryQueryOptions({
      environmentId,
      cwd: workspaceRoot ?? null,
      relativePath: "",
      enabled: Boolean(workspaceRoot),
    }),
  );
  const fileQuery = useQuery(
    projectReadFileQueryOptions({
      environmentId,
      cwd: workspaceRoot ?? null,
      relativePath: selectedFilePath,
      enabled: Boolean(workspaceRoot && selectedFilePath),
    }),
  );
  const sortedRootEntries = useMemo(
    () =>
      [...(rootQuery.data?.entries ?? EMPTY_ENTRIES)].toSorted((left, right) =>
        entrySortKey(left).localeCompare(entrySortKey(right), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [rootQuery.data?.entries],
  );
  const toggleDirectory = useCallback((pathValue: string) => {
    setExpandedDirectories((current) => ({
      ...current,
      [pathValue]: !(current[pathValue] ?? false),
    }));
  }, []);
  const collapseAll = useCallback(() => {
    setExpandedDirectories({ "": true });
  }, []);
  const openFile = useCallback(
    (pathValue: string) => {
      setSelectedFilePath(pathValue);
      if (mode === "sheet") {
        setMobilePreviewOpen(true);
      }
    },
    [mode],
  );

  if (!workspaceRoot) {
    return (
      <FilesPanelShell title="Files">
        <EmptyFilesState title="No workspace available." />
      </FilesPanelShell>
    );
  }

  const rootError = formatError(rootQuery.error);
  const fileError = formatError(fileQuery.error);
  const showMobileTree = mode !== "sheet" || !mobilePreviewOpen;
  const showPreview = mode !== "sheet" || mobilePreviewOpen;

  return (
    <FilesPanelShell
      title="Files"
      action={
        <Button type="button" size="xs" variant="outline" onClick={collapseAll}>
          Collapse all
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {showMobileTree ? (
          <div
            className={cn(
              "min-h-0 border-border/70",
              mode === "sheet" ? "flex-1" : "w-[min(44%,22rem)] border-r",
            )}
          >
            <ScrollArea className="h-full">
              <div className="space-y-0.5 p-2">
                {rootQuery.isLoading ? (
                  <EmptyFilesState title="Loading files..." />
                ) : rootError ? (
                  <EmptyFilesState title={rootError} />
                ) : sortedRootEntries.length === 0 ? (
                  <EmptyFilesState title="No files found." />
                ) : (
                  sortedRootEntries.map((entry) => (
                    <FileTreeEntry
                      key={entry.path}
                      cwd={workspaceRoot}
                      depth={0}
                      entry={entry}
                      environmentId={environmentId}
                      expandedDirectories={expandedDirectories}
                      resolvedTheme={resolvedTheme}
                      selectedFilePath={selectedFilePath}
                      onOpenFile={openFile}
                      onToggleDirectory={toggleDirectory}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        ) : null}
        {showPreview ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {mode === "sheet" && mobilePreviewOpen ? (
              <div className="flex h-10 shrink-0 items-center px-2">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setMobilePreviewOpen(false)}
                >
                  <ArrowLeftIcon className="size-3.5" />
                  Files
                </Button>
              </div>
            ) : null}
            <FilePreview
              contents={fileQuery.data?.contents ?? null}
              error={fileError}
              isLoading={fileQuery.isLoading}
              pathValue={selectedFilePath}
              resolvedTheme={resolvedTheme}
            />
          </div>
        ) : null}
      </div>
    </FilesPanelShell>
  );
});

function FilesPanelShell(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
        <p className="text-base font-medium text-foreground">
          {props.title}
        </p>
        <div className="flex items-center gap-1.5">{props.action}</div>
      </div>
      {props.children}
    </div>
  );
}

function FileTreeEntry(props: {
  cwd: string;
  depth: number;
  entry: ProjectBrowseDirectoryEntry;
  environmentId: EnvironmentId;
  expandedDirectories: ExpandedDirectoryState;
  resolvedTheme: "light" | "dark";
  selectedFilePath: string | null;
  onOpenFile: (pathValue: string) => void;
  onToggleDirectory: (pathValue: string) => void;
}) {
  const {
    cwd,
    depth,
    entry,
    environmentId,
    expandedDirectories,
    resolvedTheme,
    selectedFilePath,
    onOpenFile,
    onToggleDirectory,
  } = props;
  const isDirectory = entry.kind === "directory";
  const isExpanded = expandedDirectories[entry.path] ?? false;
  const childrenQuery = useQuery(
    projectBrowseDirectoryQueryOptions({
      environmentId,
      cwd,
      relativePath: entry.path,
      enabled: isDirectory && isExpanded,
    }),
  );
  const children = useMemo(
    () =>
      [...(childrenQuery.data?.entries ?? EMPTY_ENTRIES)].toSorted((left, right) =>
        entrySortKey(left).localeCompare(entrySortKey(right), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    [childrenQuery.data?.entries],
  );
  const leftPadding = 8 + depth * 14;

  if (isDirectory) {
    return (
      <div>
        <button
          type="button"
          className="group flex min-h-7 w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/80"
          style={{ paddingLeft: `${leftPadding}px` }}
          onClick={() => onToggleDirectory(entry.path)}
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
              isExpanded && "rotate-90",
            )}
          />
          {isExpanded ? (
            <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
          )}
          <span className="truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground/90">
            {entry.name}
          </span>
        </button>
        {isExpanded ? (
          <div className="space-y-0.5">
            {childrenQuery.isLoading ? (
              <p
                className="py-1 pr-2 font-mono text-[11px] text-muted-foreground/50"
                style={{ paddingLeft: `${leftPadding + 28}px` }}
              >
                Loading...
              </p>
            ) : childrenQuery.error ? (
              <p
                className="py-1 pr-2 text-[11px] text-destructive/80"
                style={{ paddingLeft: `${leftPadding + 28}px` }}
              >
                {formatError(childrenQuery.error)}
              </p>
            ) : (
              children.map((child) => (
                <FileTreeEntry
                  key={child.path}
                  cwd={cwd}
                  depth={depth + 1}
                  entry={child}
                  environmentId={environmentId}
                  expandedDirectories={expandedDirectories}
                  resolvedTheme={resolvedTheme}
                  selectedFilePath={selectedFilePath}
                  onOpenFile={onOpenFile}
                  onToggleDirectory={onToggleDirectory}
                />
              ))
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "group flex min-h-7 w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/80",
        selectedFilePath === entry.path && "bg-background/80 text-foreground",
      )}
      style={{ paddingLeft: `${leftPadding}px` }}
      onClick={() => onOpenFile(entry.path)}
    >
      <span aria-hidden="true" className="size-3.5 shrink-0" />
      <VscodeEntryIcon
        pathValue={entry.path}
        kind="file"
        theme={resolvedTheme}
        className="size-3.5 text-muted-foreground/70"
      />
      <span className="truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground/90">
        {entry.name}
      </span>
    </button>
  );
}

function FilePreview(props: {
  contents: string | null;
  error: string | null;
  isLoading: boolean;
  pathValue: string | null;
  resolvedTheme: "light" | "dark";
}) {
  if (!props.pathValue) {
    return <EmptyFilesState title="Select a file to preview." />;
  }
  if (props.isLoading) {
    return <EmptyFilesState title="Loading preview..." />;
  }
  if (props.error) {
    return <EmptyFilesState title={props.error} />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <VscodeEntryIcon
          pathValue={props.pathValue}
          kind="file"
          theme={props.resolvedTheme}
          className="size-4"
        />
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {props.pathValue}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <pre className="p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/85">
          {props.contents ?? ""}
        </pre>
      </ScrollArea>
    </div>
  );
}

function EmptyFilesState(props: { title: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <ArrowPathIcon className="mb-2 size-4 text-muted-foreground/30" />
      <p className="text-[13px] text-muted-foreground/55">{props.title}</p>
    </div>
  );
}
