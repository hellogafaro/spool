import { type EnvironmentId } from "@t3tools/contracts";
import { useAuth } from "@workos-inc/authkit-react";
import { useState } from "react";

import { unclaimEnvironment } from "~/auth/pairing";
import { useClaimedEnvironments } from "~/auth/useClaimedEnvironments";
import { useStore } from "~/store";
import { InstallationGuide } from "../onboarding/InstallationGuide";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

export function EnvironmentsSettings() {
  const auth = useAuth();
  const environments = useClaimedEnvironments();
  const activeId = useStore((s) => s.activeEnvironmentId);
  const setActiveEnvironmentId = useStore((s) => s.setActiveEnvironmentId);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleSelect = (id: string) => {
    setActiveEnvironmentId(id as EnvironmentId);
    window.location.reload();
  };

  const handleRemove = async (id: string) => {
    if (!window.confirm(`Remove environment ${id} from this account?`)) return;
    setRemovingId(id);
    setErrorMessage("");
    try {
      const token = await auth.getAccessToken();
      if (!token) {
        setErrorMessage("Could not get an access token. Try signing out and back in.");
        return;
      }
      await unclaimEnvironment({ environmentId: id, accessToken: token });
      // Force a fresh session token so the removed env disappears from the
      // `environments` JWT claim right away.
      await auth.getAccessToken({ forceRefresh: true });
      await environments.refetch();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not remove environment.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <SettingsPageContainer>
      <SettingsSection title="Environments">
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground/80">
              Servers you've claimed against this Trunk account. Connections are managed by the
              Trunk CLI — no codes or domains to paste.
            </p>
            <Button
              size="xs"
              variant="outline"
              onClick={() => void environments.refetch()}
              disabled={environments.isFetching}
            >
              {environments.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          {errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}
          {environments.isLoading || !environments.data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading environments…
            </div>
          ) : environments.data.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-2">
              {environments.data.map((id) => {
                const isActive = id === activeId;
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card/60 px-3 py-2"
                  >
                    <p className="truncate font-mono text-sm text-foreground">{id}</p>
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-500 uppercase">
                          Selected
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => handleSelect(id)}>
                          Use
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={removingId === id}
                        onClick={() => void handleRemove(id)}
                      >
                        {removingId === id ? "Removing…" : "Remove"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Add an environment">
        <div className="px-4 py-4 sm:px-5">
          <InstallationGuide />
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
      You don't have any environments claimed yet. Run the installer above on a machine.
    </div>
  );
}
