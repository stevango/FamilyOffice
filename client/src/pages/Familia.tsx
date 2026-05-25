import { useState } from "react";
import { Check, Copy, Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const roleLabels: Record<string, string> = { admin: "Administrador", member: "Membro", viewer: "Leitor" };

function inviteLink(code: string) {
  return `${window.location.origin}/?invite=${code}`;
}

export default function Familia() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();

  const { data: members, isLoading } = trpc.household.members.useQuery();
  const { data: invites } = trpc.household.invites.list.useQuery(undefined, { enabled: isAdmin });

  const [copied, setCopied] = useState<string | null>(null);

  const invalidate = () => {
    utils.household.members.invalidate();
    utils.household.invites.list.invalidate();
  };

  const createInvite = trpc.household.invites.create.useMutation({
    onSuccess: () => {
      utils.household.invites.list.invalidate();
      toast.success("Convite criado");
    },
  });
  const revokeInvite = trpc.household.invites.revoke.useMutation({ onSuccess: () => utils.household.invites.list.invalidate() });
  const updateRole = trpc.household.updateMemberRole.useMutation({ onSuccess: () => { invalidate(); toast.success("Papel atualizado"); } });
  const removeMember = trpc.household.removeMember.useMutation({ onSuccess: () => { invalidate(); toast.success("Membro removido"); } });

  const copy = (code: string) => {
    navigator.clipboard.writeText(inviteLink(code)).then(() => {
      setCopied(code);
      toast.success("Link copiado");
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Família</h1>
        <p className="text-muted-foreground text-sm mt-1">Membros e acessos compartilhados</p>
      </div>

      {/* Members */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" /> Membros
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="divide-y divide-border">
              {members?.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.name || m.email} {m.id === user?.id && <span className="text-xs text-muted-foreground">(você)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAdmin && m.id !== user?.id ? (
                      <Select value={m.role} onValueChange={(role) => updateRole.mutate({ userId: m.id, role: role as any })}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="member">Membro</SelectItem>
                          <SelectItem value="viewer">Leitor</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary" className="text-xs">{roleLabels[m.role]}</Badge>
                    )}
                    {isAdmin && m.id !== user?.id && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeMember.mutate({ userId: m.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invites (admin only) */}
      {isAdmin && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" /> Convites
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={createInvite.isPending} onClick={() => createInvite.mutate({ role: "member" })}>
                {createInvite.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Convidar membro
              </Button>
              <Button variant="outline" size="sm" disabled={createInvite.isPending} onClick={() => createInvite.mutate({ role: "viewer" })}>
                Convidar leitor
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!invites || invites.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum convite ativo. Gere um link para adicionar familiares.</p>
            ) : (
              <div className="divide-y divide-border">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="truncate rounded bg-secondary px-2 py-0.5 text-xs">{inv.code}</code>
                        <Badge variant="secondary" className="text-xs">{roleLabels[inv.role]}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Expira em {new Date(inv.expiresAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copy(inv.code)} title="Copiar link do convite">
                        {copied === inv.code ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => revokeInvite.mutate({ id: inv.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
