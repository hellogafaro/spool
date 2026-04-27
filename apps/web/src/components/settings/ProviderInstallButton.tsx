import { CheckIcon } from "@heroicons/react/16/solid";

import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

import { useProviderInstall } from "./useProviderInstall";

export function ProviderInstallButton({ providerId }: { providerId: string }) {
  const { status, errorMessage, install } = useProviderInstall(providerId);

  if (status === "installing") {
    return (
      <Button size="sm" variant="outline" disabled className="gap-1.5">
        <Spinner className="size-3" />
        Installing…
      </Button>
    );
  }
  if (status === "done") {
    return (
      <Button size="sm" variant="outline" disabled className="gap-1.5 text-emerald-500">
        <CheckIcon className="size-3.5" />
        Installed
      </Button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={install}>
        Install
      </Button>
      {status === "error" && errorMessage ? (
        <p className="text-xs text-destructive">{errorMessage}</p>
      ) : null}
    </div>
  );
}
