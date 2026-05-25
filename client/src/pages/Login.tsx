import { useState } from "react";
import { Shield, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const urlInvite = new URLSearchParams(window.location.search).get("invite") ?? "";

export default function Login() {
  const utils = trpc.useUtils();
  const { data: config } = trpc.auth.config.useQuery();
  const [inviteCode, setInviteCode] = useState(urlInvite);
  const [showInviteField, setShowInviteField] = useState(Boolean(urlInvite));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [householdName, setHouseholdName] = useState("");

  const isSetup = config?.needsSetup ?? false;
  const trimmedCode = inviteCode.trim();
  const { data: invite } = trpc.auth.inviteInfo.useQuery(
    { code: trimmedCode },
    { enabled: !isSetup && trimmedCode.length > 0 }
  );

  // join when a code is present and valid; setup on first run; otherwise login.
  const mode: "setup" | "join" | "login" = isSetup ? "setup" : showInviteField ? "join" : "login";

  const onAuthed = () => utils.auth.me.invalidate();
  const loginMutation = trpc.auth.login.useMutation({ onSuccess: onAuthed, onError: (e) => toast.error(e.message) });
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Conta criada com sucesso");
      onAuthed();
    },
    onError: (e) => toast.error(e.message),
  });
  const pending = loginMutation.isPending || registerMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      loginMutation.mutate({ email, password });
    } else if (mode === "setup") {
      registerMutation.mutate({ email, password, name: name || undefined, householdName: householdName || undefined });
    } else {
      registerMutation.mutate({ email, password, name: name || undefined, inviteCode: trimmedCode });
    }
  };

  const subtitle =
    mode === "setup"
      ? "Crie a conta do administrador para começar"
      : mode === "join"
        ? invite?.valid
          ? `Você foi convidado para a ${invite.householdName}`
          : "Entre com seu convite"
        : "Acesse sua central privada de gestão";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Family Office</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-lg">
          {mode === "setup" && (
            <div className="space-y-2">
              <Label htmlFor="household">Nome da família</Label>
              <Input id="household" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="Ex: Família Silva" />
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-2">
              <Label htmlFor="invite">Código do convite</Label>
              <Input id="invite" required value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Cole o código aqui" />
              {trimmedCode.length > 0 && invite && !invite.valid && (
                <p className="text-xs text-destructive">Convite inválido ou expirado.</p>
              )}
            </div>
          )}

          {mode !== "login" && (
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como devemos te chamar" autoComplete="name" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={mode === "login" ? undefined : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "login" ? "••••••••" : "Mínimo de 8 caracteres"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending || (mode === "join" && invite ? !invite.valid : false)}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "login" ? "Entrar" : mode === "setup" ? "Criar administrador" : "Entrar na família"}
          </Button>

          {!isSetup && (
            <div className="text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <button type="button" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline" onClick={() => setShowInviteField(true)}>
                  <Users className="h-3.5 w-3.5" /> Tenho um convite
                </button>
              ) : (
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setShowInviteField(false); setInviteCode(""); }}>
                  Já tenho conta — entrar
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
