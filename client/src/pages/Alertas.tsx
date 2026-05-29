import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Check, CheckCheck, Trash2, Gavel, Clock, CalendarClock, Info } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const typeMeta: Record<string, { icon: any; color: string }> = {
  andamento: { icon: Gavel, color: "text-blue-400" },
  prazo: { icon: Clock, color: "text-orange-400" },
  audiencia: { icon: CalendarClock, color: "text-amber-400" },
  info: { icon: Info, color: "text-muted-foreground" },
};

function formatDateTime(d: string | Date) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Alertas() {
  const utils = trpc.useUtils();
  const { data: alerts, isLoading } = trpc.alerts.list.useQuery();
  const invalidate = () => { utils.alerts.list.invalidate(); utils.alerts.unreadCount.invalidate(); };
  const markRead = trpc.alerts.markRead.useMutation({ onSuccess: invalidate });
  const markAllRead = trpc.alerts.markAllRead.useMutation({ onSuccess: () => { invalidate(); toast.success("Tudo marcado como lido"); } });
  const del = trpc.alerts.delete.useMutation({ onSuccess: invalidate });
  const [running, setRunning] = useState(false);
  const checkNow = trpc.legalCases.checkUpdates.useMutation({
    onSuccess: (r) => { invalidate(); utils.legalCases.list.invalidate(); toast.success(`Verificação concluída — ${r.updated} atualização(ões), ${r.alerts} alerta(s)`); setRunning(false); },
    onError: (e) => { toast.error(e.message ?? "Falha ao verificar"); setRunning(false); },
  });

  const list = (alerts as any[] | undefined) ?? [];
  const unread = list.filter((a) => !a.readAt).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" /> Alertas
            {unread > 0 && <span className="text-sm font-normal text-muted-foreground">({unread} não lido{unread > 1 ? "s" : ""})</span>}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Novidades dos seus processos — atualizado automaticamente todo dia às 07:00.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" disabled={running || checkNow.isPending} onClick={() => { setRunning(true); checkNow.mutate(); }}>
            <Clock className="h-4 w-4" /> Verificar agora
          </Button>
          {unread > 0 && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => markAllRead.mutate()}>
              <CheckCheck className="h-4 w-4" /> Marcar tudo como lido
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <Bell className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-medium mt-3">Nenhum alerta</p>
          <p className="text-xs text-muted-foreground mt-1">Quando houver nova movimentação ou prazo próximo nos seus processos, aparece aqui.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 divide-y divide-border overflow-hidden">
          {list.map((a) => {
            const meta = typeMeta[a.type] ?? typeMeta.info;
            const Icon = meta.icon;
            return (
              <div key={a.id} className={`flex items-start gap-3 px-4 py-3 ${a.readAt ? "opacity-60" : "bg-primary/[0.03]"}`}>
                <div className="mt-0.5"><Icon className={`h-4 w-4 ${meta.color}`} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {!a.readAt && <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                    <p className="text-sm font-medium truncate">{a.title}</p>
                  </div>
                  {a.message && <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                    {a.legalCaseId && <Link href="/juridico" className="text-[10px] text-primary hover:underline">Ver no Jurídico</Link>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!a.readAt && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Marcar como lido" onClick={() => markRead.mutate({ id: a.id })}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Excluir" onClick={() => del.mutate({ id: a.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
