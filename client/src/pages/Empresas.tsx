import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { onlyDigits, maskMoney, parseBRLNum, formatBRL } from "@/lib/currency";
import {
  Building2,
  Plus,
  Search,
  Loader2,
  Trash2,
  Pencil,
  Users,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  TrendingUp,
  CalendarClock,
} from "lucide-react";

const FINALIDADE: Record<string, { label: string; color: string }> = {
  operacional: { label: "Operacional", color: "bg-blue-500/10 text-blue-400" },
  patrimonial: { label: "Patrimonial", color: "bg-emerald-500/10 text-emerald-400" },
  holding: { label: "Holding", color: "bg-purple-500/10 text-purple-400" },
  investimento: { label: "Investimento", color: "bg-amber-500/10 text-amber-400" },
  tecnologia: { label: "Tecnologia", color: "bg-cyan-500/10 text-cyan-400" },
  seguros: { label: "Seguros", color: "bg-teal-500/10 text-teal-400" },
  servicos: { label: "Serviços", color: "bg-indigo-500/10 text-indigo-400" },
  consultoria: { label: "Consultoria", color: "bg-sky-500/10 text-sky-400" },
  imobiliaria: { label: "Imobiliária", color: "bg-green-500/10 text-green-400" },
  veiculos: { label: "Veículos", color: "bg-orange-500/10 text-orange-400" },
  familiar: { label: "Familiar", color: "bg-pink-500/10 text-pink-400" },
  projeto_futuro: { label: "Projeto futuro", color: "bg-violet-500/10 text-violet-400" },
  risco: { label: "Empresa de risco", color: "bg-red-500/10 text-red-400" },
  encerramento: { label: "Para encerramento", color: "bg-gray-500/10 text-gray-400" },
  reestruturacao: { label: "Reestruturação", color: "bg-rose-500/10 text-rose-400" },
  sucessao: { label: "Sucessão", color: "bg-fuchsia-500/10 text-fuchsia-400" },
  outro: { label: "Outro", color: "bg-gray-500/10 text-gray-400" },
};

const STATUS: Record<string, { label: string; color: string }> = {
  ativa: { label: "Ativa", color: "bg-emerald-500/10 text-emerald-400" },
  inativa: { label: "Inativa", color: "bg-gray-500/10 text-gray-400" },
  baixada: { label: "Baixada", color: "bg-zinc-500/10 text-zinc-400" },
  em_analise: { label: "Em análise", color: "bg-blue-500/10 text-blue-400" },
  risco: { label: "Risco", color: "bg-red-500/10 text-red-400" },
  pendente: { label: "Pendente", color: "bg-amber-500/10 text-amber-400" },
};

const RISCO: Record<string, { label: string; color: string }> = {
  baixo: { label: "Baixo risco", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/40" },
  medio: { label: "Médio risco", color: "bg-amber-500/10 text-amber-400 border-amber-500/40" },
  alto: { label: "Alto risco", color: "bg-orange-500/10 text-orange-400 border-orange-500/40" },
  critico: { label: "Crítico", color: "bg-red-500/10 text-red-400 border-red-500/40" },
};

const TIPO_PART: Record<string, string> = {
  socio: "Sócio",
  socio_administrador: "Sócio administrador",
  socio_investidor: "Sócio investidor",
  administrador: "Administrador",
  procurador: "Procurador",
  representante: "Representante legal",
  terceiro: "Terceiro",
};

const RISK_FLAGS = [
  "Dívidas fiscais", "Dívidas bancárias", "Processos judiciais", "Sócios problemáticos",
  "Certificado vencido", "Contabilidade pendente", "Obrigações acessórias pendentes",
  "Conta bancária bloqueada", "Pendências na Receita", "Pendências municipais",
  "Risco trabalhista", "Risco societário", "Risco sucessório",
];

const PLANEJAMENTO = [
  "Manter", "Encerrar", "Vender", "Transformar em holding", "Transferir participação",
  "Usar para investimento", "Usar para operação", "Deixar para sucessão", "Separar do risco pessoal",
];

type Partner = {
  id: number;
  companyId: number;
  nome: string;
  cpfCnpj?: string | null;
  tipoParticipacao: string;
  percentual?: string | null;
  capitalSocial?: string | null;
  dataEntrada?: string | null;
  dataSaida?: string | null;
  funcao?: string | null;
  isAdministrador: number;
  poderesBancarios: number;
  assinaContratos: number;
  possuiProcuracao: number;
  observacoesRisco?: string | null;
};

type Company = {
  id: number;
  razaoSocial: string;
  nomeFantasia?: string | null;
  cnpj?: string | null;
  inscricaoEstadual?: string | null;
  inscricaoMunicipal?: string | null;
  dataAbertura?: string | null;
  situacaoCadastral?: string | null;
  regimeTributario?: string | null;
  cnaePrincipal?: string | null;
  cnaeSecundarios?: string | null;
  ramo?: string | null;
  endereco?: string | null;
  contador?: string | null;
  advogado?: string | null;
  bancoPrincipal?: string | null;
  temCertificado: number;
  certificadoVencimento?: string | null;
  ultimaAlteracao?: string | null;
  finalidade: string;
  status: string;
  valorEstimado?: string | null;
  riscos: string[];
  riscoNivel: string;
  planejamento?: string | null;
  notes?: string | null;
  partners: Partner[];
};

/** Days until the digital certificate expires (negative = expired), or null. */
function certDaysLeft(c: Company): number | null {
  if (!c.temCertificado || !c.certificadoVencimento) return null;
  const d = new Date(c.certificadoVencimento + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("pt-BR");
}

const emptyForm = {
  razaoSocial: "", nomeFantasia: "", cnpj: "", inscricaoEstadual: "", inscricaoMunicipal: "",
  dataAbertura: "", situacaoCadastral: "", regimeTributario: "", cnaePrincipal: "", cnaeSecundarios: "",
  ramo: "", endereco: "", contador: "", advogado: "", bancoPrincipal: "",
  certificadoVencimento: "", ultimaAlteracao: "", finalidade: "operacional", status: "ativa",
  valorEstimado: "", riscoNivel: "baixo", planejamento: "", notes: "",
};

const emptyPartner = {
  nome: "", cpfCnpj: "", tipoParticipacao: "socio", percentual: "", capitalSocial: "",
  dataEntrada: "", dataSaida: "", funcao: "", observacoesRisco: "",
};

export default function Empresas() {
  const utils = trpc.useUtils();
  const { data: companies, isLoading } = trpc.companies.list.useQuery();
  const lookupCnpj = trpc.documents.lookupCnpj.useMutation();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [temCertificado, setTemCertificado] = useState(false);
  const [riscos, setRiscos] = useState<string[]>([]);

  // Partner sub-form (doubles as add/edit).
  const [partnerForm, setPartnerForm] = useState({ ...emptyPartner });
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [partnerFlags, setPartnerFlags] = useState({ isAdministrador: false, poderesBancarios: false, assinaContratos: false, possuiProcuracao: false });
  const [pendingSocios, setPendingSocios] = useState<{ nome: string; qualificacao: string; cpfCnpj: string }[]>([]);

  const invalidate = () => utils.companies.list.invalidate();
  const createMut = trpc.companies.create.useMutation({ onSuccess: () => invalidate() });
  const updateMut = trpc.companies.update.useMutation({ onSuccess: () => { invalidate(); toast.success("Empresa atualizada"); } });
  const deleteMut = trpc.companies.delete.useMutation({ onSuccess: () => { invalidate(); toast.success("Empresa removida"); setOpen(false); } });
  const addPartnerMut = trpc.companies.addPartner.useMutation({ onSuccess: () => { invalidate(); resetPartner(); } });
  const updatePartnerMut = trpc.companies.updatePartner.useMutation({ onSuccess: () => { invalidate(); resetPartner(); } });
  const removePartnerMut = trpc.companies.removePartner.useMutation({ onSuccess: () => invalidate() });

  const list = (companies as Company[] | undefined) ?? [];
  const editing = editingId != null ? list.find((c) => c.id === editingId) ?? null : null;

  function resetPartner() {
    setPartnerForm({ ...emptyPartner });
    setPartnerFlags({ isAdministrador: false, poderesBancarios: false, assinaContratos: false, possuiProcuracao: false });
    setEditingPartnerId(null);
  }

  function openNew() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setTemCertificado(false);
    setRiscos([]);
    setPendingSocios([]);
    resetPartner();
    setOpen(true);
  }

  function qualToTipo(q: string): string {
    const s = q.toLowerCase();
    if (s.includes("administrador") && (s.includes("sócio") || s.includes("socio"))) return "socio_administrador";
    if (s.includes("administrador")) return "administrador";
    if (s.includes("procurador")) return "procurador";
    return "socio";
  }

  async function importSocios(companyId: number, socios: { nome: string; qualificacao: string; cpfCnpj: string }[]) {
    for (const s of socios) {
      const digits = onlyDigits(s.cpfCnpj);
      await addPartnerMut.mutateAsync({
        companyId,
        nome: s.nome,
        cpfCnpj: digits.length === 11 || digits.length === 14 ? s.cpfCnpj : "",
        tipoParticipacao: qualToTipo(s.qualificacao) as any,
        funcao: s.qualificacao || undefined,
      });
    }
    if (socios.length) toast.success(`${socios.length} sócio(s) importado(s) do CNPJ`);
  }

  function openEdit(c: Company) {
    setEditingId(c.id);
    setForm({
      razaoSocial: c.razaoSocial ?? "", nomeFantasia: c.nomeFantasia ?? "", cnpj: c.cnpj ?? "",
      inscricaoEstadual: c.inscricaoEstadual ?? "", inscricaoMunicipal: c.inscricaoMunicipal ?? "",
      dataAbertura: c.dataAbertura ?? "", situacaoCadastral: c.situacaoCadastral ?? "",
      regimeTributario: c.regimeTributario ?? "", cnaePrincipal: c.cnaePrincipal ?? "",
      cnaeSecundarios: c.cnaeSecundarios ?? "", ramo: c.ramo ?? "", endereco: c.endereco ?? "",
      contador: c.contador ?? "", advogado: c.advogado ?? "", bancoPrincipal: c.bancoPrincipal ?? "",
      certificadoVencimento: c.certificadoVencimento ?? "", ultimaAlteracao: c.ultimaAlteracao ?? "",
      finalidade: c.finalidade, status: c.status, valorEstimado: c.valorEstimado ? formatBRL(Number(c.valorEstimado)) : "",
      riscoNivel: c.riscoNivel, planejamento: c.planejamento ?? "", notes: c.notes ?? "",
    });
    setTemCertificado(c.temCertificado === 1);
    setRiscos(c.riscos ?? []);
    setPendingSocios([]);
    resetPartner();
    setOpen(true);
  }

  const payload = () => ({
    ...form,
    valorEstimado: form.valorEstimado ? String(parseBRLNum(form.valorEstimado)) : "",
    temCertificado,
    riscos,
    finalidade: form.finalidade as any,
    status: form.status as any,
    riscoNivel: form.riscoNivel as any,
  });

  const save = async () => {
    if (!form.razaoSocial.trim()) { toast.error("Informe a razão social"); return; }
    try {
      if (editingId != null) {
        await updateMut.mutateAsync({ id: editingId, ...payload() });
      } else {
        const res = await createMut.mutateAsync(payload());
        const newId = Number((res as any)?.id);
        if (pendingSocios.length && newId) await importSocios(newId, pendingSocios);
        setPendingSocios([]);
        toast.success("Empresa cadastrada");
        setOpen(false);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao salvar");
    }
  };

  const doLookup = async () => {
    const digits = onlyDigits(form.cnpj);
    if (digits.length !== 14) { toast.error("Informe um CNPJ com 14 dígitos"); return; }
    try {
      const res = await lookupCnpj.mutateAsync({ cnpj: digits });
      const f = res.fields as Record<string, string>;
      setForm((p) => ({
        ...p,
        razaoSocial: p.razaoSocial || f.razaoSocial || "",
        nomeFantasia: p.nomeFantasia || f.nomeFantasia || "",
        situacaoCadastral: f.situacao || p.situacaoCadastral,
        regimeTributario: f.regimeTributario || p.regimeTributario,
        cnaePrincipal: f.cnae || p.cnaePrincipal,
        cnaeSecundarios: f.cnaeSecundarios || p.cnaeSecundarios,
        ramo: f.ramo || p.ramo,
        endereco: f.endereco || p.endereco,
        inscricaoEstadual: f.inscricaoEstadual || p.inscricaoEstadual,
        dataAbertura: f.dataAberturaIso || p.dataAbertura,
      }));
      const socios = (res.socios ?? []) as { nome: string; qualificacao: string; cpfCnpj: string }[];
      if (socios.length) {
        if (editingId != null) await importSocios(editingId, socios);
        else setPendingSocios(socios);
      }
      toast.success(`Dados da Receita carregados${socios.length ? ` · ${socios.length} sócio(s)` : ""}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Falha na consulta de CNPJ");
    }
  };

  const savePartner = () => {
    if (editingId == null) { toast.error("Salve a empresa antes de adicionar sócios"); return; }
    if (!partnerForm.nome.trim()) { toast.error("Informe o nome do sócio"); return; }
    const base = {
      ...partnerForm,
      tipoParticipacao: partnerForm.tipoParticipacao as any,
      percentual: partnerForm.percentual ? String(parseBRLNum(partnerForm.percentual)) : "",
      capitalSocial: partnerForm.capitalSocial ? String(parseBRLNum(partnerForm.capitalSocial)) : "",
      ...partnerFlags,
    };
    if (editingPartnerId != null) updatePartnerMut.mutate({ id: editingPartnerId, ...base });
    else addPartnerMut.mutate({ companyId: editingId, ...base });
  };

  const editPartner = (p: Partner) => {
    setEditingPartnerId(p.id);
    setPartnerForm({
      nome: p.nome ?? "", cpfCnpj: p.cpfCnpj ?? "", tipoParticipacao: p.tipoParticipacao,
      percentual: p.percentual ? String(Number(p.percentual)) : "", capitalSocial: p.capitalSocial ? formatBRL(Number(p.capitalSocial)) : "",
      dataEntrada: p.dataEntrada ?? "", dataSaida: p.dataSaida ?? "", funcao: p.funcao ?? "", observacoesRisco: p.observacoesRisco ?? "",
    });
    setPartnerFlags({
      isAdministrador: p.isAdministrador === 1, poderesBancarios: p.poderesBancarios === 1,
      assinaContratos: p.assinaContratos === 1, possuiProcuracao: p.possuiProcuracao === 1,
    });
  };

  // ---- Executive metrics & alerts ----
  const metrics = useMemo(() => {
    const ativas = list.filter((c) => c.status === "ativa").length;
    const inativas = list.filter((c) => c.status === "inativa" || c.status === "baixada").length;
    const pendencias = list.filter((c) => c.status === "pendente" || c.status === "risco" || c.riscos.length > 0 || c.riscoNivel === "alto" || c.riscoNivel === "critico").length;
    const certVencendo = list.filter((c) => { const d = certDaysLeft(c); return d != null && d <= 60; }).length;
    const valorTotal = list.reduce((s, c) => s + (Number(c.valorEstimado) || 0), 0);
    return { total: list.length, ativas, inativas, pendencias, certVencendo, valorTotal };
  }, [list]);

  const porPessoa = useMemo(() => {
    const map = new Map<string, { nome: string; empresas: number }>();
    for (const c of list) {
      for (const p of c.partners) {
        const key = (onlyDigits(p.cpfCnpj ?? "") || p.nome.trim().toLowerCase()) || "?";
        const cur = map.get(key) ?? { nome: p.nome || "—", empresas: 0 };
        cur.empresas += 1;
        map.set(key, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.empresas - a.empresas);
  }, [list]);

  const alerts = useMemo(() => {
    const out: { level: "error" | "warning"; text: string; company: Company }[] = [];
    for (const c of list) {
      const d = certDaysLeft(c);
      if (d != null && d < 0) out.push({ level: "error", text: `Certificado digital vencido há ${Math.abs(d)} dia(s)`, company: c });
      else if (d != null && d <= 60) out.push({ level: "warning", text: `Certificado digital vence em ${d} dia(s)`, company: c });
      if (c.riscoNivel === "critico" || c.riscoNivel === "alto") out.push({ level: c.riscoNivel === "critico" ? "error" : "warning", text: `${RISCO[c.riscoNivel].label}${c.riscos.length ? `: ${c.riscos.join(", ")}` : ""}`, company: c });
      if (!c.cnpj) out.push({ level: "warning", text: "Empresa sem CNPJ informado", company: c });
    }
    return out;
  }, [list]);

  const card = (title: string, value: string | number, icon: React.ReactNode, accent?: string) => (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {title}</div>
      <p className={`text-2xl font-semibold mt-1 ${accent ?? ""}`}>{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" /> Mapa Societário Familiar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Participações, sócios, riscos e planejamento das empresas da família.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nova empresa</Button>
      </div>

      {/* Executive cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {card("Empresas", metrics.total, <Building2 className="h-3.5 w-3.5" />)}
        {card("Ativas", metrics.ativas, <CheckCircle2 className="h-3.5 w-3.5" />, "text-emerald-400")}
        {card("Inativas/baixadas", metrics.inativas, <Building2 className="h-3.5 w-3.5" />)}
        {card("Com pendências", metrics.pendencias, <ShieldAlert className="h-3.5 w-3.5" />, metrics.pendencias ? "text-amber-400" : "")}
        {card("Certificado vencendo", metrics.certVencendo, <CalendarClock className="h-3.5 w-3.5" />, metrics.certVencendo ? "text-orange-400" : "")}
        {card("Patrimônio empresarial", formatBRL(metrics.valorTotal), <TrendingUp className="h-3.5 w-3.5" />)}
      </div>

      {/* Participação por pessoa */}
      {porPessoa.length > 0 && (
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Users className="h-3.5 w-3.5" /> Participação por pessoa</div>
          <div className="flex flex-wrap gap-2">
            {porPessoa.map((p, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{p.nome} · {p.empresas} empresa(s)</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-300">Alertas — {alerts.length}</h2>
          </div>
          <div className="divide-y divide-border">
            {alerts.map((a, i) => (
              <button key={i} type="button" onClick={() => openEdit(a.company)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs hover:bg-accent/30">
                <AlertTriangle className={`h-3 w-3 shrink-0 ${a.level === "error" ? "text-red-400" : "text-amber-400"}`} />
                <span className="font-medium truncate max-w-[280px]">{a.company.nomeFantasia || a.company.razaoSocial}</span>
                <span className="text-muted-foreground">— {a.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Company grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground/60" />
          <p className="text-sm font-medium mt-3">Nenhuma empresa cadastrada</p>
          <p className="text-xs text-muted-foreground mt-1">Cadastre suas participações para montar o mapa societário.</p>
          <Button onClick={openNew} variant="outline" size="sm" className="mt-4 gap-2"><Plus className="h-4 w-4" /> Nova empresa</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {list.map((c) => {
            const d = certDaysLeft(c);
            return (
              <button key={c.id} type="button" onClick={() => openEdit(c)} className="text-left rounded-lg border border-border/60 p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-transparent ${FINALIDADE[c.finalidade]?.color ?? ""}`}>{FINALIDADE[c.finalidade]?.label ?? c.finalidade}</Badge>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-transparent ${STATUS[c.status]?.color ?? ""}`}>{STATUS[c.status]?.label ?? c.status}</Badge>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${RISCO[c.riscoNivel]?.color ?? ""}`}>{RISCO[c.riscoNivel]?.label ?? c.riscoNivel}</Badge>
                </div>
                <p className="text-sm font-semibold truncate">{c.nomeFantasia || c.razaoSocial}</p>
                <p className="text-xs text-muted-foreground truncate">{c.cnpj || "Sem CNPJ"}{c.ramo ? ` · ${c.ramo}` : ""}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c.partners.length} sócio(s)</span>
                  {c.valorEstimado && <span>{formatBRL(Number(c.valorEstimado))}</span>}
                  {d != null && d <= 60 && (
                    <span className={`flex items-center gap-1 ${d < 0 ? "text-red-400" : "text-orange-400"}`}>
                      <CalendarClock className="h-3 w-3" /> {d < 0 ? "Cert. vencido" : `Cert. ${d}d`}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Company dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="dados">
            <TabsList>
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="socios">Sócios{editing ? ` (${editing.partners.length})` : ""}</TabsTrigger>
              <TabsTrigger value="risco">Risco & Planejamento</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Razão social"><Input value={form.razaoSocial} onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })} /></Field>
                <Field label="Nome fantasia"><Input value={form.nomeFantasia} onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })} /></Field>
                <Field label="CNPJ">
                  <div className="flex gap-2">
                    <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
                    <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={doLookup} disabled={lookupCnpj.isPending} title="Consultar na Receita">
                      {lookupCnpj.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </Field>
                <Field label="Ramo de atividade"><Input value={form.ramo} onChange={(e) => setForm({ ...form, ramo: e.target.value })} /></Field>
                <Field label="Inscrição estadual"><Input value={form.inscricaoEstadual} onChange={(e) => setForm({ ...form, inscricaoEstadual: e.target.value })} /></Field>
                <Field label="Inscrição municipal"><Input value={form.inscricaoMunicipal} onChange={(e) => setForm({ ...form, inscricaoMunicipal: e.target.value })} /></Field>
                <Field label="Data de abertura"><Input type="date" value={form.dataAbertura} onChange={(e) => setForm({ ...form, dataAbertura: e.target.value })} /></Field>
                <Field label="Situação cadastral"><Input value={form.situacaoCadastral} onChange={(e) => setForm({ ...form, situacaoCadastral: e.target.value })} /></Field>
                <Field label="Regime tributário"><Input value={form.regimeTributario} onChange={(e) => setForm({ ...form, regimeTributario: e.target.value })} placeholder="Simples, Presumido, Real" /></Field>
                <Field label="CNAE principal"><Input value={form.cnaePrincipal} onChange={(e) => setForm({ ...form, cnaePrincipal: e.target.value })} /></Field>
                <Field label="CNAEs secundários" full><Textarea rows={3} value={form.cnaeSecundarios} onChange={(e) => setForm({ ...form, cnaeSecundarios: e.target.value })} placeholder="Preenchido pela consulta de CNPJ" /></Field>
                <Field label="Endereço" full><Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></Field>
                <Field label="Contador responsável"><Input value={form.contador} onChange={(e) => setForm({ ...form, contador: e.target.value })} /></Field>
                <Field label="Advogado responsável"><Input value={form.advogado} onChange={(e) => setForm({ ...form, advogado: e.target.value })} /></Field>
                <Field label="Banco principal"><Input value={form.bancoPrincipal} onChange={(e) => setForm({ ...form, bancoPrincipal: e.target.value })} /></Field>
                <Field label="Última alteração contratual"><Input type="date" value={form.ultimaAlteracao} onChange={(e) => setForm({ ...form, ultimaAlteracao: e.target.value })} /></Field>
                <Field label="Finalidade">
                  <Select value={form.finalidade} onValueChange={(v) => setForm({ ...form, finalidade: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(FINALIDADE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Status">
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
                <Switch checked={temCertificado} onCheckedChange={setTemCertificado} />
                <span className="text-sm">Possui certificado digital</span>
                {temCertificado && (
                  <div className="ml-auto flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Vencimento</Label>
                    <Input type="date" className="h-8 w-40" value={form.certificadoVencimento} onChange={(e) => setForm({ ...form, certificadoVencimento: e.target.value })} />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="socios" className="space-y-3">
              {editingId == null ? (
                pendingSocios.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-emerald-400">{pendingSocios.length} sócio(s) encontrados na Receita — serão adicionados ao salvar a empresa:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pendingSocios.map((s, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{s.nome}{s.qualificacao ? ` · ${s.qualificacao}` : ""}</Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Você poderá editar percentuais e poderes depois de salvar.</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Salve a empresa primeiro para adicionar sócios — ou consulte o CNPJ para importar o quadro societário automaticamente.</p>
                )
              ) : (
                <>
                  {editing && editing.partners.length > 0 && (
                    <div className="divide-y divide-border rounded-md border border-border/60">
                      {editing.partners.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.nome} {p.percentual ? <span className="text-muted-foreground">· {Number(p.percentual)}%</span> : null}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {TIPO_PART[p.tipoParticipacao] ?? p.tipoParticipacao}{p.funcao ? ` · ${p.funcao}` : ""}{p.cpfCnpj ? ` · ${p.cpfCnpj}` : ""}
                              {[p.isAdministrador && "Admin", p.poderesBancarios && "Banco", p.assinaContratos && "Assina", p.possuiProcuracao && "Procuração"].filter(Boolean).length ? ` · ${[p.isAdministrador && "Admin", p.poderesBancarios && "Banco", p.assinaContratos && "Assina", p.possuiProcuracao && "Procuração"].filter(Boolean).join(", ")}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editPartner(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => removePartnerMut.mutate({ id: p.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-3 rounded-md border border-border/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">{editingPartnerId ? "Editar sócio" : "Adicionar sócio / vínculo"}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Nome"><Input value={partnerForm.nome} onChange={(e) => setPartnerForm({ ...partnerForm, nome: e.target.value })} /></Field>
                      <Field label="CPF/CNPJ"><Input value={partnerForm.cpfCnpj} onChange={(e) => setPartnerForm({ ...partnerForm, cpfCnpj: e.target.value })} /></Field>
                      <Field label="Tipo de participação">
                        <Select value={partnerForm.tipoParticipacao} onValueChange={(v) => setPartnerForm({ ...partnerForm, tipoParticipacao: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(TIPO_PART).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                      <Field label="Função"><Input value={partnerForm.funcao} onChange={(e) => setPartnerForm({ ...partnerForm, funcao: e.target.value })} /></Field>
                      <Field label="Participação (%)"><Input value={partnerForm.percentual} onChange={(e) => setPartnerForm({ ...partnerForm, percentual: e.target.value })} placeholder="Ex: 50" /></Field>
                      <Field label="Capital social (R$)"><Input value={partnerForm.capitalSocial} onChange={(e) => setPartnerForm({ ...partnerForm, capitalSocial: maskMoney(e.target.value) })} /></Field>
                      <Field label="Data de entrada"><Input type="date" value={partnerForm.dataEntrada} onChange={(e) => setPartnerForm({ ...partnerForm, dataEntrada: e.target.value })} /></Field>
                      <Field label="Data de saída"><Input type="date" value={partnerForm.dataSaida} onChange={(e) => setPartnerForm({ ...partnerForm, dataSaida: e.target.value })} /></Field>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {([["isAdministrador", "Administrador"], ["poderesBancarios", "Poderes bancários"], ["assinaContratos", "Assina contratos"], ["possuiProcuracao", "Possui procuração"]] as const).map(([key, lbl]) => (
                        <label key={key} className="flex items-center gap-2 text-xs">
                          <Switch checked={partnerFlags[key]} onCheckedChange={(v) => setPartnerFlags({ ...partnerFlags, [key]: v })} /> {lbl}
                        </label>
                      ))}
                    </div>
                    <Field label="Observações de risco" full><Textarea rows={2} value={partnerForm.observacoesRisco} onChange={(e) => setPartnerForm({ ...partnerForm, observacoesRisco: e.target.value })} /></Field>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={savePartner} disabled={addPartnerMut.isPending || updatePartnerMut.isPending}>
                        {(addPartnerMut.isPending || updatePartnerMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : editingPartnerId ? "Salvar sócio" : "Adicionar sócio"}
                      </Button>
                      {editingPartnerId && <Button size="sm" variant="outline" onClick={resetPartner}>Cancelar edição</Button>}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="risco" className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nível de risco">
                  <Select value={form.riscoNivel} onValueChange={(v) => setForm({ ...form, riscoNivel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(RISCO).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Valor estimado (R$)"><Input value={form.valorEstimado} onChange={(e) => setForm({ ...form, valorEstimado: maskMoney(e.target.value) })} /></Field>
                <Field label="Planejamento societário" full>
                  <Select value={form.planejamento || "none"} onValueChange={(v) => setForm({ ...form, planejamento: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Definir intenção" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não definido</SelectItem>
                      {PLANEJAMENTO.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Mapa de riscos (marque o que se aplica)</Label>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {RISK_FLAGS.map((r) => {
                    const active = riscos.includes(r);
                    return (
                      <button key={r} type="button" onClick={() => setRiscos((prev) => active ? prev.filter((x) => x !== r) : [...prev, r])}
                        className={`text-[11px] rounded-full border px-2 py-1 transition-colors ${active ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-border text-muted-foreground hover:bg-accent/40"}`}>
                        {active ? "✓ " : ""}{r}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Observações" full><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
            {editingId != null ? (
              <Button variant="ghost" size="sm" className="text-red-400 gap-2" onClick={() => { if (confirm("Remover esta empresa e seus sócios?")) deleteMut.mutate({ id: editingId }); }}>
                <Trash2 className="h-4 w-4" /> Remover
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
              <Button onClick={save} disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar empresa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
