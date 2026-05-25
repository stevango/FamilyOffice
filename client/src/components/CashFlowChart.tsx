import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
  return `${label.replace(".", "")}/${String(y).slice(2)}`;
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function fullCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function CashFlowChart() {
  const { data, isLoading } = trpc.dashboard.cashFlow.useQuery({ months: 6 });

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Fluxo de Caixa</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <TrendingUp className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Sem lançamentos para exibir</p>
            <p className="text-xs text-muted-foreground">Registre receitas e despesas no Financeiro</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={256}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={monthLabel}
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={compactCurrency}
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={64}
              />
              <Tooltip
                cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v) => monthLabel(String(v))}
                formatter={(value: number, name) => [
                  fullCurrency(value),
                  name === "income" ? "Receitas" : "Despesas",
                ]}
              />
              <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
