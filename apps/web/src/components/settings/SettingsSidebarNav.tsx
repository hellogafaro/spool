import type { ComponentType } from "react";
import {
  ArchiveBoxIcon,
  ArrowLeftIcon,
  Cog8ToothIcon,
  LinkIcon,
  ServerStackIcon,
} from "@heroicons/react/16/solid";
import { useNavigate } from "@tanstack/react-router";

import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";

export type SettingsSectionPath =
  | "/settings/general"
  | "/settings/connections"
  | "/settings/archived";

function isWorkOsConfigured(): boolean {
  return Boolean((import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined)?.trim());
}

const CONNECTIONS_LABEL = isWorkOsConfigured() ? "Environments" : "Connections";
const CONNECTIONS_ICON = isWorkOsConfigured() ? ServerStackIcon : LinkIcon;

export const SETTINGS_NAV_ITEMS: ReadonlyArray<{
  label: string;
  to: SettingsSectionPath;
  icon: ComponentType<{ className?: string }>;
}> = [
  { label: "General", to: "/settings/general", icon: Cog8ToothIcon },
  { label: CONNECTIONS_LABEL, to: "/settings/connections", icon: CONNECTIONS_ICON },
  { label: "Archive", to: "/settings/archived", icon: ArchiveBoxIcon },
];

export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navigate = useNavigate();

  return (
    <SidebarContent className="gap-0 overflow-x-hidden">
      <SidebarGroup className="px-2 pt-2 pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:ring-0"
              onClick={() => window.history.back()}
            >
              <ArrowLeftIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup className="px-2 py-2">
        <SidebarMenu>
          {SETTINGS_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.to;
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  size="sm"
                  isActive={isActive}
                  className={
                    isActive
                      ? "gap-2 px-2 py-1.5 font-medium text-foreground hover:bg-accent focus-visible:ring-0"
                      : "gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:ring-0"
                  }
                  onClick={() => void navigate({ to: item.to, replace: true })}
                >
                  <Icon
                    className={
                      isActive
                        ? "size-3.5 shrink-0 text-foreground"
                        : "size-3.5 shrink-0 text-muted-foreground/60"
                    }
                  />
                  <span className="truncate">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  );
}
