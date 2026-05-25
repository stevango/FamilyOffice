import { useState, useRef } from "react";
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
  insurance: "Seguro",
  contract: "Contrato",
  certificate: "Certidão",
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
  insurance: "bg-cyan-500/10 text-cyan-400",
  contract: "bg-indigo-500/10 text-indigo-400",
  certificate: "bg-pink-500/10 text-pink-400",
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

export default function Documentos() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: documents, isLoading } = trpc.documents.list.useQuery({
    search: search || undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
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

  const resetForm = () => {
    setForm({ title: "", description: "", category: "other", tags: "", expiresAt: "" });
    setUploadedFile(null);
    setMetaForm({});
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

  return (
    <div className="space-y-6">
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
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
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
                    <p className="text-sm text-muted-foreground">Clique para selecionar um arquivo</p>
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

              {fieldsForCategory(form.category).length > 0 && (
                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {analyzing ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando documento...</>
                    ) : (
                      <><Sparkles className="h-3.5 w-3.5 text-primary" /> Dados do documento (preenchidos automaticamente quando possível)</>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {fieldsForCategory(form.category).map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label className="text-xs">{f.label}</Label>
                        <Input
                          value={metaForm[f.key] ?? ""}
                          onChange={(e) => setMetaForm({ ...metaForm, [f.key]: e.target.value })}
                          className="h-9"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${categoryColors[doc.category] || categoryColors.other}`}>
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{formatDate(doc.createdAt)}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">{categoryLabels[doc.category]}</Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                      <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMutation.mutate({ id: doc.id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum documento encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">Adicione seus documentos ao cofre digital</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
