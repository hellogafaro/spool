import { createFileRoute } from "@tanstack/react-router";

import { ProvidersSettings } from "../components/settings/ProvidersSettings";

export const Route = createFileRoute("/settings/providers")({
  component: ProvidersSettings,
});
