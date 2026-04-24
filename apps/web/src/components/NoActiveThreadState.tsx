import { Empty, EmptyDescription, EmptyHeader } from "./ui/empty";
import { SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { SpoolLogo } from "./ui/spool-logo";
import { isElectron } from "../env";
import { cn } from "~/lib/utils";

export function NoActiveThreadState() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header
          className={cn(
            "border-b border-border px-3 sm:px-5",
            isElectron
              ? "drag-region flex h-12 items-center wco:h-[env(titlebar-area-height)]"
              : "flex h-12 items-center",
          )}
        >
          {isElectron ? (
            <span className="text-xs text-muted-foreground/50 wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]">
              No active thread
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
                No active thread
              </span>
            </div>
          )}
        </header>

        <Empty className="flex-1 p-0 md:p-0">
          <SpoolLogo className="size-9 text-white opacity-5" />
          <EmptyHeader className="max-w-none">
            <EmptyDescription className="text-sm text-muted-foreground/78">
              Select an existing thread or create a new one to get started.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </SidebarInset>
  );
}
