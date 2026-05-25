import { useState } from "react";
import { Loader2, Plug, ShieldAlert, Save, Unplug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const statusLabels: Record<string, { label: string; className: string }> = {
  connected: { label: "Conectado", className: "bg-emerald-500/10 text-emerald-400" },
  disconnected: { label: "Desconectado", className: "bg-gray-500/10 text-gray-400" },
  error: { label: "Erro", className: "bg-red-500/10 text-red-400" },
};

export default function Integracoes() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const { data: integrations, isLoading } = trpc.integrations.list.useQuery(undefined, { enabled: isAdmin });
  const [keys, setKeys] = useState<Record<string, string>>({});

  const saveMutation = trpc.integrations.save.useMutation({
    onSuccess: () => utils.integrations.list.invalidate(),
  });
  const disconnectMutation = trpc.integrations.disconnect.useMutation({
    onSuccess: () => { utils.integrations.list.invalidate(); toast.success("Integração desconectada"); },
  });
  const syncMutation = trpc.integrations.sync.useMutation({
    onSuccess: (res) => { utils.integrations.list.invalidate(); toast.success(`Sincronizado: ${res.imported} registro(s)`); },
    onError: (err) => { utils.integrations.list.invalidate(); toast.message(err.message); },
  });

  const saveKey = async (provider: string) => {
    const apiKey = (keys[provider] ?? "").trim();
    if (!apiKey) {
      toast.error("Cole o token antes de salvar");
      return;
    }
    await saveMutation.mutateAsync({ provider: provider as any, apiKey });
    setKeys((p) => ({ ...p, [provider]: "" }));
    toast.success("Credencial salva com segurança");
  };

  const toggle = async (provider: string, enabled: boolean) => {
    await saveMutation.mutateAsync({ provider: provider as any, enabled });
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
          <p className="text-muted-foreground text-sm mt-1">APIs de parceiros</p>
        </div>
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-3 py-10 justify-center text-muted-foreground">
            <ShieldAlert className="h-5 w-5" />
            Apenas administradores podem gerenciar integrações.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Conecte APIs de parceiros para alimentar os módulos do Family Office. As credenciais são armazenadas cifradas.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}</div>
      ) : (
        <div className="space-y-4">
          {integrations?.map((it) => {
            const st = statusLabels[it.status] ?? statusLabels.disconnected;
            return (
              <Card key={it.id} className="bg-card border-border">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <Plug className="h-4 w-4 text-primary" /> {it.name}
                      <Badge variant="outline" className="text-[10px]">Alimenta: {it.feeds}</Badge>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1.5">{it.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge className={`text-xs ${st.className}`}>{st.label}</Badge>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={it.enabled}
                        disabled={!it.configured || saveMutation.isPending}
                        onCheckedChange={(v) => toggle(it.id, v)}
                      />
                      <span className="text-xs text-muted-foreground">{it.enabled ? "Ativa" : "Inativa"}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{it.credentialLabel}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        autoComplete="off"
                        placeholder={it.configured ? `Salvo (${it.credentialHint}) — cole para substituir` : "Cole o token da API"}
                        value={keys[it.id] ?? ""}
                        onChange={(e) => setKeys((p) => ({ ...p, [it.id]: e.target.value }))}
                      />
                      <Button onClick={() => saveKey(it.id)} disabled={saveMutation.isPending} className="gap-2 shrink-0">
                        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </Button>
                      {it.configured && (
                        <Button
                          variant="outline"
                          onClick={() => disconnectMutation.mutate({ provider: it.id as any })}
                          disabled={disconnectMutation.isPending}
                          className="gap-2 shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Unplug className="h-4 w-4" /> Desconectar
                        </Button>
                      )}
                    </div>
                  </div>

                  {it.configured && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-2"
                        onClick={() => syncMutation.mutate({ provider: it.id as any })}
                        disabled={syncMutation.isPending}
                      >
                        {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Sincronizar agora
                      </Button>
                      {it.lastSyncAt && (
                        <span className="text-xs text-muted-foreground">
                          Última sincronização: {new Date(it.lastSyncAt).toLocaleString("pt-BR")}
                        </span>
                      )}
                    </div>
                  )}

                  {it.status === "error" && it.lastError && (
                    <p className="text-xs text-red-400">{it.lastError}</p>
                  )}
                  {it.docsUrl && (
                    <a href={it.docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                      Documentação da API
                    </a>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
