import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Building2,
  Car,
  Briefcase,
  TrendingUp,
  Trash2,
  MapPin,
  Package,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/export";

function formatCurrency(value: number | string) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatDate(date: string | Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR");
}

const assetTypeLabels: Record<string, string> = {
  property: "Imóvel",
  vehicle: "Veículo",
  company: "Empresa",
  investment: "Investimento",
  other: "Outro",
};

const assetTypeIcons: Record<string, any> = {
  property: Building2,
  vehicle: Car,
  company: Briefcase,
  investment: TrendingUp,
  other: Package,
};

const statusLabels: Record<string, string> = {
  active: "Ativo",
  sold: "Vendido",
  inactive: "Inativo",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  sold: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  inactive: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export default function Patrimonio() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const utils = trpc.useUtils();

  const { data: assets, isLoading } = trpc.assets.list.useQuery(
    activeTab !== "all" ? { assetType: activeTab } : undefined
  );
  const { data: summary } = trpc.assets.summary.useQuery();

  const createMutation = trpc.assets.create.useMutation({
    onSuccess: () => {
      utils.assets.list.invalidate();
      utils.assets.summary.invalidate();
      utils.dashboard.summary.invalidate();
      setOpen(false);
      toast.success("Ativo cadastrado");
    },
  });

  const deleteMutation = trpc.assets.delete.useMutation({
    onSuccess: () => {
      utils.assets.list.invalidate();
      utils.assets.summary.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Ativo removido");
    },
  });

  const [form, setForm] = useState({
    name: "",
    assetType: "property" as "property" | "vehicle" | "company" | "investment" | "other",
    description: "",
    estimatedValue: "",
    acquisitionValue: "",
    acquisitionDate: "",
    location: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.estimatedValue) {
      toast.error("Preencha nome e valor estimado");
      return;
    }
    createMutation.mutate({
      name: form.name,
      assetType: form.assetType,
      description: form.description || undefined,
      estimatedValue: form.estimatedValue,
      acquisitionValue: form.acquisitionValue || undefined,
      acquisitionDate: form.acquisitionDate || undefined,
      location: form.location || undefined,
      notes: form.notes || undefined,
    });
    setForm({ name: "", assetType: "property", description: "", estimatedValue: "", acquisitionValue: "", acquisitionDate: "", location: "", notes: "" });
  };

  const handleExport = () => {
    if (!assets || assets.length === 0) {
      toast.error("Nenhum ativo para exportar");
      return;
    }
    downloadCsv(`patrimonio-${new Date().toISOString().slice(0, 10)}`, assets as any[], [
      { key: "name", label: "Nome" },
      { key: "assetType", label: "Tipo", format: (a) => assetTypeLabels[a.assetType] ?? a.assetType },
      { key: "status", label: "Status", format: (a) => statusLabels[a.status] ?? a.status },
      { key: "estimatedValue", label: "Valor Estimado" },
      { key: "acquisitionValue", label: "Valor Aquisição" },
      { key: "acquisitionDate", label: "Data Aquisição" },
      { key: "location", label: "Localização" },
    ]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gestão Patrimonial</h1>
        <p className="text-muted-foreground text-sm mt-1">Imóveis, veículos, empresas e investimentos</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Patrimônio Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(summary?.totalValue ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-chart-3" />
              <span className="text-sm text-muted-foreground">Ativos Cadastrados</span>
            </div>
            <p className="text-2xl font-bold mt-1">{summary?.count ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs and Add */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
          <TabsList className="bg-secondary">
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="property">Imóveis</TabsTrigger>
            <TabsTrigger value="vehicle">Veículos</TabsTrigger>
            <TabsTrigger value="company">Empresas</TabsTrigger>
            <TabsTrigger value="investment">Investimentos</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" /> Exportar
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Ativo
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle>Cadastrar Ativo</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Apartamento Centro" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.assetType} onValueChange={(v) => setForm({ ...form, assetType: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="property">Imóvel</SelectItem>
                      <SelectItem value="vehicle">Veículo</SelectItem>
                      <SelectItem value="company">Empresa</SelectItem>
                      <SelectItem value="investment">Investimento</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Estimado (R$)</Label>
                  <Input type="number" step="0.01" min="0" inputMode="decimal" required value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Valor Aquisição (R$)</Label>
                  <Input type="number" step="0.01" value={form.acquisitionValue} onChange={(e) => setForm({ ...form, acquisitionValue: e.target.value })} placeholder="0,00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Aquisição</Label>
                  <Input type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Localização</Label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Cidade, Estado" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Detalhes adicionais..." rows={2} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Assets List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : assets && assets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assets.map((asset: any) => {
            const Icon = assetTypeIcons[asset.assetType] || Package;
            return (
              <Card key={asset.id} className="bg-card border-border">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{asset.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{assetTypeLabels[asset.assetType]}</Badge>
                          <Badge variant="outline" className={`text-xs ${statusColors[asset.status]}`}>{statusLabels[asset.status]}</Badge>
                        </div>
                        {asset.location && (
                          <div className="flex items-center gap-1 mt-2">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{asset.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteMutation.mutate({ id: asset.id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Valor Estimado</p>
                      <p className="text-lg font-bold">{formatCurrency(asset.estimatedValue)}</p>
                    </div>
                    {asset.acquisitionDate && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Aquisição</p>
                        <p className="text-sm">{formatDate(asset.acquisitionDate)}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum ativo cadastrado</p>
            <p className="text-xs text-muted-foreground mt-1">Cadastre seus imóveis, veículos e investimentos</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
