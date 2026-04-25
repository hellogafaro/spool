import { promises as fs } from "node:fs";

import { Effect, FileSystem, Layer, Path } from "effect";

import {
  WorkspaceFileSystem,
  WorkspaceFileSystemError,
  type WorkspaceFileSystemShape,
} from "../Services/WorkspaceFileSystem.ts";
import { WorkspaceEntries } from "../Services/WorkspaceEntries.ts";
import { WorkspacePaths } from "../Services/WorkspacePaths.ts";

const READ_FILE_MAX_BYTES = 1024 * 1024;
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "dist",
  "node_modules",
]);

function hasBinaryByte(bytes: Uint8Array): boolean {
  return bytes.includes(0);
}

export const makeWorkspaceFileSystem = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspacePaths = yield* WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries;

  const resolveWorkspacePath = Effect.fn("WorkspaceFileSystem.resolveWorkspacePath")(
    function* (input: { cwd: string; relativePath: string }) {
      const normalizedCwd = yield* workspacePaths.normalizeWorkspaceRoot(input.cwd).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceFileSystemError({
              cwd: input.cwd,
              relativePath: input.relativePath,
              operation: "workspaceFileSystem.normalizeWorkspaceRoot",
              detail: cause.message,
              cause,
            }),
        ),
      );
      if (input.relativePath.trim().length === 0) {
        return { absolutePath: normalizedCwd, relativePath: "" };
      }
      return yield* workspacePaths.resolveRelativePathWithinRoot({
        workspaceRoot: normalizedCwd,
        relativePath: input.relativePath,
      });
    },
  );

  const browseDirectory: WorkspaceFileSystemShape["browseDirectory"] = Effect.fn(
    "WorkspaceFileSystem.browseDirectory",
  )(function* (input) {
    const target = yield* resolveWorkspacePath(input);
    const entries = yield* Effect.tryPromise({
      try: async () => {
        const dirents = await fs.readdir(target.absolutePath, { withFileTypes: true });
        return dirents
          .filter((dirent) => {
            if (!dirent.name || dirent.name === "." || dirent.name === "..") return false;
            if (dirent.isDirectory()) return !IGNORED_DIRECTORY_NAMES.has(dirent.name);
            return dirent.isFile();
          })
          .map((dirent) => {
            const relativePath = target.relativePath
              ? path.join(target.relativePath, dirent.name)
              : dirent.name;
            return {
              name: dirent.name,
              path: relativePath.replaceAll("\\", "/"),
              kind: dirent.isDirectory() ? ("directory" as const) : ("file" as const),
            };
          })
          .toSorted((left, right) => {
            if (left.kind !== right.kind) {
              return left.kind === "directory" ? -1 : 1;
            }
            return left.name.localeCompare(right.name, undefined, {
              numeric: true,
              sensitivity: "base",
            });
          });
      },
      catch: (cause) =>
        new WorkspaceFileSystemError({
          cwd: input.cwd,
          relativePath: input.relativePath,
          operation: "workspaceFileSystem.browseDirectory",
          detail: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    });
    return { relativePath: target.relativePath, entries };
  });

  const readFile: WorkspaceFileSystemShape["readFile"] = Effect.fn("WorkspaceFileSystem.readFile")(
    function* (input) {
      const target = yield* resolveWorkspacePath(input);
      return yield* Effect.tryPromise({
        try: async () => {
          const stat = await fs.stat(target.absolutePath);
          if (!stat.isFile()) {
            throw new Error("Path is not a file.");
          }
          if (stat.size > READ_FILE_MAX_BYTES) {
            throw new Error("File is too large to preview.");
          }

          const bytes = await fs.readFile(target.absolutePath);
          if (hasBinaryByte(bytes)) {
            throw new Error("Binary files cannot be previewed.");
          }

          let contents: string;
          try {
            contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            throw new Error("File is not valid UTF-8 text.");
          }

          return {
            relativePath: target.relativePath,
            contents,
            sizeBytes: stat.size,
            truncated: false,
          };
        },
        catch: (cause) =>
          new WorkspaceFileSystemError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation: "workspaceFileSystem.readFile",
            detail: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      });
    },
  );

  const writeFile: WorkspaceFileSystemShape["writeFile"] = Effect.fn(
    "WorkspaceFileSystem.writeFile",
  )(function* (input) {
    const target = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot: input.cwd,
      relativePath: input.relativePath,
    });

    yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation: "workspaceFileSystem.makeDirectory",
            detail: cause.message,
            cause,
          }),
      ),
    );
    yield* fileSystem.writeFileString(target.absolutePath, input.contents).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceFileSystemError({
            cwd: input.cwd,
            relativePath: input.relativePath,
            operation: "workspaceFileSystem.writeFile",
            detail: cause.message,
            cause,
          }),
      ),
    );
    yield* workspaceEntries.invalidate(input.cwd);
    return { relativePath: target.relativePath };
  });
  return { browseDirectory, readFile, writeFile } satisfies WorkspaceFileSystemShape;
});

export const WorkspaceFileSystemLive = Layer.effect(WorkspaceFileSystem, makeWorkspaceFileSystem);
