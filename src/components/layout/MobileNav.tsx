"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NavSidebar } from "./NavSidebar";

export function MobileNav({
  user,
}: {
  user: { nombre: string; email: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-0 bg-sidebar p-0 [&>button]:text-sidebar-foreground">
        <NavSidebar user={user} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
