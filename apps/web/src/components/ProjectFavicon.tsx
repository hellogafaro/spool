import type { EnvironmentId } from "@t3tools/contracts";
import { FolderIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { resolveEnvironmentHttpUrl } from "../environments/runtime";

const loadedProjectFaviconSrcs = new Set<string>();

/**
 * SaaS environments don't expose a directly-reachable HTTP base, so
 * resolveEnvironmentHttpUrl throws for them. Treat that as "no favicon
 * available" and render the folder fallback.
 */
function tryResolveFaviconSrc(environmentId: EnvironmentId, cwd: string): string | null {
  try {
    return resolveEnvironmentHttpUrl({
      environmentId,
      pathname: "/api/project-favicon",
      searchParams: { cwd },
    });
  } catch {
    return null;
  }
}

export function ProjectFavicon(input: {
  environmentId: EnvironmentId;
  cwd: string;
  className?: string;
}) {
  const src = tryResolveFaviconSrc(input.environmentId, input.cwd);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(() =>
    src && loadedProjectFaviconSrcs.has(src) ? "loaded" : "loading",
  );

  if (!src) {
    return (
      <FolderIcon
        className={`size-3.5 shrink-0 text-muted-foreground/50 ${input.className ?? ""}`}
      />
    );
  }

  return (
    <>
      {status !== "loaded" ? (
        <FolderIcon
          className={`size-3.5 shrink-0 text-muted-foreground/50 ${input.className ?? ""}`}
        />
      ) : null}
      <img
        src={src}
        alt=""
        className={`size-3.5 shrink-0 rounded-sm object-contain ${status === "loaded" ? "" : "hidden"} ${input.className ?? ""}`}
        onLoad={() => {
          loadedProjectFaviconSrcs.add(src);
          setStatus("loaded");
        }}
        onError={() => setStatus("error")}
      />
    </>
  );
}
