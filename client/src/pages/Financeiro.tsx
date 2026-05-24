import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Wallet,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/export";

function formatCurrency(value: number | string) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("pt-BR");
}

const accountTypeLabels: Record<string, string> = {
  checking: "Corrente",
  savings: "Poupança",
  investment: "Investimento",
  digital: "Digital",
};

const cardTypeLabels: Record<string, string> = {
  credit: "Crédito",
  debit: "Débito",
  both: "Múltiplo",
};

export default function Financeiro() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gestão Financeira</h1>
        <p className="text-muted-foreground text-sm mt-1">Contas, cartões, receitas e despesas</p>
      </div>

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="transactions">Lançamentos</TabsTrigger>
          <TabsTrigger value="accounts">Contas</TabsTrigger>
          <TabsTrigger value="cards">Cartões</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <TransactionsTab />
        </TabsContent>
        <TabsContent value="accounts">
          <AccountsTab />
        </TabsContent>
        <TabsContent value="cards">
          <CardsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============ TRANSACTIONS TAB ============
function TransactionsTab() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: transactions, isLoading } = trpc.transactions.list.useQuery();
  const { data: summary } = trpc.transactions.summary.useQuery();
  const createMutation = trpc.transactions.create.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.transactions.summary.invalidate();
      utils.dashboard.summary.invalidate();
      utils.dashboard.financialSummary.invalidate();
      setOpen(false);
      toast.success("Lançamento criado");
    },
  });
  const deleteMutation = trpc.transactions.delete.useMutation({
    onSuccess: () => {
      utils.transactions.list.invalidate();
      utils.transactions.summary.invalidate();
      utils.dashboard.summary.invalidate();
      utils.dashboard.financialSummary.invalidate();
      toast.success("Lançamento removido");
    },
  });

  const blankForm = {
    type: "expense" as "income" | "expense",
    description: "",
    amount: "",
    category: "",
    transactionDate: new Date().toISOString().split("T")[0],
    repeatMonths: "1",
  };
  const [form, setForm] = useState(blankForm);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    const { repeatMonths, ...rest } = form;
    const months = parseInt(repeatMonths, 10);
    createMutation.mutate(months > 1 ? { ...rest, repeatMonths: months } : rest);
    setForm(blankForm);
  };

  const handleExport = () => {
    if (!transactions || transactions.length === 0) {
      toast.error("Nenhum lançamento para exportar");
      return;
    }
    downloadCsv(`lancamentos-${new Date().toISOString().slice(0, 10)}`, transactions as any[], [
      { key: "transactionDate", label: "Data" },
      { key: "type", label: "Tipo", format: (t) => (t.type === "income" ? "Receita" : "Despesa") },
      { key: "description", label: "Descrição" },
      { key: "category", label: "Categoria" },
      { key: "amount", label: "Valor" },
      { key: "isPaid", label: "Pago", format: (t) => (t.isPaid ? "Sim" : "Não") },
    ]);
  };

  if (isLoading) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-muted-foreground">Receitas</span>
            </div>
            <p className="text-xl font-bold mt-1 text-emerald-500">{formatCurrency(summary?.totalIncome ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-sm text-muted-foreground">Despesas</span>
            </div>
            <p className="text-xl font-bold mt-1 text-destructive">{formatCurrency(summary?.totalExpense ?? 0)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Saldo</span>
            </div>
            <p className="text-xl font-bold mt-1">{formatCurrency((summary?.totalIncome ?? 0) - (summary?.totalExpense ?? 0))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Add Transaction */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" /> Exportar
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Novo Lançamento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Receita</SelectItem>
                      <SelectItem value="expense">Despesa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Aluguel, Salário..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input type="number" step="0.01" min="0" inputMode="decimal" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Moradia" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5" /> Repetir mensalmente
                </Label>
                <Select value={form.repeatMonths} onValueChange={(v) => setForm({ ...form, repeatMonths: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Não repetir</SelectItem>
                    <SelectItem value="3">Por 3 meses</SelectItem>
                    <SelectItem value="6">Por 6 meses</SelectItem>
                    <SelectItem value="12">Por 12 meses</SelectItem>
                    <SelectItem value="24">Por 24 meses</SelectItem>
                  </SelectContent>
                </Select>
                {form.repeatMonths !== "1" && (
                  <p className="text-xs text-muted-foreground">
                    Serão criados {form.repeatMonths} lançamentos, um por mês. Os meses futuros entram como não pagos.
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Transactions List */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {transactions && transactions.length > 0 ? (
            <div className="divide-y divide-border">
              {transactions.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${tx.type === "income" ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
                      {tx.type === "income" ? (
                        <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(tx.transactionDate)} {tx.category ? `· ${tx.category}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${tx.type === "income" ? "text-emerald-500" : "text-destructive"}`}>
                      {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate({ id: tx.id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum lançamento registrado</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em "Novo Lançamento" para começar</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============ ACCOUNTS TAB ============
function AccountsTab() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: accounts, isLoading } = trpc.bankAccounts.list.useQuery();
  const createMutation = trpc.bankAccounts.create.useMutation({
    onSuccess: () => {
      utils.bankAccounts.list.invalidate();
      utils.dashboard.summary.invalidate();
      setOpen(false);
      toast.success("Conta criada");
    },
  });
  const deleteMutation = trpc.bankAccounts.delete.useMutation({
    onSuccess: () => {
      utils.bankAccounts.list.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Conta removida");
    },
  });

  const [form, setForm] = useState({
    name: "",
    bank: "",
    accountType: "checking" as "checking" | "savings" | "investment" | "digital",
    balance: "0",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    createMutation.mutate(form);
    setForm({ name: "", bank: "", accountType: "checking", balance: "0" });
  };

  if (isLoading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Nova Conta Bancária</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da Conta</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Conta Principal" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Banco</Label>
                  <Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} placeholder="Ex: Nubank" />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.accountType} onValueChange={(v) => setForm({ ...form, accountType: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Corrente</SelectItem>
                      <SelectItem value="savings">Poupança</SelectItem>
                      <SelectItem value="investment">Investimento</SelectItem>
                      <SelectItem value="digital">Digital</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Saldo Atual (R$)</Label>
                <Input type="number" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((acc: any) => (
            <Card key={acc.id} className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{acc.name}</p>
                      <p className="text-xs text-muted-foreground">{acc.bank || "Sem banco"} · {accountTypeLabels[acc.accountType]}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate({ id: acc.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-lg font-bold">{formatCurrency(acc.balance)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ CARDS TAB ============
function CardsTab() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: cardsList, isLoading } = trpc.cards.list.useQuery();
  const createMutation = trpc.cards.create.useMutation({
    onSuccess: () => {
      utils.cards.list.invalidate();
      setOpen(false);
      toast.success("Cartão criado");
    },
  });
  const deleteMutation = trpc.cards.delete.useMutation({
    onSuccess: () => {
      utils.cards.list.invalidate();
      toast.success("Cartão removido");
    },
  });

  const [form, setForm] = useState({
    name: "",
    lastDigits: "",
    brand: "",
    cardType: "credit" as "credit" | "debit" | "both",
    creditLimit: "",
    closingDay: undefined as number | undefined,
    dueDay: undefined as number | undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    createMutation.mutate({
      ...form,
      creditLimit: form.creditLimit || undefined,
      closingDay: form.closingDay,
      dueDay: form.dueDay,
    });
    setForm({ name: "", lastDigits: "", brand: "", cardType: "credit", creditLimit: "", closingDay: undefined, dueDay: undefined });
  };

  if (isLoading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Cartão
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>Novo Cartão</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Cartão</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Nubank Platinum" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Últimos 4 dígitos</Label>
                  <Input maxLength={4} value={form.lastDigits} onChange={(e) => setForm({ ...form, lastDigits: e.target.value })} placeholder="1234" />
                </div>
                <div className="space-y-2">
                  <Label>Bandeira</Label>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Visa, Master..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.cardType} onValueChange={(v) => setForm({ ...form, cardType: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">Crédito</SelectItem>
                      <SelectItem value="debit">Débito</SelectItem>
                      <SelectItem value="both">Múltiplo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Limite (R$)</Label>
                  <Input type="number" step="0.01" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} placeholder="0,00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dia Fechamento</Label>
                  <Input type="number" min={1} max={31} value={form.closingDay ?? ""} onChange={(e) => setForm({ ...form, closingDay: e.target.value ? parseInt(e.target.value) : undefined })} />
                </div>
                <div className="space-y-2">
                  <Label>Dia Vencimento</Label>
                  <Input type="number" min={1} max={31} value={form.dueDay ?? ""} onChange={(e) => setForm({ ...form, dueDay: e.target.value ? parseInt(e.target.value) : undefined })} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {cardsList && cardsList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cardsList.map((card: any) => (
            <Card key={card.id} className="bg-card border-border">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-chart-4/10 flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-chart-4" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{card.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {card.brand || "Sem bandeira"} · {cardTypeLabels[card.cardType]}
                        {card.lastDigits ? ` · ****${card.lastDigits}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate({ id: card.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {card.creditLimit && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">Limite</p>
                    <p className="text-lg font-bold">{formatCurrency(card.creditLimit)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CreditCard className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum cartão cadastrado</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
