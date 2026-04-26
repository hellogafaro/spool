import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { PairingApiError, claimServer } from "../auth/pairingApi";
import { writeClaimedServerId } from "../auth/tokenStore";
import { useTrunkAccessToken, useTrunkAuth } from "../auth/workos";
import { APP_DISPLAY_NAME } from "../branding";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

export const Route = createFileRoute("/connect-server")({
  component: ConnectServerRouteView,
});

function ConnectServerRouteView() {
  const auth = useTrunkAuth();
  const { refresh } = useTrunkAccessToken();
  const navigate = useNavigate();
  const [serverId, setServerId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = serverId.trim();
    if (!trimmed) {
      setErrorMessage("Enter the server id printed by `trunk pair`.");
      return;
    }
    if (auth.status !== "signed-in") {
      setErrorMessage("Sign in before claiming a server.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const token = await refresh();
      if (!token) {
        setErrorMessage("Could not get an access token. Try signing out and back in.");
        return;
      }
      await claimServer({ serverId: trimmed, accessToken: token });
      writeClaimedServerId(trimmed);
      window.location.replace("/");
    } catch (error) {
      setErrorMessage(claimErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-md space-y-5 rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xl shadow-black/10 backdrop-blur-md">
        <header className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {APP_DISPLAY_NAME}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Connect a server</h1>
          <p className="text-sm text-muted-foreground">
            Run <code className="rounded bg-muted px-1 py-0.5 text-xs">trunk pair</code> on the
            machine you want to control, then paste the server id below.
          </p>
        </header>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="server-id">
              Server id
            </label>
            <Input
              id="server-id"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              disabled={isSubmitting}
              nativeInput
              onChange={(event) => setServerId(event.currentTarget.value)}
              placeholder="amber-otter-1f3d"
              spellCheck={false}
              value={serverId}
            />
          </div>

          {errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <Button disabled={isSubmitting} size="sm" type="submit">
            {isSubmitting ? "Connecting…" : "Connect"}
          </Button>
        </form>
      </section>
    </div>
  );
}

function claimErrorMessage(error: unknown): string {
  if (error instanceof PairingApiError) {
    if (error.status === 401) return "Your session expired. Sign in again.";
    if (error.status === 403) return "That server is already claimed by another account.";
    return error.message;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Could not connect to that server.";
}
