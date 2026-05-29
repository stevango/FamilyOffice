import { useMemo, useState } from "react";
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
  User,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  Clock,
  Loader2,
  Users,
  Bot,
  History,
  FileText,
  Paperclip,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/export";
import { maskMoney, parseBRLNum } from "@/lib/currency";

function formatCurrency(value: number | string | null) {
  if (!value) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num || Number.isNaN(num)) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatDate(date: string | Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR");
}

const caseTypeLabels: Record<string, string> = { favorable: "Favorável", unfavorable: "Desfavorável", neutral: "Neutro" };
const statusLabels: Record<string, string> = { active: "Ativo", closed: "Encerrado", suspended: "Suspenso", archived: "Arquivado" };
const statusIcons: Record<string, any> = { active: AlertTriangle, closed: CheckCircle2, suspended: PauseCircle, archived: Archive };
const statusColors: Record<string, string> = { active: "text-amber-400", closed: "text-emerald-400", suspended: "text-orange-400", archived: "text-gray-400" };

const areaLabels: Record<string, string> = {
  civel: "Cível", trabalhista: "Trabalhista", tributario: "Tributário", criminal: "Criminal",
  familia: "Família", empresarial: "Empresarial", consumidor: "Consumidor", administrativo: "Administrativo", outro: "Outro",
};
const poloLabels: Record<string, string> = {
  autor: "Autor", reu: "Réu", interessado: "Interessado", terceiro: "Terceiro", exequente: "Exequente",
  executado: "Executado", reclamante: "Reclamante", reclamado: "Reclamado", outro: "Outro",
};
const riscoLabels: Record<string, string> = { baixo: "Baixo risco", medio: "Médio risco", alto: "Alto risco", critico: "Crítico" };
const riscoColors: Record<string, string> = {
  baixo: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medio: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  alto: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  critico: "bg-red-500/10 text-red-400 border-red-500/30",
};
const POLO_AUTOR = ["autor", "exequente", "reclamante"];
const POLO_REU = ["reu", "executado", "reclamado"];

const esferaLabels: Record<string, string> = { pessoal: "Pessoal", empresarial: "Empresarial", familiar: "Familiar", outro: "Outro" };
const esferaColors: Record<string, string> = {
  pessoal: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  empresarial: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  familiar: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  outro: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

function daysUntil(date?: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00").getTime();
  if (Number.isNaN(d)) return null;
  return Math.round((d - Date.now()) / 86400000);
}

/** Automatic attention triage so the user instantly sees what matters. */
function atencao(c: any): "preocupar" | "atencao" | "tranquilo" {
  if (c.status === "closed" || c.status === "archived") return "tranquilo";
  if (c.risco === "critico" || c.risco === "alto") return "preocupar";
  const prazo = daysUntil(c.nextDeadline);
  if (prazo != null && prazo <= 7) return "preocupar";
  const aud = daysUntil(c.audiencia);
  if (aud != null && aud >= 0 && aud <= 7) return "preocupar";
  if (prazo != null && prazo <= 30) return "atencao";
  if (aud != null && aud >= 0 && aud <= 30) return "atencao";
  if (!c.lawyer) return "atencao";
  if (!c.esfera || !c.area || !c.risco) return "atencao"; // falta classificar
  if (c.risco === "medio") return "atencao";
  return "tranquilo";
}
const atencaoMeta: Record<string, { label: string; color: string; dot: string }> = {
  preocupar: { label: "Preocupar", color: "bg-red-500/10 text-red-400 border-red-500/30", dot: "bg-red-500" },
  atencao: { label: "Em atenção", color: "bg-amber-500/10 text-amber-400 border-amber-500/30", dot: "bg-amber-500" },
  tranquilo: { label: "Tranquilo", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500" },
};

const emptyForm = {
  title: "", caseNumber: "", caseType: "neutral", status: "active", court: "", lawyer: "",
  estimatedCost: "", actualCost: "", nextDeadline: "", description: "", notes: "",
  area: "", polo: "", risco: "", vinculo: "", valorCausa: "", audiencia: "", esfera: "",
};

export default function Juridico() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [riscoFilter, setRiscoFilter] = useState("all");
  const [atencaoFilter, setAtencaoFilter] = useState("all");
  const [esferaFilter, setEsferaFilter] = useState("all");
  const utils = trpc.useUtils();

  const { data: cases, isLoading } = trpc.legalCases.list.useQuery();
  const { data: allDocs } = trpc.documents.list.useQuery();
  const invalidate = () => { utils.legalCases.list.invalidate(); utils.dashboard.summary.invalidate(); };

  const createMutation = trpc.legalCases.create.useMutation({ onSuccess: () => { invalidate(); setOpen(false); toast.success("Processo cadastrado"); } });
  const updateMutation = trpc.legalCases.update.useMutation({ onSuccess: () => { invalidate(); setOpen(false); toast.success("Processo atualizado"); } });
  const deleteMutation = trpc.legalCases.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Processo removido"); } });
  const enrichMutation = trpc.legalCases.enrich.useMutation({
    onSuccess: () => { invalidate(); toast.success("Processo atualizado pelo DataJud"); },
    onError: (e) => toast.error(e.message ?? "Falha ao consultar o DataJud"),
  });
  const [explainFor, setExplainFor] = useState<{ title: string } | null>(null);
  const [explanation, setExplanation] = useState<string>("");
  const explainMutation = trpc.legalCases.explain.useMutation({
    onSuccess: (r) => setExplanation(r.explanation),
    onError: (e) => { toast.error(e.message ?? "Falha na explicação por IA"); setExplainFor(null); },
  });
  const explain = (c: any) => { setExplainFor({ title: c.title }); setExplanation(""); explainMutation.mutate({ id: c.id }); };

  const [docsForId, setDocsForId] = useState<number | null>(null);
  const [docsForTitle, setDocsForTitle] = useState("");
  const [docSel, setDocSel] = useState<Set<number>>(new Set());
  const [docSearch, setDocSearch] = useState("");
  const attachMutation = trpc.legalCases.attachDocuments.useMutation({
    onSuccess: () => { invalidate(); toast.success("Documentos do processo atualizados"); setDocsForId(null); },
    onError: (e) => toast.error(e.message ?? "Falha ao salvar"),
  });
  const openDocs = (c: any) => {
    let ids: number[] = [];
    try { if (c.documentIds) ids = JSON.parse(c.documentIds); } catch { /* ignore */ }
    setDocSel(new Set(ids));
    setDocSearch("");
    setDocsForTitle(c.title);
    setDocsForId(c.id);
  };
  const docCount = (c: any) => { try { return c.documentIds ? (JSON.parse(c.documentIds) as number[]).length : 0; } catch { return 0; } };

  const [timelineFor, setTimelineFor] = useState<{ title: string; movimentos: { data: string; nome: string }[] } | null>(null);
  const openTimeline = (c: any) => {
    let movs: { data: string; nome: string }[] = [];
    try { if (c.movimentos) movs = JSON.parse(c.movimentos); } catch { /* ignore */ }
    setTimelineFor({ title: c.title, movimentos: movs });
  };

  const [importOpen, setImportOpen] = useState(false);
  const [importProvider, setImportProvider] = useState("datajud");
  const [importQuery, setImportQuery] = useState("");
  const importMutation = trpc.legalCases.importFromApi.useMutation({
    onSuccess: (r: any) => {
      invalidate();
      if (r.imported > 0) toast.success(`${r.imported} processo(s) cadastrado(s)`);
      else toast.message(r.message ?? "Nenhum processo novo encontrado");
      if (r.imported > 0) setImportOpen(false);
    },
    onError: (e) => toast.error(e.message ?? "Falha na busca"),
  });
  const runImport = () => {
    if (importProvider === "datajud" && importQuery.replace(/\D/g, "").length !== 20) {
      toast.error("Informe o número CNJ (20 dígitos) para o DataJud");
      return;
    }
    importMutation.mutate({ provider: importProvider as any, query: importQuery || undefined });
  };

  const openNew = () => { setEditingId(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      title: c.title ?? "", caseNumber: c.caseNumber ?? "", caseType: c.caseType ?? "neutral", status: c.status ?? "active",
      court: c.court ?? "", lawyer: c.lawyer ?? "", estimatedCost: c.estimatedCost ?? "", actualCost: c.actualCost ?? "",
      nextDeadline: c.nextDeadline ?? "", description: c.description ?? "", notes: c.notes ?? "",
      area: c.area ?? "", polo: c.polo ?? "", risco: c.risco ?? "", vinculo: c.vinculo ?? "", esfera: c.esfera ?? "",
      valorCausa: c.valorCausa ? maskMoney(String(c.valorCausa).replace(".", ",")) : "", audiencia: c.audiencia ?? "",
    });
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { toast.error("Preencha o título do processo"); return; }
    const payload = {
      title: form.title,
      caseNumber: form.caseNumber || undefined,
      caseType: form.caseType as any,
      status: form.status as any,
      court: form.court || undefined,
      lawyer: form.lawyer || undefined,
      estimatedCost: form.estimatedCost || undefined,
      actualCost: form.actualCost || undefined,
      nextDeadline: form.nextDeadline || undefined,
      description: form.description || undefined,
      notes: form.notes || undefined,
      area: (form.area || undefined) as any,
      polo: (form.polo || undefined) as any,
      risco: (form.risco || undefined) as any,
      esfera: (form.esfera || undefined) as any,
      vinculo: form.vinculo || undefined,
      valorCausa: form.valorCausa ? String(parseBRLNum(form.valorCausa)) : undefined,
      audiencia: form.audiencia || undefined,
    };
    if (editingId != null) updateMutation.mutate({ id: editingId, ...payload });
    else createMutation.mutate(payload);
  };

  const list = (cases as any[] | undefined) ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (areaFilter !== "all" && c.area !== areaFilter) return false;
      if (riscoFilter !== "all" && c.risco !== riscoFilter) return false;
      if (esferaFilter !== "all" && c.esfera !== esferaFilter) return false;
      if (atencaoFilter !== "all" && atencao(c) !== atencaoFilter) return false;
      if (q) {
        const hay = [c.title, c.caseNumber, c.lawyer, c.court, c.vara, c.vinculo, c.assunto].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [list, search, statusFilter, areaFilter, riscoFilter, esferaFilter, atencaoFilter]);

  // ---- Executive metrics ----
  const m = useMemo(() => {
    return {
      ativos: list.filter((c) => c.status === "active").length,
      total: list.length,
      preocupar: list.filter((c) => atencao(c) === "preocupar").length,
      atencao: list.filter((c) => atencao(c) === "atencao").length,
      tranquilo: list.filter((c) => atencao(c) === "tranquilo").length,
      pessoais: list.filter((c) => c.esfera === "pessoal").length,
      empresariais: list.filter((c) => c.esfera === "empresarial").length,
      semClassificar: list.filter((c) => !c.esfera || !c.area || !c.risco).length,
      valorCausas: list.reduce((s, c) => s + (Number(c.valorCausa) || 0), 0),
      custo: list.reduce((s, c) => s + (Number(c.estimatedCost) || 0), 0),
    };
  }, [list]);

  const handleExport = () => {
    if (list.length === 0) { toast.error("Nenhum processo para exportar"); return; }
    downloadCsv(`processos-${new Date().toISOString().slice(0, 10)}`, list, [
      { key: "title", label: "Título" },
      { key: "caseNumber", label: "Número" },
      { key: "area", label: "Área", format: (c) => areaLabels[c.area] ?? c.area ?? "" },
      { key: "polo", label: "Posição", format: (c) => poloLabels[c.polo] ?? c.polo ?? "" },
      { key: "risco", label: "Risco", format: (c) => riscoLabels[c.risco] ?? c.risco ?? "" },
      { key: "vinculo", label: "Vínculo" },
      { key: "status", label: "Status", format: (c) => statusLabels[c.status] ?? c.status },
      { key: "court", label: "Órgão/Vara" },
      { key: "lawyer", label: "Advogado" },
      { key: "valorCausa", label: "Valor da causa" },
      { key: "estimatedCost", label: "Custo Estimado" },
      { key: "nextDeadline", label: "Próximo Prazo" },
      { key: "ultimoAndamento", label: "Último andamento" },
    ]);
  };

  const stat = (label: string, value: string | number, icon: React.ReactNode, accent?: string) => (
    <Card className="bg-card border-border">
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
        <p className={`text-2xl font-bold mt-1 ${accent ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Módulo Jurídico</h1>
        <p className="text-muted-foreground text-sm mt-1">Radar de processos, prazos, riscos e custos — pessoal, familiar e empresarial.</p>
      </div>

      {/* Triage — o que olhar primeiro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {([
          { lvl: "preocupar", value: m.preocupar, title: "Preocupar agora", desc: "Risco alto/crítico ou prazo/audiência em até 7 dias." },
          { lvl: "atencao", value: m.atencao, title: "Ficar de atenção", desc: "Prazo em até 30 dias, sem advogado ou falta classificar." },
          { lvl: "tranquilo", value: m.tranquilo, title: "Tranquilo", desc: "Sem pendências próximas; encerrados/arquivados." },
        ] as const).map(({ lvl, value, title, desc }) => {
          const meta = atencaoMeta[lvl];
          const active = atencaoFilter === lvl;
          return (
            <button key={lvl} type="button" onClick={() => setAtencaoFilter(active ? "all" : lvl)}
              className={`text-left rounded-lg border p-4 transition ${meta.color} ${active ? "ring-2 ring-current" : "hover:brightness-110"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} /> {title}</span>
                <span className="text-2xl font-bold">{value}</span>
              </div>
              <p className="text-[11px] opacity-80 mt-1">{desc}</p>
            </button>
          );
        })}
      </div>

      {/* Esfera + números */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button type="button" onClick={() => setEsferaFilter(esferaFilter === "pessoal" ? "all" : "pessoal")}
          className={`text-left rounded-lg border border-border bg-card p-4 hover:bg-accent/30 ${esferaFilter === "pessoal" ? "ring-2 ring-primary" : ""}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><User className="h-3.5 w-3.5 text-blue-400" /> Pessoais</div>
          <p className="text-2xl font-bold mt-1">{m.pessoais}</p>
        </button>
        <button type="button" onClick={() => setEsferaFilter(esferaFilter === "empresarial" ? "all" : "empresarial")}
          className={`text-left rounded-lg border border-border bg-card p-4 hover:bg-accent/30 ${esferaFilter === "empresarial" ? "ring-2 ring-primary" : ""}`}>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5 text-purple-400" /> Empresariais</div>
          <p className="text-2xl font-bold mt-1">{m.empresariais}</p>
        </button>
        {stat("Ativos", m.ativos, <Gavel className="h-3.5 w-3.5 text-amber-400" />)}
        {stat("Valor das causas", formatCurrency(m.valorCausas), <DollarSign className="h-3.5 w-3.5 text-primary" />)}
        {stat("Custo estimado", formatCurrency(m.custo), <DollarSign className="h-3.5 w-3.5 text-destructive" />)}
      </div>

      {m.semClassificar > 0 && (
        <button type="button" onClick={() => setAtencaoFilter("atencao")}
          className="flex items-center gap-2 w-full rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10 text-left">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {m.semClassificar} processo(s) sem classificação (esfera, área ou risco). Defina para o radar ficar preciso — clique para ver.
        </button>
      )}

      {/* Filters + actions */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por número, parte, advogado, tribunal, vínculo..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas áreas</SelectItem>
              {Object.entries(areaLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={riscoFilter} onValueChange={setRiscoFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Risco" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos riscos</SelectItem>
              {Object.entries(riscoLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { setImportOpen(true); setImportQuery(""); }}>
            <Search className="h-4 w-4" /> Buscar nas APIs
          </Button>
          <Button size="sm" className="gap-2" onClick={openNew}>
            <Plus className="h-4 w-4" /> Novo Processo
          </Button>
        </div>
      </div>

      {/* Cases list */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((c) => {
            const StatusIcon = statusIcons[c.status] || AlertTriangle;
            return (
              <Card key={c.id} className="bg-card border-border">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                        <StatusIcon className={`h-5 w-5 ${statusColors[c.status]}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{c.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {(() => { const a = atencao(c); const meta = atencaoMeta[a]; return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${meta.color}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</Badge>; })()}
                          {c.esfera && <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${esferaColors[c.esfera] ?? ""}`}>{esferaLabels[c.esfera]}</Badge>}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{statusLabels[c.status]}</Badge>
                          {c.risco && <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${riscoColors[c.risco] ?? ""}`}>{riscoLabels[c.risco]}</Badge>}
                          {c.area && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{areaLabels[c.area]}</Badge>}
                          {c.polo && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{poloLabels[c.polo]}</Badge>}
                          {c.vinculo && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.vinculo}</Badge>}
                          {c.caseNumber && <span className="text-xs text-muted-foreground font-mono">{c.caseNumber}</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          {(c.vara || c.court) && <span className="flex items-center gap-1"><Gavel className="h-3 w-3" /> {c.vara || c.court}</span>}
                          {c.lawyer && <span className="flex items-center gap-1"><Scale className="h-3 w-3" /> {c.lawyer}</span>}
                          {c.nextDeadline && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Prazo: {formatDate(c.nextDeadline)}</span>}
                          {c.audiencia && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Audiência: {formatDate(c.audiencia)}</span>}
                          {(c.ownerName || c.ownerEmail) && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {c.ownerName || c.ownerEmail}</span>}
                        </div>
                        {c.ultimoAndamento && (
                          <p className="text-xs text-foreground/80 mt-2"><span className="text-muted-foreground">Último andamento:</span> {c.ultimoAndamento}</p>
                        )}
                        {c.fonte && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Fonte: {c.fonte}{c.lastSyncAt ? ` · sincronizado em ${formatDate(c.lastSyncAt)}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {c.valorCausa && (
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">Valor da causa</p>
                          <p className="text-sm font-semibold">{formatCurrency(c.valorCausa)}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 relative" title="Documentos do processo" onClick={() => openDocs(c)}>
                          <Paperclip className="h-3.5 w-3.5" />
                          {docCount(c) > 0 && <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-primary text-primary-foreground rounded-full h-3.5 min-w-3.5 px-0.5 flex items-center justify-center">{docCount(c)}</span>}
                        </Button>
                        {c.movimentos && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver histórico" onClick={() => openTimeline(c)}>
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Explicar com IA"
                          disabled={explainMutation.isPending} onClick={() => explain(c)}>
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Atualizar via DataJud"
                          disabled={enrichMutation.isPending} onClick={() => enrichMutation.mutate({ id: c.id })}>
                          {enrichMutation.isPending && enrichMutation.variables?.id === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Excluir" onClick={() => deleteMutation.mutate({ id: c.id })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Scale className="h-12 w-12 text-muted-foreground/40 mb-3" />
            {(search.trim() || statusFilter !== "all" || areaFilter !== "all" || riscoFilter !== "all") ? (
              <>
                <p className="text-sm text-muted-foreground">Nenhum processo encontrado na busca</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  A busca procura apenas entre os processos <b>já cadastrados</b> aqui — ela não consulta os tribunais pelo nome.
                  Para trazer um processo, clique em <b>Novo Processo</b>, informe o <b>número CNJ</b> e use <b>“Atualizar via DataJud”</b>.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Nenhum processo cadastrado</p>
                <p className="text-xs text-muted-foreground mt-1">Registre seus processos judiciais (pelo número CNJ) e atualize pelo DataJud.</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search / import from APIs */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> Buscar e cadastrar processos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Fonte</Label>
              <Select value={importProvider} onValueChange={(v) => { setImportProvider(v); setImportQuery(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="datajud">DataJud (CNJ) — por número CNJ</SelectItem>
                  <SelectItem value="jusbrasil">Jusbrasil — monitoramento por parte</SelectItem>
                  <SelectItem value="digesto">Digesto — monitoramento por parte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {importProvider === "datajud" ? (
              <div className="space-y-2">
                <Label>Número CNJ</Label>
                <Input value={importQuery} onChange={(e) => setImportQuery(e.target.value)} placeholder="0000000-00.0000.0.00.0000" />
                <p className="text-xs text-muted-foreground">O DataJud (CNJ) consulta por número do processo. Busca por nome/CPF não é possível na API pública (LGPD) — use Jusbrasil ou Digesto.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>CPF / CNPJ ou nome (opcional)</Label>
                <Input value={importQuery} onChange={(e) => setImportQuery(e.target.value)} placeholder="Ex: 000.000.000-00 ou nome da parte" />
                <p className="text-xs text-muted-foreground">
                  Importa os processos do monitoramento configurado no {importProvider === "digesto" ? "Digesto" : "Jusbrasil"} (requer o token salvo em Integrações). Os processos encontrados são cadastrados automaticamente para acompanhamento.
                </p>
              </div>
            )}
            <Button className="w-full gap-2" onClick={runImport} disabled={importMutation.isPending}>
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar e cadastrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Documents of the process */}
      <Dialog open={docsForId != null} onOpenChange={(v) => { if (!v) setDocsForId(null); }}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Documentos do processo</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">{docsForTitle}</p>
          {(() => {
            const docs = (allDocs as any[] | undefined) ?? [];
            const q = docSearch.trim().toLowerCase();
            const shown = q ? docs.filter((d) => (d.title ?? "").toLowerCase().includes(q)) : docs;
            return docs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum documento no Cofre Digital. Envie arquivos em Documentos e volte para anexá-los.</p>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9 h-9" placeholder="Buscar documento no Cofre..." value={docSearch} onChange={(e) => setDocSearch(e.target.value)} />
                </div>
                <div className="max-h-[50vh] overflow-y-auto divide-y divide-border rounded-md border border-border/60">
                  {shown.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                      <Checkbox
                        checked={docSel.has(d.id)}
                        onCheckedChange={(v) => setDocSel((prev) => { const n = new Set(prev); if (v) n.add(d.id); else n.delete(d.id); return n; })}
                      />
                      <span className="text-sm truncate flex-1">{d.title}</span>
                      {d.hasFile && (
                        <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" title="Baixar">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDocsForId(null)}>Cancelar</Button>
                  <Button onClick={() => docsForId != null && attachMutation.mutate({ id: docsForId, documentIds: Array.from(docSel) })} disabled={attachMutation.isPending}>
                    {attachMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Salvar (${docSel.size})`}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Timeline / histórico dialog */}
      <Dialog open={timelineFor != null} onOpenChange={(v) => { if (!v) setTimelineFor(null); }}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /> Histórico do processo</DialogTitle>
          </DialogHeader>
          {timelineFor && <p className="text-xs text-muted-foreground -mt-2">{timelineFor.title} · {timelineFor.movimentos.length} andamento(s)</p>}
          <div className="max-h-[60vh] overflow-y-auto">
            {timelineFor && timelineFor.movimentos.length > 0 ? (
              <ol className="relative border-l border-border ml-2 space-y-4 py-1">
                {timelineFor.movimentos.map((mv, i) => (
                  <li key={i} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary" />
                    <p className="text-[11px] text-muted-foreground">{mv.data ? new Date(mv.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
                    <p className="text-sm">{mv.nome}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum andamento importado.</p>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Andamentos importados do DataJud na última sincronização.</p>
        </DialogContent>
      </Dialog>

      {/* AI explanation dialog */}
      <Dialog open={explainFor != null} onOpenChange={(v) => { if (!v) setExplainFor(null); }}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Explicação do processo (IA)</DialogTitle>
          </DialogHeader>
          {explainFor && <p className="text-xs text-muted-foreground -mt-2">{explainFor.title}</p>}
          {explainMutation.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Analisando o processo...
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">{explanation}</div>
          )}
          <p className="text-[10px] text-muted-foreground">Explicação gerada por IA com base nos dados cadastrados — não substitui orientação do seu advogado.</p>
        </DialogContent>
      </Dialog>

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm({ ...emptyForm }); } }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar processo" : "Cadastrar processo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Título do processo</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Ação Trabalhista - Empresa X" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número CNJ</Label>
                <Input value={form.caseNumber} onChange={(e) => setForm({ ...form, caseNumber: e.target.value })} placeholder="0000000-00.0000.0.00.0000" />
              </div>
              <div className="space-y-2">
                <Label>Esfera</Label>
                <Select value={form.esfera || "none"} onValueChange={(v) => setForm({ ...form, esfera: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Pessoal ou empresarial" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definida</SelectItem>
                    {Object.entries(esferaLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vínculo</Label>
                <Input value={form.vinculo} onChange={(e) => setForm({ ...form, vinculo: e.target.value })} placeholder="Ex: CPF Stevan, Empresa X, Esposa" />
              </div>
              <div className="space-y-2">
                <Label>Área</Label>
                <Select value={form.area || "none"} onValueChange={(v) => setForm({ ...form, area: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definida</SelectItem>
                    {Object.entries(areaLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Posição (polo)</Label>
                <Select value={form.polo || "none"} onValueChange={(v) => setForm({ ...form, polo: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definida</SelectItem>
                    {Object.entries(poloLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Risco</Label>
                <Select value={form.risco || "none"} onValueChange={(v) => setForm({ ...form, risco: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não definido</SelectItem>
                    {Object.entries(riscoLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Órgão / Vara</Label>
                <Input value={form.court} onChange={(e) => setForm({ ...form, court: e.target.value })} placeholder="Ex: 1ª Vara Cível" />
              </div>
              <div className="space-y-2">
                <Label>Advogado</Label>
                <Input value={form.lawyer} onChange={(e) => setForm({ ...form, lawyer: e.target.value })} placeholder="Nome do advogado" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Próximo prazo</Label>
                <Input type="date" value={form.nextDeadline} onChange={(e) => setForm({ ...form, nextDeadline: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Audiência</Label>
                <Input type="date" value={form.audiencia} onChange={(e) => setForm({ ...form, audiencia: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Valor da causa (R$)</Label>
                <Input value={form.valorCausa} onChange={(e) => setForm({ ...form, valorCausa: maskMoney(e.target.value) })} placeholder="R$ 0,00" />
              </div>
              <div className="space-y-2">
                <Label>Custo estimado (R$)</Label>
                <Input type="number" step="0.01" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label>Custo real (R$)</Label>
                <Input type="number" step="0.01" value={form.actualCost} onChange={(e) => setForm({ ...form, actualCost: e.target.value })} placeholder="0,00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalhes do processo..." rows={2} />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
