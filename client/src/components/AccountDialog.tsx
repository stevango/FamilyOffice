import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso");
      setCurrentPassword("");
      setNewPassword("");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar senha</DialogTitle>
          <DialogDescription>Use uma senha forte com pelo menos 8 caracteres.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current">Senha atual</Label>
            <Input
              id="current"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new">Nova senha</Label>
            <Input
              id="new"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={changePassword.isPending}>
            {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar nova senha
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
