import { useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const utils = trpc.useUtils();
  const { data: config } = trpc.auth.config.useQuery();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const isSetup = config?.needsSetup ?? false;
  const canRegister = config?.allowRegistration ?? false;
  const effectiveMode = isSetup ? "register" : mode;

  const onAuthed = () => {
    utils.auth.me.invalidate();
  };

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: onAuthed,
    onError: (e) => toast.error(e.message),
  });
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
    if (effectiveMode === "register") {
      registerMutation.mutate({ email, password, name: name || undefined });
    } else {
      loginMutation.mutate({ email, password });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Family Office</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSetup
                ? "Crie a conta do administrador para começar"
                : effectiveMode === "register"
                  ? "Crie sua conta"
                  : "Acesse sua central privada de gestão"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-lg">
          {effectiveMode === "register" && (
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como devemos te chamar"
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={effectiveMode === "register" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={effectiveMode === "register" ? "Mínimo de 8 caracteres" : "••••••••"}
              autoComplete={effectiveMode === "register" ? "new-password" : "current-password"}
            />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {effectiveMode === "register" ? (isSetup ? "Criar administrador" : "Criar conta") : "Entrar"}
          </Button>

          {!isSetup && (canRegister || effectiveMode === "register") && (
            <p className="text-center text-sm text-muted-foreground">
              {effectiveMode === "register" ? "Já tem uma conta?" : "Ainda não tem conta?"}{" "}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setMode(effectiveMode === "register" ? "login" : "register")}
              >
                {effectiveMode === "register" ? "Entrar" : "Cadastre-se"}
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
