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
import { onlyDigits } from "@/lib/currency";
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
  History,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
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
  finance: "bg-green-500/10 text-green-400",
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
  if (flaggedForAccountant(doc) || FISCAL_CATEGORIES.has(doc.category)) return true;
  // Finance documents whose subcategory is the income report are fiscal too.
  return doc.category === "finance" && parseMeta(doc).subcategoria === "Informe de Rendimento";
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

/** Best-effort taxpayer name for the document. */
function titularName(doc: Doc): string {
  const m = parseMeta(doc);
  return (
    m.beneficiario ||
    m.proprietario ||
    m.consorciado ||
    m.contratanteNome ||
    m.razaoSocial ||
    doc.ownerName ||
    ""
  );
}

/** Best-effort taxpayer document number (CPF/CNPJ) for the document. */
function titularDoc(doc: Doc): string {
  const m = parseMeta(doc);
  return (
    m.beneficiarioCpf ||
    m.proprietarioCpf ||
    m.proprietarioCnpj ||
    m.cpf ||
    m.cnpj ||
    m.cpfCnpj ||
    ""
  );
}

/** Whether the taxpayer is a person (PF) or company (PJ) — by document length
 *  when known, else by the "tipo de pessoa" field. */
function titularType(doc: Doc): "PF" | "PJ" | null {
  const digits = onlyDigits(titularDoc(doc));
  if (digits.length === 14) return "PJ";
  if (digits.length === 11) return "PF";
  const m = parseMeta(doc);
  const tp =
    m.proprietarioTipoPessoa ||
    m.fontePagadoraTipoPessoa ||
    m.tipoPessoa ||
    m.contratanteTipoPessoa ||
    "";
  if (tp === "Pessoa jurídica") return "PJ";
  if (tp === "Pessoa física") return "PF";
  return null;
}

/** Stable key grouping documents by taxpayer (document digits, else name). */
function titularKey(doc: Doc): string {
  const digits = onlyDigits(titularDoc(doc));
  if (digits) return digits;
  const name = titularName(doc).trim().toLowerCase();
  return name || "__sem_titular__";
}

/** Combined "nome · CPF/CNPJ" label for display. */
function titular(doc: Doc): string {
  return [titularName(doc), titularDoc(doc)].filter(Boolean).join(" · ") || "Sem titular informado";
}

/** For a vehicle document, whether it represents a purchase or a sale. */
function operacao(doc: Doc): "Compra" | "Venda" | null {
  if (doc.category !== "vehicle") return null;
  const v = parseMeta(doc).operacao;
  return v === "Compra" || v === "Venda" ? v : null;
}

/** For a consórcio document, the underlying type (Veículo, Imóvel, ...). */
function consorcioTipo(doc: Doc): string | null {
  if (doc.category !== "consorcio") return null;
  return parseMeta(doc).tipo || null;
}

/** Contract number, when the document carries one (consórcio/contrato). */
function numeroContrato(doc: Doc): string | null {
  return parseMeta(doc).numeroContrato || null;
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

/** Format raw CPF/CNPJ digits for display. */
function formatDoc(digits: string): string {
  const c = digits.replace(/\D/g, "");
  if (c.length === 11) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  if (c.length === 14) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  return digits;
}

/** CPF check-digit validation. */
function isValidCpf(value: string): boolean {
  const c = value.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i], 10) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(c[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i], 10) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(c[10], 10);
}

/** CNPJ check-digit validation. */
function isValidCnpj(value: string): boolean {
  const c = value.replace(/\D/g, "");
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const digit = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += parseInt(c[len - i], 10) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === parseInt(c[12], 10) && digit(13) === parseInt(c[13], 10);
}

/** Whether a taxpayer document number is structurally valid (or empty). */
function isDocValid(value: string): boolean {
  const c = onlyDigits(value);
  if (!c) return true;
  if (c.length === 11) return isValidCpf(c);
  if (c.length === 14) return isValidCnpj(c);
  return false; // wrong length
}

type AuditFinding = {
  id: string;
  level: "error" | "warning";
  title: string;
  detail: string;
  docs: Doc[];
};

/** Detect fiscal data inconsistencies the user should fix before sending. */
function auditFiscalDocs(docs: Doc[]): AuditFinding[] {
  const out: AuditFinding[] = [];

  // Invalid CPF/CNPJ (one finding per document).
  for (const d of docs) {
    const raw = titularDoc(d);
    if (raw && !isDocValid(raw)) {
      out.push({
        id: `invalid-${d.id}`,
        level: "error",
        title: "CPF/CNPJ inválido",
        detail: `${titularName(d) || "Titular"} — ${raw}`,
        docs: [d],
      });
    }
  }

  // Same name, different document numbers.
  const byName = new Map<string, Map<string, Doc[]>>();
  for (const d of docs) {
    const name = titularName(d).trim().toLowerCase();
    const digits = onlyDigits(titularDoc(d));
    if (!name || !digits) continue;
    if (!byName.has(name)) byName.set(name, new Map());
    const m = byName.get(name)!;
    if (!m.has(digits)) m.set(digits, []);
    m.get(digits)!.push(d);
  }
  for (const m of Array.from(byName.values())) {
    if (m.size > 1) {
      const all = Array.from(m.values()).reduce<Doc[]>((acc, arr) => acc.concat(arr), []);
      const numbers = Array.from(m.keys()).map(formatDoc).join(" × ");
      out.push({
        id: `name-${onlyDigits(titularDoc(all[0]))}-${all.length}`,
        level: "warning",
        title: "Mesmo nome com CPF/CNPJ diferentes",
        detail: `"${titularName(all[0])}" aparece com: ${numbers}`,
        docs: all,
      });
    }
  }

  // Same document number, different names.
  const byDoc = new Map<string, Map<string, Doc[]>>();
  for (const d of docs) {
    const digits = onlyDigits(titularDoc(d));
    const name = titularName(d).trim();
    if (!digits || !name) continue;
    if (!byDoc.has(digits)) byDoc.set(digits, new Map());
    const m = byDoc.get(digits)!;
    const k = name.toLowerCase();
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(d);
  }
  for (const [digits, m] of Array.from(byDoc.entries())) {
    if (m.size > 1) {
      const all = Array.from(m.values()).reduce<Doc[]>((acc, arr) => acc.concat(arr), []);
      const names = Array.from(m.values()).map((arr) => titularName(arr[0])).join(" × ");
      out.push({
        id: `doc-${digits}`,
        level: "warning",
        title: "Mesmo CPF/CNPJ com nomes diferentes",
        detail: `${formatDoc(digits)} aparece como: ${names}`,
        docs: all,
      });
    }
  }

  // Fiscal document without a taxpayer number.
  const missing = docs.filter((d) => !onlyDigits(titularDoc(d)));
  if (missing.length > 0) {
    out.push({
      id: "missing-doc",
      level: "warning",
      title: "Sem CPF/CNPJ do titular",
      detail: `${missing.length} documento(s) sem CPF/CNPJ informado`,
      docs: missing,
    });
  }

  // Errors first, then warnings.
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("pt-BR");
}

function formatDateTime(date: string | Date) {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Contador() {
  const { data: documents, isLoading } = trpc.documents.list.useQuery();
  const { data: accessLog } = trpc.documents.shareAccessLog.useQuery();
  const shareLinkMutation = trpc.documents.shareLink.useMutation();
  const [year, setYear] = useState<string>("all");
  const [tipo, setTipo] = useState<string>("all"); // all | PF | PJ
  const [holder, setHolder] = useState<string>("all"); // all | titularKey
  const [bundling, setBundling] = useState<string | null>(null);

  const fiscalDocs = useMemo(
    () => ((documents as Doc[] | undefined) ?? []).filter(isFiscal),
    [documents],
  );

  const findings = useMemo(() => auditFiscalDocs(fiscalDocs), [fiscalDocs]);

  const years = useMemo(() => {
    const set = new Set(fiscalDocs.map(fiscalYear));
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [fiscalDocs]);

  // Distinct taxpayers found in the fiscal documents (for the holder filter).
  const holders = useMemo(() => {
    const map = new Map<string, { key: string; name: string; doc: string; tipo: "PF" | "PJ" | null }>();
    for (const d of fiscalDocs) {
      const key = titularKey(d);
      if (!map.has(key)) {
        map.set(key, { key, name: titularName(d) || "Sem titular", doc: titularDoc(d), tipo: titularType(d) });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [fiscalDocs]);

  // Holder options, narrowed by the PF/PJ filter when active.
  const holderOptions = useMemo(
    () => (tipo === "all" ? holders : holders.filter((h) => h.tipo === tipo)),
    [holders, tipo],
  );

  const shown = useMemo(
    () =>
      fiscalDocs.filter(
        (d) =>
          (year === "all" || fiscalYear(d) === year) &&
          (tipo === "all" || titularType(d) === tipo) &&
          (holder === "all" || titularKey(d) === holder),
      ),
    [fiscalDocs, year, tipo, holder],
  );

  const selectedHolderName =
    holder === "all" ? null : holders.find((h) => h.key === holder)?.name ?? null;

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
      const who = selectedHolderName ? ` — ${selectedHolderName}` : "";
      await navigator.clipboard.writeText(
        `Documentos para o contador${who} — exercício ${yr} (links válidos por 7 dias):\n\n${lines.join("\n")}`,
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

      {/* Auditoria — inconsistências a corrigir antes de enviar */}
      {fiscalDocs.length > 0 &&
        (findings.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Auditoria: nenhuma inconsistência encontrada nos dados fiscais.
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/40 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/30">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-amber-300">
                Auditoria — {findings.length} {findings.length === 1 ? "inconsistência" : "inconsistências"} a revisar
              </h2>
            </div>
            <div className="divide-y divide-border">
              {findings.map((f) => (
                <div key={f.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {f.level === "error" ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    )}
                    <span className={`text-sm font-medium ${f.level === "error" ? "text-red-400" : "text-amber-300"}`}>
                      {f.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{f.detail}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {f.docs.map((d) => (
                      <Link key={d.id} href={`/documentos?open=${d.id}`}>
                        <button
                          type="button"
                          className="text-[11px] rounded bg-secondary/70 hover:bg-secondary px-2 py-0.5 text-foreground/90 max-w-[260px] truncate"
                          title={`Abrir: ${d.title}`}
                        >
                          {d.title}
                        </button>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

      {/* Filters: exercício × tipo (PF/PJ) × titular */}
      {fiscalDocs.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-full sm:w-44">
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

          <Select
            value={tipo}
            onValueChange={(v) => {
              setTipo(v);
              // Reset holder if it no longer matches the chosen type.
              if (v !== "all" && holder !== "all") {
                const h = holders.find((x) => x.key === holder);
                if (!h || h.tipo !== v) setHolder("all");
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Tipo de pessoa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">PF e PJ</SelectItem>
              <SelectItem value="PF">Pessoa física (PF)</SelectItem>
              <SelectItem value="PJ">Pessoa jurídica (PJ)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={holder} onValueChange={setHolder}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Titular" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os titulares</SelectItem>
              {holderOptions.map((h) => (
                <SelectItem key={h.key} value={h.key}>
                  {h.name}
                  {h.tipo ? ` (${h.tipo})` : ""}
                  {h.doc ? ` · ${h.doc}` : ""}
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
          {fiscalDocs.length > 0 ? (
            <>
              <p className="text-sm font-medium mt-3">Nenhum documento para este filtro</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Ajuste o exercício, o tipo de pessoa ou o titular selecionados.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setYear("all");
                  setTipo("all");
                  setHolder("all");
                }}
              >
                Limpar filtros
              </Button>
            </>
          ) : (
            <>
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
            </>
          )}
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
                  const sub = parseMeta(doc).subcategoria;
                  const label =
                    doc.category === "finance" && sub ? sub : CATEGORY_LABELS[doc.category] ?? doc.category;
                  const op = operacao(doc);
                  const tipoCons = consorcioTipo(doc);
                  const contrato = numeroContrato(doc);
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
                            {label}
                          </Badge>
                          {op && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${op === "Compra" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-red-500/50 bg-red-500/10 text-red-400"}`}
                            >
                              {op}
                            </Badge>
                          )}
                          {tipoCons && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-sky-500/50 bg-sky-500/10 text-sky-400">
                              {tipoCons}
                            </Badge>
                          )}
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                          {contrato && (
                            <>
                              <span className="text-foreground/80">Contrato nº {contrato}</span>
                              <span>·</span>
                            </>
                          )}
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

      {/* Audit trail */}
      {accessLog && accessLog.length > 0 && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-secondary/40 border-b border-border/60">
            <History className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Acessos recentes aos links</h2>
          </div>
          <div className="divide-y divide-border">
            {accessLog.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="font-medium truncate">{log.title ?? "Documento removido"}</p>
                  <p className="text-muted-foreground mt-0.5">{log.ip || "IP desconhecido"}</p>
                </div>
                <span className="text-muted-foreground shrink-0">{formatDateTime(log.accessedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md bg-secondary/40 p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Os links de compartilhamento são assinados e expiram em 7 dias, e cada acesso fica
          registrado na trilha de auditoria acima. Um portal dedicado do contador (com acesso
          por convite e login próprio) está no roadmap.
        </span>
      </div>
    </div>
  );
}
