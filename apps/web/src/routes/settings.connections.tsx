import { createFileRoute } from "@tanstack/react-router";

import { isWorkOsConfigured } from "../auth/workos";
import { ConnectionsSettings } from "../components/settings/ConnectionsSettings";
import { EnvironmentsSettings } from "../components/settings/EnvironmentsSettings";

export const Route = createFileRoute("/settings/connections")({
  component: isWorkOsConfigured ? EnvironmentsSettings : ConnectionsSettings,
});
