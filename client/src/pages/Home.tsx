import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CashFlowChart } from "@/components/CashFlowChart";
import { AlertsPanel } from "@/components/AlertsPanel";
import {
  Wallet,
  Building2,
  FileText,
  Scale,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Calendar,
} from "lucide-react";

const categoryLabels: Record<string, string> = {
  personal: "Pessoal",
  property: "Imóvel",
  vehicle: "Veículo",
  company: "Empresa",
  legal: "Jurídico",
  tax: "Fiscal",
  insurance: "Seguro",
  contract: "Contrato",
  certificate: "Certidão",
  other: "Outro",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("pt-BR");
}

export default function Home() {
  const { data: summary, isLoading: loadingSummary } = trpc.dashboard.summary.useQuery();
  const { data: financial, isLoading: loadingFinancial } = trpc.dashboard.financialSummary.useQuery();

  if (loadingSummary || loadingFinancial) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão executiva consolidada</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border-border">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const totalBalance = summary?.totalBalance ?? 0;
  const totalAssets = summary?.totalAssets ?? 0;
  const totalIncome = financial?.totalIncome ?? 0;
  const totalExpense = financial?.totalExpense ?? 0;
  const netFlow = totalIncome - totalExpense;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Visão executiva consolidada</p>
      </div>

      <AlertsPanel />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Financeiro</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{formatCurrency(totalBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Todas as contas ativas</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Patrimônio Total</CardTitle>
            <Building2 className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{formatCurrency(totalAssets)}</div>
            <p className="text-xs text-muted-foreground mt-1">Ativos consolidados</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fluxo Líquido</CardTitle>
            {netFlow >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold tracking-tight ${netFlow >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {formatCurrency(netFlow)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Receitas - Despesas</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Processos Ativos</CardTitle>
            <Scale className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{summary?.activeCases ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Ações em andamento</p>
          </CardContent>
        </Card>
      </div>

      {/* Cash flow */}
      <CashFlowChart />

      {/* Secondary Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Documents */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Documentos Recentes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summary?.recentDocuments && summary.recentDocuments.length > 0 ? (
              <div className="space-y-3">
                {summary.recentDocuments.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {categoryLabels[doc.category] ?? doc.category}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum documento cadastrado</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Prazos Jurídicos</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summary?.upcomingDeadlines && summary.upcomingDeadlines.length > 0 ? (
              <div className="space-y-3">
                {summary.upcomingDeadlines.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.court || "Sem vara"}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {item.nextDeadline ? formatDate(item.nextDeadline) : "-"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Scale className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum prazo próximo</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
