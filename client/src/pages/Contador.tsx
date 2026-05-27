import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_LABELS } from "@shared/documentFields";
import {
  Calculator,
  FileText,
  Eye,
  Download,
  Link2,
  CalendarRange,
  Users,
  Loader2,
  Info,
} from "lucide-react";

type Doc = {
  id: number;
  title: string;
  category: string;
  metadata?: string | null;
  aiSummary?: string | null;
  fileUrl: string;
  createdAt: string | Date;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

const categoryColors: Record<string, string> = {
  ir: "bg-rose-500/10 text-rose-400",
  tax: "bg-orange-500/10 text-orange-400",
  informe_rendimento: "bg-lime-500/10 text-lime-400",
  vehicle: "bg-amber-500/10 text-amber-400",
  property: "bg-emerald-500/10 text-emerald-400",
  company: "bg-purple-500/10 text-purple-400",
  contract: "bg-indigo-500/10 text-indigo-400",
  consorcio: "bg-sky-500/10 text-sky-400",
};

/** Documents that surface here: those flagged for the accountant or whose
 *  category is inherently fiscal (IR, Fiscal, Informe de rendimento). */
const FISCAL_CATEGORIES = new Set(["ir", "tax", "informe_rendimento"]);

function parseMeta(doc: Doc): Record<string, string> {
  try {
    return doc.metadata ? (JSON.parse(doc.metadata) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function flaggedForAccountant(doc: Doc): boolean {
  try {
    return doc.aiSummary ? JSON.parse(doc.aiSummary)?.comunicarContador === true : false;
  } catch {
    return false;
  }
}

function isFiscal(doc: Doc): boolean {
  return flaggedForAccountant(doc) || FISCAL_CATEGORIES.has(doc.category);
}

function year4(s?: string): string | null {
  if (!s) return null;
  const m = String(s).match(/(19|20)\d{2}/);
  return m ? m[0] : null;
}

/** Best-effort fiscal year (exercício) for grouping. */
function fiscalYear(doc: Doc): string {
  const m = parseMeta(doc);
  return (
    year4(m.anoBase) ||
    year4(m.exercicio) ||
    year4(m.dataVenda) ||
    year4(m.dataCompra) ||
    year4(m.dataEmissaoNf) ||
    year4(m.dataAssinatura) ||
    year4(m.dataAdesao) ||
    String(new Date(doc.createdAt).getFullYear())
  );
}

/** Best-effort taxpayer (nome + CPF/CNPJ) for the document. */
function titular(doc: Doc): string {
  const m = parseMeta(doc);
  const name =
    m.beneficiario ||
    m.proprietario ||
    m.consorciado ||
    m.contratanteNome ||
    m.razaoSocial ||
    doc.ownerName ||
    "";
  const id =
    m.cpfBeneficiario ||
    m.proprietarioCpf ||
    m.proprietarioCnpj ||
    m.cpf ||
    m.cnpj ||
    m.cpfCnpj ||
    "";
  return [name, id].filter(Boolean).join(" · ") || "Sem titular informado";
}

/** Most relevant monetary value to display for the document, if any. */
function relevantValue(doc: Doc): string | null {
  const m = parseMeta(doc);
  return (
    m.valorTotalNota ||
    m.impostoRetido ||
    m.rendimentosTributaveis ||
    m.valorVenda ||
    m.valor ||
    m.valorCompra ||
    null
  );
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("pt-BR");
}

export default function Contador() {
  const { data: documents, isLoading } = trpc.documents.list.useQuery();
  const shareLinkMutation = trpc.documents.shareLink.useMutation();
  const [year, setYear] = useState<string>("all");
  const [bundling, setBundling] = useState<string | null>(null);

  const fiscalDocs = useMemo(
    () => ((documents as Doc[] | undefined) ?? []).filter(isFiscal),
    [documents],
  );

  const years = useMemo(() => {
    const set = new Set(fiscalDocs.map(fiscalYear));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [fiscalDocs]);

  const shown = useMemo(
    () => (year === "all" ? fiscalDocs : fiscalDocs.filter((d) => fiscalYear(d) === year)),
    [fiscalDocs, year],
  );

  // Group by exercício (desc).
  const groups = useMemo(() => {
    const byYear = new Map<string, Doc[]>();
    for (const d of shown) {
      const y = fiscalYear(d);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(d);
    }
    return Array.from(byYear.entries()).sort((a, b) => Number(b[0]) - Number(a[0]));
  }, [shown]);

  const shareOne = async (doc: Doc) => {
    try {
      const { token } = await shareLinkMutation.mutateAsync({ id: doc.id });
      const url = `${window.location.origin}/api/share/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado (válido por 7 dias)");
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao gerar o link");
    }
  };

  const shareBundle = async (yr: string, docs: Doc[]) => {
    setBundling(yr);
    try {
      const lines: string[] = [];
      for (const d of docs) {
        const { token } = await shareLinkMutation.mutateAsync({ id: d.id });
        lines.push(`${d.title}: ${window.location.origin}/api/share/${token}`);
      }
      await navigator.clipboard.writeText(
        `Documentos para o contador — exercício ${yr} (links válidos por 7 dias):\n\n${lines.join("\n")}`,
      );
      toast.success(`${docs.length} link(s) do exercício ${yr} copiados`);
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao gerar os links do exercício");
    } finally {
      setBundling(null);
    }
  };

  const flaggedCount = fiscalDocs.filter(flaggedForAccountant).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Calculator className="h-6 w-6 text-primary" /> Painel do Contador
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Documentos fiscais organizados por exercício, prontos para envio ao contador.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> Documentos fiscais
          </div>
          <p className="text-2xl font-semibold mt-1">{fiscalDocs.length}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" /> Exercícios
          </div>
          <p className="text-2xl font-semibold mt-1">{years.length}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> Marcados p/ contador
          </div>
          <p className="text-2xl font-semibold mt-1">{flaggedCount}</p>
        </div>
      </div>

      {/* Filter */}
      {years.length > 0 && (
        <div className="flex items-center gap-3">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Exercício" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os exercícios</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <Calculator className="h-8 w-8 mx-auto text-muted-foreground/60" />
          <p className="text-sm font-medium mt-3">Nenhum documento fiscal ainda</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Documentos aparecem aqui quando são da categoria fiscal (Imposto de Renda,
            Fiscal, Informe de rendimento) ou quando marcados como{" "}
            <span className="text-amber-400">“Comunicar ao contador (IR)”</span> na análise da IA.
          </p>
          <Link href="/documentos">
            <Button variant="outline" size="sm" className="mt-4 gap-2">
              <FileText className="h-4 w-4" /> Ir para o Cofre Digital
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([yr, docs]) => (
            <div key={yr} className="rounded-lg border border-border/60 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 bg-secondary/40 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Exercício {yr}</h2>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {docs.length}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-8"
                  disabled={bundling === yr}
                  onClick={() => shareBundle(yr, docs)}
                >
                  {bundling === yr ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="h-3.5 w-3.5" />
                  )}
                  Copiar links do exercício
                </Button>
              </div>
              <div className="divide-y divide-border">
                {docs.map((doc) => {
                  const value = relevantValue(doc);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 border-transparent ${categoryColors[doc.category] ?? "bg-gray-500/10 text-gray-400"}`}
                          >
                            {CATEGORY_LABELS[doc.category] ?? doc.category}
                          </Badge>
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                          <span>{titular(doc)}</span>
                          <span>·</span>
                          <span>{formatDate(doc.createdAt)}</span>
                          {value && (
                            <>
                              <span>·</span>
                              <span className="text-foreground/80">{value}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Link href={`/documentos?open=${doc.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Visualizar">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Baixar">
                            <Download className="h-4 w-4" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Copiar link de compartilhamento"
                          onClick={() => shareOne(doc)}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Os links de compartilhamento são assinados e expiram em 7 dias. Um portal dedicado
          do contador (com acesso por convite e trilha de auditoria) está no roadmap.
        </span>
      </div>
    </div>
  );
}
