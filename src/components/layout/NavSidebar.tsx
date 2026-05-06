"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand } from "./Brand";
import { NAV_GROUPS } from "./nav-config";

export function NavSidebar({
  user,
  onNavigate,
}: {
  user: { nombre: string; email: string };
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-5 py-5">
        <Brand variant="dark" />
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className="mb-2">
            {group.label && (
              <div className="px-5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname?.startsWith(item.href + "/"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    active &&
                      "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.hint && !active && (
                    <span className="text-[10px] text-sidebar-foreground/40">
                      {item.hint}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3">
          <div className="text-sm font-medium text-sidebar-foreground">
            {user.nombre}
          </div>
          <div className="truncate text-xs text-sidebar-foreground/60">
            {user.email}
          </div>
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
