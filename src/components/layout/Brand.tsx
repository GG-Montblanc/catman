import { cn } from "@/lib/utils";

export function Brand({
  variant = "light",
  className,
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const fg =
    variant === "light" ? "text-foreground" : "text-sidebar-foreground";
  const muted =
    variant === "light"
      ? "text-muted-foreground"
      : "text-sidebar-foreground/70";
  return (
    <div className={cn("flex flex-col leading-none", className)}>
      <span className={cn("text-xs font-light tracking-widest", muted)}>
        Empresas
      </span>
      <span className={cn("text-xl font-semibold tracking-tight", fg)}>
        DBS
      </span>
      <span className={cn("mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em]", muted)}>
        CatMan
      </span>
    </div>
  );
}
