import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PlaceholderPage({
  title,
  description,
  phase,
  bullets,
}: {
  title: string;
  description: string;
  phase: 1 | 2 | 3 | 4 | 5;
  bullets: string[];
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          <Sparkles className="size-3" />
          Fase {phase}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qué incluirá esta sección</CardTitle>
          <CardDescription>
            Implementación planificada para la fase {phase} del roadmap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
