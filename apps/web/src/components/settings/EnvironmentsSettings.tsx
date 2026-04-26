import { useEffect, useState } from "react";

import { fetchClaimedEnvironmentIds } from "~/auth/pairingApi";
import { readActiveEnvironmentId, writeActiveEnvironmentId } from "~/auth/tokenStore";
import { useTrunkAuth } from "~/auth/workos";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";

export function EnvironmentsSettings() {
  const auth = useTrunkAuth();
  const [environmentIds, setEnvironmentIds] = useState<string[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(() => readActiveEnvironmentId());

  useEffect(() => {
    if (auth.status !== "signed-in") {
      setEnvironmentIds([]);
      return;
    }
    let cancelled = false;
    void auth.getAccessToken().then((token) => {
      if (!token) {
        if (!cancelled) setEnvironmentIds([]);
        return;
      }
      void fetchClaimedEnvironmentIds(token).then((ids) => {
        if (cancelled) return;
        setEnvironmentIds(ids);
        if (ids.length === 0) return;
        const stored = readActiveEnvironmentId();
        if (!stored || !ids.includes(stored)) {
          writeActiveEnvironmentId(ids[0] ?? null);
          setActiveId(ids[0] ?? null);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const handleSelect = (id: string) => {
    writeActiveEnvironmentId(id);
    setActiveId(id);
    window.location.reload();
  };

  return (
    <SettingsPageContainer>
      <SettingsSection title="Environments">
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <p className="text-xs leading-relaxed text-muted-foreground/80">
            Servers you've claimed against this Trunk account. Connections are managed by the
            Trunk CLI — no codes or domains to paste.
          </p>
          {environmentIds === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading environments…
            </div>
          ) : environmentIds.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-2">
              {environmentIds.map((id) => {
                const isActive = id === activeId;
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-foreground">{id}</p>
                      <p className="text-xs text-muted-foreground">
                        {isActive ? "Active" : "Claimed"}
                      </p>
                    </div>
                    {isActive ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-500 uppercase">
                        Selected
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleSelect(id)}>
                        Use
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Add an environment">
        <div className="space-y-3 px-4 py-4 text-sm text-muted-foreground sm:px-5">
          <p>
            Run the Trunk CLI on any machine you want to control. It opens a sign-in URL — click
            it, and the environment is claimed against this account automatically.
          </p>
          <p>
            One-click deploy:{" "}
            <a
              className="text-primary hover:underline"
              href="https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Fhellogafaro%2Ftrunk-server"
              target="_blank"
              rel="noreferrer"
            >
              Deploy on Railway
            </a>
          </p>
          <p>
            Or use the container template:{" "}
            <a
              className="text-primary hover:underline"
              href="https://github.com/hellogafaro/trunk-server"
              target="_blank"
              rel="noreferrer"
            >
              github.com/hellogafaro/trunk-server
            </a>
          </p>
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
      You don't have any environments claimed yet. Run <code>trunk pair</code> on a machine and
      click the URL it prints.
    </div>
  );
}
