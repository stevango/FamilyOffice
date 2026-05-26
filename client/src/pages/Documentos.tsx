import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  FileText,
  Search,
  Trash2,
  Download,
  Upload,
  File,
  Filter,
  Sparkles,
  Loader2,
  User,
  Pencil,
  RefreshCw,
  Bot,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { downloadCsv } from "@/lib/export";
import { fieldsForCategory } from "@shared/documentFields";

const categoryLabels: Record<string, string> = {
  personal: "Pessoal",
  cnh: "CNH",
  property: "Imóvel",
  vehicle: "Veículo",
  company: "Empresa",
  legal: "Jurídico",
  tax: "Fiscal",
  ir: "IR",
  insurance: "Seguro",
  contract: "Contrato",
  consorcio: "Consórcio",
  certificate: "Certidão",
  finance: "Finanças",
  studies: "Estudos",
  other: "Outro",
};

const categoryColors: Record<string, string> = {
  personal: "bg-blue-500/10 text-blue-400",
  cnh: "bg-teal-500/10 text-teal-400",
  property: "bg-emerald-500/10 text-emerald-400",
  vehicle: "bg-amber-500/10 text-amber-400",
  company: "bg-purple-500/10 text-purple-400",
  legal: "bg-red-500/10 text-red-400",
  tax: "bg-orange-500/10 text-orange-400",
  ir: "bg-rose-500/10 text-rose-400",
  insurance: "bg-cyan-500/10 text-cyan-400",
  contract: "bg-indigo-500/10 text-indigo-400",
  consorcio: "bg-sky-500/10 text-sky-400",
  certificate: "bg-pink-500/10 text-pink-400",
  finance: "bg-green-500/10 text-green-400",
  studies: "bg-violet-500/10 text-violet-400",
  other: "bg-gray-500/10 text-gray-400",
};

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("pt-BR");
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseMetadata(doc: { metadata?: string | null; category: string }): { label: string; value: string }[] {
  if (!doc.metadata) return [];
  try {
    const obj = JSON.parse(doc.metadata) as Record<string, string>;
    const fields = fieldsForCategory(doc.category);
    return Object.entries(obj)
      .filter(([, v]) => v)
      .map(([k, v]) => ({ label: fields.find((f) => f.key === k)?.label ?? k, value: String(v) }));
  } catch {
    return [];
  }
}

/** Estimated end date = adesão + N installments (months), as dd/mm/aaaa. */
function computeEncerramento(dataAdesao?: string, parcelas?: string): string | null {
  const m = (dataAdesao ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const n = parseInt((parcelas ?? "").replace(/\D/g, ""), 10);
  if (!m || !n) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1 + n, Number(dd)));
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** For a consórcio doc, a "paid X/Y (NN%)" progress string, when known. */
function consorcioProgress(doc: { category: string; metadata?: string | null }): { label: string; pct: number } | null {
  if (doc.category !== "consorcio" || !doc.metadata) return null;
  try {
    const m = JSON.parse(doc.metadata) as Record<string, string>;
    const total = parseInt(String(m.parcelas ?? "").replace(/\D/g, ""), 10);
    const pagas = parseInt(String(m.parcelasPagas ?? "").replace(/\D/g, ""), 10);
    if (!total || Number.isNaN(pagas)) return null;
    const pct = Math.min(100, Math.round((pagas / total) * 100));
    return { label: `${pagas}/${total} parcelas pagas (${pct}%)`, pct };
  } catch {
    return null;
  }
}

/** Editable per-category fields, shared by the create and edit dialogs. */
function MetaFieldsBlock({
  category, meta, setMeta, analyzing, onLookupCnpj, onLookupCep, lookupPending, onAiFill, aiPending, aiAvailable,
}: {
  category: string;
  meta: Record<string, string>;
  setMeta: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  analyzing?: boolean;
  onLookupCnpj: () => void;
  onLookupCep: () => void;
  lookupPending: boolean;
  onAiFill?: () => void;
  aiPending?: boolean;
  aiAvailable?: boolean;
}) {
  const fields = fieldsForCategory(category);
  if (fields.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {analyzing ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando documento...</>
        ) : (
          <><Sparkles className="h-3.5 w-3.5 text-primary" /> Dados do documento (preenchidos automaticamente quando possível)</>
        )}
      </div>
      {aiAvailable && onAiFill && (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onAiFill} disabled={aiPending}>
          {aiPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
          IA: ler documento e preencher campos
        </Button>
      )}
      {category === "company" && (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onLookupCnpj} disabled={lookupPending}>
          {lookupPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Consultar CNPJ na Receita
        </Button>
      )}
      {category === "property" && (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onLookupCep} disabled={lookupPending}>
          {lookupPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Buscar endereço por CEP
        </Button>
      )}
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            {f.options ? (
              <Select value={meta[f.key] ?? ""} onValueChange={(v) => setMeta((prev) => ({ ...prev, [f.key]: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {[...f.options, ...(meta[f.key] && !f.options.includes(meta[f.key]) ? [meta[f.key]] : [])].map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={meta[f.key] ?? ""}
                onChange={(e) => setMeta((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="h-9"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Documentos() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: members } = trpc.household.members.useQuery();
  const { data: documents, isLoading } = trpc.documents.list.useQuery({
    search: search || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    memberId: memberFilter !== "all" ? Number(memberFilter) : undefined,
  });

  const createMutation = trpc.documents.create.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate();
      utils.dashboard.summary.invalidate();
      setOpen(false);
      toast.success("Documento salvo no cofre");
    },
  });

  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Documento removido");
    },
  });

  const updateMutation = trpc.documents.update.useMutation({
    onSuccess: () => {
      utils.documents.list.invalidate();
      utils.dashboard.summary.invalidate();
      setEditingId(null);
      toast.success("Documento atualizado");
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", category: "other" as string, tags: "", expiresAt: "" });
  const [editMeta, setEditMeta] = useState<Record<string, string>>({});
  const [aiSummary, setAiSummary] = useState<{ resumo: string; pontos: string[]; comunicarContador: boolean; irJustificativa: string } | null>(null);

  const reextractMutation = trpc.documents.reextract.useMutation();
  const summarizeMutation = trpc.documents.summarize.useMutation();

  const handleReextract = async () => {
    if (editingId == null) return;
    try {
      const res = await reextractMutation.mutateAsync({ id: editingId });
      if (Object.keys(res.fields).length > 0) {
        setEditMeta((prev) => ({ ...prev, ...res.fields }));
        toast.success("Arquivo relido — campos atualizados");
      } else {
        toast.message(res.hasText ? "Nenhum campo reconhecido" : "Não consegui ler texto do arquivo");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao reler o arquivo");
    }
  };

  const handleSummarize = async () => {
    if (editingId == null) return;
    try {
      const res = await summarizeMutation.mutateAsync({ id: editingId });
      setAiSummary(res);
    } catch (err: any) {
      toast.error(err?.message ?? "Falha na análise de IA");
    }
  };

  const openEdit = (doc: any) => {
    let saved: typeof aiSummary = null;
    try { if (doc.aiSummary) saved = JSON.parse(doc.aiSummary); } catch { /* ignore */ }
    setAiSummary(saved);
    setEditForm({
      title: doc.title ?? "",
      description: doc.description ?? "",
      category: doc.category ?? "other",
      tags: doc.tags ?? "",
      expiresAt: doc.expiresAt ?? "",
    });
    let meta: Record<string, string> = {};
    try { if (doc.metadata) meta = JSON.parse(doc.metadata); } catch { /* ignore */ }
    setEditMeta(meta);
    setEditingId(doc.id);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId == null) return;
    if (!editForm.title.trim()) {
      toast.error("Preencha o título");
      return;
    }
    const metadata = Object.fromEntries(Object.entries(editMeta).filter(([, v]) => v && v.trim()));
    updateMutation.mutate({
      id: editingId,
      title: editForm.title,
      description: editForm.description || undefined,
      category: editForm.category as any,
      tags: editForm.tags,
      expiresAt: editForm.expiresAt || undefined,
      metadata,
    });
  };

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "other" as string,
    tags: "",
    expiresAt: "",
  });
  const [uploadedFile, setUploadedFile] = useState<{ key: string; url: string; fileName: string; fileSize: number; mimeType: string } | null>(null);
  const [metaForm, setMetaForm] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState(false);

  const analyzeMutation = trpc.documents.analyze.useMutation({ onError: () => {} });
  const aiExtractMutation = trpc.documents.aiExtract.useMutation();
  const { data: aiCfg } = trpc.ai.configured.useQuery();

  // Fill only the still-empty fields, keeping anything already typed/detected.
  const fillEmpty = (
    setMeta: (updater: (prev: Record<string, string>) => Record<string, string>) => void,
    fields: Record<string, string>,
  ) => {
    setMeta((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(fields)) if (!next[k]?.trim()) next[k] = v;
      return next;
    });
  };

  const runAiFill = async (
    args: { id?: number; fileKey?: string; mimeType?: string; category: string; classify?: boolean },
    setMeta: (updater: (prev: Record<string, string>) => Record<string, string>) => void,
    onCategory?: (cat: string) => void,
  ) => {
    try {
      const res = await aiExtractMutation.mutateAsync(args);
      if (onCategory && res.category) onCategory(res.category);
      const filled = Object.keys(res.fields).length;
      fillEmpty(setMeta, res.fields);
      if (args.classify && res.category) {
        toast.success(`IA: categoria "${categoryLabels[res.category] ?? res.category}" e ${filled} campo(s)`);
      } else if (filled > 0) {
        toast.success("Campos preenchidos pela IA");
      } else {
        toast.message("A IA não encontrou novos campos");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Falha na extração por IA");
    }
  };

  const runAnalyze = async (fileKey: string, mimeType: string, category: string) => {
    if (fieldsForCategory(category).length === 0) return;
    setAnalyzing(true);
    try {
      const res = await analyzeMutation.mutateAsync({ fileKey, mimeType, category });
      if (Object.keys(res.fields).length > 0) {
        // Keep any value the user already edited; fill the rest from extraction.
        setMetaForm((prev) => ({ ...res.fields, ...prev }));
        toast.success("Dados extraídos do documento");
      }
    } catch {
      /* extraction is best-effort */
    } finally {
      setAnalyzing(false);
    }
  };

  const lookupCnpjMutation = trpc.documents.lookupCnpj.useMutation();
  const lookupCepMutation = trpc.documents.lookupCep.useMutation();

  const runCepLookup = async (cep: string, apply: (f: Record<string, string>) => void) => {
    const digits = (cep ?? "").replace(/\D/g, "");
    if (digits.length !== 8) {
      toast.error("Informe um CEP com 8 dígitos");
      return;
    }
    try {
      const res = await lookupCepMutation.mutateAsync({ cep: digits });
      if (Object.keys(res.fields).length > 0) {
        apply(res.fields);
        toast.success("Endereço carregado");
      } else {
        toast.error("Nenhum endereço para este CEP");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Falha na consulta de CEP");
    }
  };

  const runCnpjLookup = async (cnpj: string, apply: (f: Record<string, string>) => void) => {
    const digits = (cnpj ?? "").replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("Informe um CNPJ com 14 dígitos");
      return;
    }
    try {
      const res = await lookupCnpjMutation.mutateAsync({ cnpj: digits });
      if (Object.keys(res.fields).length > 0) {
        // Official data overrides locally-read values.
        apply(res.fields);
        toast.success("Dados da Receita carregados");
      } else {
        toast.error("Nenhum dado retornado para este CNPJ");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Falha na consulta de CNPJ");
    }
  };

  const resetForm = () => {
    setForm({ title: "", description: "", category: "other", tags: "", expiresAt: "" });
    setUploadedFile(null);
    setMetaForm({});
  };

  const uploadFile = async (file: File) => {
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 16MB)");
      return;
    }

    setUploading(true);
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
          "X-User-Id": String(user?.id || ""),
        },
        body: file,
      });

      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      setUploadedFile({
        key: data.key,
        url: data.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      setForm({ ...form, title: form.title || file.name.replace(/\.[^/.]+$/, "") });
      toast.success("Arquivo enviado");
      void runAnalyze(data.key, file.type, form.category);
    } catch (err) {
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  const replaceFileMutation = trpc.documents.replaceFile.useMutation({
    onSuccess: () => { utils.documents.list.invalidate(); toast.success("Arquivo reenviado"); },
  });

  const startReplace = (id: number) => {
    setReplacingId(id);
    replaceInputRef.current?.click();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || replacingId == null) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 16MB)");
      return;
    }
    const id = replacingId;
    setReplacingId(null);
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
          "X-User-Id": String(user?.id || ""),
        },
        body: file,
      });
      if (!response.ok) throw new Error("upload failed");
      const data = await response.json();
      await replaceFileMutation.mutateAsync({
        id,
        fileKey: data.key,
        fileUrl: data.url,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
    } catch {
      toast.error("Erro ao reenviar arquivo");
    }
  };

  const handleExport = () => {
    if (!documents || documents.length === 0) {
      toast.error("Nenhum documento para exportar");
      return;
    }
    downloadCsv(`documentos-${new Date().toISOString().slice(0, 10)}`, documents as any[], [
      { key: "title", label: "Título" },
      { key: "category", label: "Categoria", format: (d) => categoryLabels[d.category] ?? d.category },
      { key: "fileName", label: "Arquivo" },
      { key: "tags", label: "Tags" },
      { key: "expiresAt", label: "Vencimento" },
      { key: "createdAt", label: "Adicionado em", format: (d) => formatDate(d.createdAt) },
    ]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !uploadedFile) {
      toast.error("Selecione um arquivo e preencha o título");
      return;
    }
    const metadata = Object.fromEntries(Object.entries(metaForm).filter(([, v]) => v && v.trim()));
    createMutation.mutate({
      title: form.title,
      description: form.description || undefined,
      category: form.category as any,
      fileKey: uploadedFile.key,
      fileUrl: uploadedFile.url,
      fileName: uploadedFile.fileName,
      fileSize: uploadedFile.fileSize,
      mimeType: uploadedFile.mimeType,
      tags: form.tags || undefined,
      expiresAt: form.expiresAt || undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
    resetForm();
  };

  const [viewing, setViewing] = useState<any | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const grouped: Record<string, any[]> = {};
  (documents ?? []).forEach((d: any) => { (grouped[d.category] ??= []).push(d); });
  const orderedCats = Object.keys(categoryLabels).filter((c) => grouped[c]?.length);

  const renderRow = (doc: any) => (
    <div key={doc.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${categoryColors[doc.category] || categoryColors.other}`}>
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{doc.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {!doc.hasFile && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400 gap-1">
                <AlertTriangle className="h-2.5 w-2.5" /> Arquivo ausente — reenviar
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
            {(doc.ownerName || doc.ownerEmail) && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {doc.ownerName || doc.ownerEmail}
                </span>
              </>
            )}
            {doc.tags && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
                {doc.tags.split(",").slice(0, 2).map((tag: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{tag.trim()}</Badge>
                ))}
              </>
            )}
          </div>
          {parseMetadata(doc).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {parseMetadata(doc).map((m, i) => (
                <span key={i} className="text-[10px] text-muted-foreground rounded bg-secondary/60 px-1.5 py-0.5">
                  <span className="text-muted-foreground/70">{m.label}:</span> {m.value}
                </span>
              ))}
            </div>
          )}
          {(() => {
            const p = consorcioProgress(doc);
            if (!p) return null;
            return (
              <div className="mt-1.5 max-w-xs">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                  <span>{p.label}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-secondary/60 overflow-hidden">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${p.pct}%` }} />
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!doc.hasFile && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-400 hover:text-amber-300" onClick={() => startReplace(doc.id)} title="Reenviar arquivo">
            <Upload className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewing(doc)} title="Visualizar">
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(doc)} title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild title="Baixar">
          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
            <Download className="h-3.5 w-3.5" />
          </a>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate({ id: doc.id })} title="Excluir">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  // Auto-fill the consórcio end date from adesão + total installments.
  useEffect(() => {
    if (form.category !== "consorcio") return;
    const enc = computeEncerramento(metaForm.dataAdesao, metaForm.parcelas);
    if (enc && enc !== metaForm.dataEncerramento) setMetaForm((p) => ({ ...p, dataEncerramento: enc }));
  }, [form.category, metaForm.dataAdesao, metaForm.parcelas, metaForm.dataEncerramento]);

  useEffect(() => {
    if (editForm.category !== "consorcio") return;
    const enc = computeEncerramento(editMeta.dataAdesao, editMeta.parcelas);
    if (enc && enc !== editMeta.dataEncerramento) setEditMeta((p) => ({ ...p, dataEncerramento: enc }));
  }, [editForm.category, editMeta.dataAdesao, editMeta.parcelas, editMeta.dataEncerramento]);

  return (
    <div className="space-y-6">
      <input ref={replaceInputRef} type="file" className="hidden" onChange={handleReplaceFile} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cofre Digital</h1>
        <p className="text-muted-foreground text-sm mt-1">Documentos seguros e organizados</p>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar documentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={memberFilter} onValueChange={setMemberFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <User className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Membro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os membros</SelectItem>
            {members?.map((m: any) => (
              <SelectItem key={m.id} value={String(m.id)}>{m.name || m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" /> Exportar
        </Button>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { resetForm(); } }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Novo Documento
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle>Adicionar Documento</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* File Upload Area */}
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={handleDrop}
              >
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Enviando...</p>
                  </div>
                ) : uploadedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <File className="h-8 w-8 text-primary" />
                    <p className="text-sm font-medium">{uploadedFile.fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(uploadedFile.fileSize)}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{isDragging ? "Solte o arquivo aqui" : "Clique para selecionar ou arraste um arquivo"}</p>
                    <p className="text-xs text-muted-foreground">PDF, imagens, documentos (máx. 16MB)</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nome do documento" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => {
                      setForm({ ...form, category: v });
                      if (uploadedFile) void runAnalyze(uploadedFile.key, uploadedFile.mimeType, v);
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoryLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                </div>
              </div>

              <MetaFieldsBlock
                category={form.category}
                meta={metaForm}
                setMeta={setMetaForm}
                analyzing={analyzing}
                onLookupCnpj={() => runCnpjLookup(metaForm.cnpj ?? "", (f) => setMetaForm((p) => ({ ...p, ...f })))}
                onLookupCep={() => runCepLookup(metaForm.cep ?? "", (f) => setMetaForm((p) => ({ ...p, ...f })))}
                lookupPending={lookupCnpjMutation.isPending || lookupCepMutation.isPending}
                aiAvailable={!!aiCfg?.configured && !!uploadedFile}
                aiPending={aiExtractMutation.isPending}
                onAiFill={() => uploadedFile && runAiFill(
                  { fileKey: uploadedFile.key, mimeType: uploadedFile.mimeType, category: form.category, classify: true },
                  setMetaForm,
                  (cat) => setForm((p) => ({ ...p, category: cat })),
                )}
              />

              <div className="space-y-2">
                <Label>Tags (separadas por vírgula)</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Ex: CNH, pessoal, 2024" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending || !uploadedFile}>
                {createMutation.isPending ? "Salvando..." : "Salvar no Cofre"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Documents List */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : documents && documents.length > 0 ? (
        search.trim() ? (
          // Busca ativa: resultados diretos, sem agrupar por categoria.
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <div className="divide-y divide-border">{documents.map(renderRow)}</div>
            </CardContent>
          </Card>
        ) : selectedCategory && grouped[selectedCategory]?.length ? (
          // Dentro de uma categoria.
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus:outline-none"
            >
              <ChevronLeft className="h-4 w-4" /> Voltar às categorias
            </button>
            <div className="flex items-center gap-2">
              <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${categoryColors[selectedCategory] || categoryColors.other}`}>
                <FileText className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-semibold">{categoryLabels[selectedCategory] ?? selectedCategory}</h2>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{grouped[selectedCategory].length}</Badge>
            </div>
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                <div className="divide-y divide-border">{grouped[selectedCategory].map(renderRow)}</div>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Grade de cards por categoria.
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {orderedCats.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent/30 hover:border-primary/40 transition-colors focus:outline-none"
              >
                <span className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${categoryColors[cat] || categoryColors.other}`}>
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{categoryLabels[cat] ?? cat}</p>
                  <p className="text-xs text-muted-foreground">{grouped[cat].length} {grouped[cat].length === 1 ? "documento" : "documentos"}</p>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum documento encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">Adicione seus documentos ao cofre digital</p>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editingId != null} onOpenChange={(v) => { if (!v) setEditingId(null); }}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Documento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} placeholder="Nome do documento" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input type="date" value={editForm.expiresAt} onChange={(e) => setEditForm({ ...editForm, expiresAt: e.target.value })} />
              </div>
            </div>

            <MetaFieldsBlock
              category={editForm.category}
              meta={editMeta}
              setMeta={setEditMeta}
              onLookupCnpj={() => runCnpjLookup(editMeta.cnpj ?? "", (f) => setEditMeta((p) => ({ ...p, ...f })))}
              onLookupCep={() => runCepLookup(editMeta.cep ?? "", (f) => setEditMeta((p) => ({ ...p, ...f })))}
              lookupPending={lookupCnpjMutation.isPending || lookupCepMutation.isPending}
              aiAvailable={!!aiCfg?.configured && editingId != null}
              aiPending={aiExtractMutation.isPending}
              onAiFill={() => editingId != null && runAiFill({ id: editingId, category: editForm.category }, setEditMeta)}
            />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleReextract} disabled={reextractMutation.isPending}>
                {reextractMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Reler arquivo
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleSummarize} disabled={summarizeMutation.isPending}>
                {summarizeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5 text-primary" />}
                Resumo do consultor (IA)
              </Button>
            </div>

            {aiSummary && (
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> Consultor IA
                </div>
                <p className="text-sm text-foreground">{aiSummary.resumo}</p>
                {aiSummary.pontos.length > 0 && (
                  <ul className="list-disc pl-5 space-y-0.5">
                    {aiSummary.pontos.map((p, i) => (
                      <li key={i} className="text-xs text-muted-foreground">{p}</li>
                    ))}
                  </ul>
                )}
                <div className={`flex items-start gap-2 rounded-md p-2 text-xs ${aiSummary.comunicarContador ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                  {aiSummary.comunicarContador ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                  <span>
                    <strong>{aiSummary.comunicarContador ? "Comunicar ao contador (IR)" : "Sem ação para o IR"}</strong>
                    {aiSummary.irJustificativa ? ` — ${aiSummary.irJustificativa}` : ""}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">Gerado por IA — confira antes de decisões fiscais.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} placeholder="Ex: CNH, pessoal, 2024" />
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Document viewer */}
      <Dialog open={viewing != null} onOpenChange={(v) => { if (!v) setViewing(null); }}>
        <DialogContent className="bg-card border-border sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{viewing?.title}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="h-[70vh] w-full overflow-hidden rounded-md border border-border bg-background">
              {viewing.mimeType?.startsWith("image/") ? (
                <img src={viewing.fileUrl} alt={viewing.title} className="h-full w-full object-contain" />
              ) : viewing.mimeType?.includes("pdf") ? (
                <iframe src={viewing.fileUrl} title={viewing.title} className="h-full w-full border-0" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground p-6 text-center">
                  <FileText className="h-10 w-10" />
                  <p className="text-sm">Pré-visualização não disponível para este tipo de arquivo.</p>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={viewing?.fileUrl} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" /> Abrir em nova aba
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
