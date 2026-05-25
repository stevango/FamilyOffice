import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Scale,
  Trash2,
  Calendar,
  DollarSign,
  Gavel,
  AlertTriangle,
  CheckCircle2,
  PauseCircle,
  Archive,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/export";

function formatCurrency(value: number | string | null) {
  if (!value) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatDate(date: string | Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR");
}

const caseTypeLabels: Record<string, string> = {
  favorable: "Favorável",
  unfavorable: "Desfavorável",
  neutral: "Neutro",
};

const caseTypeColors: Record<string, string> = {
  favorable: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  unfavorable: "bg-red-500/10 text-red-400 border-red-500/20",
  neutral: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const statusLabels: Record<string, string> = {
  active: "Ativo",
  closed: "Encerrado",
  suspended: "Suspenso",
  archived: "Arquivado",
};

const statusIcons: Record<string, any> = {
  active: AlertTriangle,
  closed: CheckCircle2,
  suspended: PauseCircle,
  archived: Archive,
};

const statusColors: Record<string, string> = {
  active: "text-amber-400",
  closed: "text-emerald-400",
  suspended: "text-orange-400",
  archived: "text-gray-400",
};

export default function Juridico() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: cases, isLoading } = trpc.legalCases.list.useQuery();

  const createMutation = trpc.legalCases.create.useMutation({
    onSuccess: () => {
      utils.legalCases.list.invalidate();
      utils.dashboard.summary.invalidate();
      setOpen(false);
      toast.success("Processo cadastrado");
    },
  });

  const deleteMutation = trpc.legalCases.delete.useMutation({
    onSuccess: () => {
      utils.legalCases.list.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Processo removido");
    },
  });

  const [form, setForm] = useState({
    title: "",
    caseNumber: "",
    caseType: "neutral" as "favorable" | "unfavorable" | "neutral",
    status: "active" as "active" | "closed" | "suspended" | "archived",
    court: "",
    lawyer: "",
    estimatedCost: "",
    actualCost: "",
    nextDeadline: "",
    description: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) {
      toast.error("Preencha o título do processo");
      return;
    }
    createMutation.mutate({
      title: form.title,
      caseNumber: form.caseNumber || undefined,
      caseType: form.caseType,
      status: form.status,
      court: form.court || undefined,
      lawyer: form.lawyer || undefined,
      estimatedCost: form.estimatedCost || undefined,
      actualCost: form.actualCost || undefined,
      nextDeadline: form.nextDeadline || undefined,
      description: form.description || undefined,
      notes: form.notes || undefined,
    });
    setForm({ title: "", caseNumber: "", caseType: "neutral", status: "active", court: "", lawyer: "", estimatedCost: "", actualCost: "", nextDeadline: "", description: "", notes: "" });
  };

  // Stats
  const activeCases = cases?.filter((c: any) => c.status === "active").length ?? 0;
  const totalEstimatedCost = cases?.reduce((sum: number, c: any) => sum + parseFloat(c.estimatedCost || "0"), 0) ?? 0;

  const handleExport = () => {
    if (!cases || cases.length === 0) {
      toast.error("Nenhum processo para exportar");
      return;
    }
    downloadCsv(`processos-${new Date().toISOString().slice(0, 10)}`, cases as any[], [
      { key: "title", label: "Título" },
      { key: "caseNumber", label: "Número" },
      { key: "caseType", label: "Tipo", format: (c) => caseTypeLabels[c.caseType] ?? c.caseType },
      { key: "status", label: "Status", format: (c) => statusLabels[c.status] ?? c.status },
      { key: "court", label: "Vara/Tribunal" },
      { key: "lawyer", label: "Advogado" },
      { key: "estimatedCost", label: "Custo Estimado" },
      { key: "actualCost", label: "Custo Real" },
      { key: "nextDeadline", label: "Próximo Prazo" },
    ]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Módulo Jurídico</h1>
        <p className="text-muted-foreground text-sm mt-1">Processos, prazos e custos</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-amber-400" />
              <span className="text-sm text-muted-foreground">Processos Ativos</span>
            </div>
            <p className="text-2xl font-bold mt-1">{activeCases}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total de Processos</span>
            </div>
            <p className="text-2xl font-bold mt-1">{cases?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-destructive" />
              <span className="text-sm text-muted-foreground">Custo Estimado Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalEstimatedCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Add Button */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" /> Exportar
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Processo
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cadastrar Processo</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Título do Processo</Label>
                <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Ação Trabalhista - Empresa X" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Número do Processo</Label>
                  <Input value={form.caseNumber} onChange={(e) => setForm({ ...form, caseNumber: e.target.value })} placeholder="0000000-00.0000.0.00.0000" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.caseType} onValueChange={(v) => setForm({ ...form, caseType: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="favorable">Favorável</SelectItem>
                      <SelectItem value="unfavorable">Desfavorável</SelectItem>
                      <SelectItem value="neutral">Neutro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="closed">Encerrado</SelectItem>
                      <SelectItem value="suspended">Suspenso</SelectItem>
                      <SelectItem value="archived">Arquivado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Próximo Prazo</Label>
                  <Input type="date" value={form.nextDeadline} onChange={(e) => setForm({ ...form, nextDeadline: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vara/Tribunal</Label>
                  <Input value={form.court} onChange={(e) => setForm({ ...form, court: e.target.value })} placeholder="Ex: 1ª Vara Cível" />
                </div>
                <div className="space-y-2">
                  <Label>Advogado</Label>
                  <Input value={form.lawyer} onChange={(e) => setForm({ ...form, lawyer: e.target.value })} placeholder="Nome do advogado" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Custo Estimado (R$)</Label>
                  <Input type="number" step="0.01" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Custo Real (R$)</Label>
                  <Input type="number" step="0.01" value={form.actualCost} onChange={(e) => setForm({ ...form, actualCost: e.target.value })} placeholder="0,00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalhes do processo..." rows={2} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Cases List */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : cases && cases.length > 0 ? (
        <div className="space-y-3">
          {cases.map((legalCase: any) => {
            const StatusIcon = statusIcons[legalCase.status] || AlertTriangle;
            return (
              <Card key={legalCase.id} className="bg-card border-border">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                        <StatusIcon className={`h-5 w-5 ${statusColors[legalCase.status]}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{legalCase.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <Badge variant="outline" className={`text-xs ${caseTypeColors[legalCase.caseType]}`}>
                            {caseTypeLabels[legalCase.caseType]}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {statusLabels[legalCase.status]}
                          </Badge>
                          {legalCase.caseNumber && (
                            <span className="text-xs text-muted-foreground font-mono">{legalCase.caseNumber}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {legalCase.court && (
                            <span className="flex items-center gap-1">
                              <Gavel className="h-3 w-3" /> {legalCase.court}
                            </span>
                          )}
                          {legalCase.lawyer && (
                            <span className="flex items-center gap-1">
                              <Scale className="h-3 w-3" /> {legalCase.lawyer}
                            </span>
                          )}
                          {legalCase.nextDeadline && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> Prazo: {formatDate(legalCase.nextDeadline)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {legalCase.estimatedCost && (
                        <div className="text-right mr-2">
                          <p className="text-xs text-muted-foreground">Custo Est.</p>
                          <p className="text-sm font-semibold">{formatCurrency(legalCase.estimatedCost)}</p>
                        </div>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate({ id: legalCase.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Scale className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum processo cadastrado</p>
            <p className="text-xs text-muted-foreground mt-1">Registre seus processos judiciais</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
