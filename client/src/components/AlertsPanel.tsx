import { useLocation } from "wouter";
import { AlertTriangle, CalendarClock, FileText, Scale } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

function describe(daysUntil: number, overdue: boolean) {
  if (overdue) return `Vencido há ${Math.abs(daysUntil)} ${Math.abs(daysUntil) === 1 ? "dia" : "dias"}`;
  if (daysUntil === 0) return "Vence hoje";
  if (daysUntil === 1) return "Vence amanhã";
  return `Vence em ${daysUntil} dias`;
}

export function AlertsPanel() {
  const [, setLocation] = useLocation();
  const { data: alerts } = trpc.dashboard.alerts.useQuery({ horizonDays: 30 });

  if (!alerts || alerts.length === 0) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-medium">Alertas e Vencimentos</h2>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {alerts.length}
          </span>
        </div>
        <div className="space-y-1.5">
          {alerts.slice(0, 6).map((a) => (
            <button
              key={`${a.kind}-${a.id}`}
              onClick={() => setLocation(a.kind === "document" ? "/documentos" : "/juridico")}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {a.kind === "document" ? (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Scale className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-sm">{a.title}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <CalendarClock className={`h-3.5 w-3.5 ${a.overdue ? "text-destructive" : "text-amber-500"}`} />
                <span className={`text-xs font-medium ${a.overdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                  {describe(a.daysUntil, a.overdue)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
