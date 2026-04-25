import { useQuery } from "@tanstack/react-query";
import type { EnvironmentId, ProjectBrowseDirectoryEntry } from "@t3tools/contracts";
import { memo, useCallback, useMemo, useState } from "react";

import {
  projectBrowseDirectoryQueryOptions,
  projectReadFileQueryOptions,
} from "~/lib/projectReactQuery";
import { cn } from "~/lib/utils";
import { useTheme } from "~/hooks/useTheme";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, DocumentDuplicateIcon, FolderIcon } from "@heroicons/react/16/solid";
import { VscodeEntryIcon } from "../chat/VscodeEntryIcon";
import ChatMarkdown from "../ChatMarkdown";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";

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
}: FilesPanelProps) {
  const { resolvedTheme } = useTheme();
  const [expandedDirectories, setExpandedDirectories] = useState<ExpandedDirectoryState>({
    "": true,
  });
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

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
  const openFile = useCallback((pathValue: string) => {
    setSelectedFilePath(pathValue);
  }, []);
  const goBack = useCallback(() => {
    setSelectedFilePath(null);
  }, []);

  const rootError = formatError(rootQuery.error);
  const fileError = formatError(fileQuery.error);

  if (selectedFilePath) {
    const filename = selectedFilePath.split("/").pop() ?? selectedFilePath;
    return (
      <div className="flex h-full min-w-0 flex-col bg-background">
        <div className="flex h-12 shrink-0 items-center gap-2 px-3">
          <Button type="button" size="icon-sm" variant="outline" onClick={goBack}>
            <ChevronLeftIcon />
          </Button>
          <VscodeEntryIcon
            pathValue={selectedFilePath}
            kind="file"
            theme={resolvedTheme}
            className="size-4 shrink-0"
          />
          <span className="min-w-0 truncate text-sm">{filename}</span>
        </div>
        <FilePreview
          contents={fileQuery.data?.contents ?? null}
          error={fileError}
          isLoading={fileQuery.isLoading}
          pathValue={selectedFilePath}
          cwd={workspaceRoot}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
        <p className="text-base font-medium text-foreground">
          {workspaceRoot ? "Files" : "Files"}
        </p>
        {workspaceRoot ? (
          <Button type="button" size="xs" variant="outline" onClick={collapseAll}>
            Collapse all
          </Button>
        ) : null}
      </div>
      {!workspaceRoot ? (
        <EmptyFilesState title="No workspace available." />
      ) : (
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
      )}
    </div>
  );
});

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
          className="group flex min-h-7 w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-accent"
          style={{ paddingLeft: `${leftPadding}px` }}
          onClick={() => onToggleDirectory(entry.path)}
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
              isExpanded && "rotate-90",
            )}
          />
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
          <span className="truncate text-sm text-muted-foreground/90 group-hover:text-foreground/90">
            {entry.name}
          </span>
        </button>
        {isExpanded ? (
          <div className="space-y-0.5">
            {childrenQuery.isLoading ? (
              <p
                className="py-1 pr-2 text-sm text-muted-foreground/50"
                style={{ paddingLeft: `${leftPadding + 28}px` }}
              >
                Loading...
              </p>
            ) : childrenQuery.error ? (
              <p
                className="py-1 pr-2 text-sm text-destructive/80"
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
        "group flex min-h-7 w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-accent",
        selectedFilePath === entry.path && "bg-accent text-foreground",
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
      <span className="truncate text-sm text-muted-foreground/80 group-hover:text-foreground/90">
        {entry.name}
      </span>
    </button>
  );
}

function FilePreview(props: {
  contents: string | null;
  error: string | null;
  isLoading: boolean;
  pathValue: string;
  cwd: string | undefined;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const ext = props.pathValue.split(".").pop() ?? "";
  const isMarkdown = ext === "md" || ext === "mdx";

  if (props.isLoading) {
    return <EmptyFilesState title="Loading preview..." />;
  }
  if (props.error) {
    return <EmptyFilesState title={props.error} />;
  }

  if (isMarkdown) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 pb-3">
          <div
            className="chat-markdown-codeblock relative overflow-hidden rounded-lg border border-border"
            style={{ background: "color-mix(in srgb, var(--muted) 78%, var(--background))" }}
          >
            <button
              type="button"
              className="chat-markdown-copy-button"
              onClick={() => copyToClipboard(props.contents ?? "")}
              title={isCopied ? "Copied" : "Copy"}
              aria-label={isCopied ? "Copied" : "Copy"}
            >
              {isCopied ? <CheckIcon className="size-3" /> : <DocumentDuplicateIcon className="size-3" />}
            </button>
            <div className="p-3">
              <ChatMarkdown text={props.contents ?? ""} cwd={props.cwd} isStreaming={false} />
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="px-3 pb-1">
        <ChatMarkdown
          text={`\`\`\`${ext}\n${props.contents ?? ""}\n\`\`\``}
          cwd={props.cwd}
          isStreaming={false}
        />
      </div>
    </ScrollArea>
  );
}

function EmptyFilesState(props: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center px-3 py-2 text-sm text-muted-foreground">
      {props.title}
    </div>
  );
}
