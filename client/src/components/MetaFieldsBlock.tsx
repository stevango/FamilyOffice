import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Search, Bot } from "lucide-react";
import { fieldsForCategory } from "@shared/documentFields";
import { maskValue, computeEncerramento } from "@/lib/docmask";

/** Editable per-category fields, shared by the create/edit dialogs and the
 *  auditor's quick-fix dialog. Lookup/AI actions are optional. */
export function MetaFieldsBlock({
  category, meta, setMeta, analyzing, onLookupCnpj, onLookupCep, lookupPending, onAiFill, aiPending, aiAvailable, linkOptions,
}: {
  category: string;
  meta: Record<string, string>;
  setMeta: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  analyzing?: boolean;
  onLookupCnpj?: () => void;
  onLookupCep?: () => void;
  lookupPending?: boolean;
  onAiFill?: () => void;
  aiPending?: boolean;
  aiAvailable?: boolean;
  linkOptions?: Record<string, Array<{ id: number; label: string; tipo: string }>>;
}) {
  const [linkSearch, setLinkSearch] = useState("");
  const fields = fieldsForCategory(category).filter(
    (f) => !f.showWhen || f.showWhen.every((c) => {
      const v = meta[c.field];
      if (c.valueNot !== undefined) return Array.isArray(c.valueNot) ? !c.valueNot.includes(v) : v !== c.valueNot;
      return Array.isArray(c.value) ? c.value.includes(v) : v === c.value;
    }),
  );
  if (fieldsForCategory(category).length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
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
      {category === "company" && onLookupCnpj && (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onLookupCnpj} disabled={lookupPending}>
          {lookupPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Consultar CNPJ na Receita
        </Button>
      )}
      {category === "property" && onLookupCep && (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onLookupCep} disabled={lookupPending}>
          {lookupPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Buscar endereço por CEP
        </Button>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {fields.map((f) => (
          <div key={f.key} className={f.multi ? "space-y-1.5 col-span-2" : "space-y-1.5"}>
            <Label className="text-xs text-muted-foreground">{f.label}</Label>
            {f.multi ? (
              (() => {
                const all = (linkOptions?.[f.multi] ?? []).filter((o) => !f.multiTipos || f.multiTipos.includes(o.tipo));
                const opts = linkSearch.trim() ? all.filter((o) => o.label.toLowerCase().includes(linkSearch.trim().toLowerCase())) : all;
                return all.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{f.multi === "vehicle" ? "Nenhum veículo cadastrado." : "Nenhuma carta de consórcio do tipo correspondente cadastrada."}</p>
                ) : (
                <div className="space-y-1.5">
                  <Input value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="Buscar..." className="h-8" />
                  <div className="flex flex-wrap gap-1.5">
                  {opts.map((opt) => {
                    const active = (meta[f.key] ?? "").split(",").filter(Boolean).includes(String(opt.id));
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMeta((prev) => {
                          const cur = (prev[f.key] ?? "").split(",").filter(Boolean);
                          const next = active ? cur.filter((x) => x !== String(opt.id)) : [...cur, String(opt.id)];
                          return { ...prev, [f.key]: next.join(",") };
                        })}
                        className={`text-[11px] rounded-full border px-2 py-1 transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent/40"}`}
                      >
                        {active ? "✓ " : ""}{opt.label}
                      </button>
                    );
                  })}
                  </div>
                </div>
                );
              })()
            ) : f.options ? (
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
                value={maskValue(f.key, meta[f.key] ?? "")}
                onChange={(e) => setMeta((prev) => ({ ...prev, [f.key]: maskValue(f.key, e.target.value) }))}
                className="h-9"
              />
            )}
            {f.key === "dataEncerramento" && (
              <button
                type="button"
                onClick={() => {
                  const enc = computeEncerramento(meta.dataAdesao, meta.parcelas);
                  if (enc) {
                    setMeta((prev) => ({ ...prev, dataEncerramento: enc }));
                    toast.success(`Encerramento estimado: ${enc}`);
                  } else {
                    toast.error("Preencha a Data de adesão (dd/mm/aaaa) e as Parcelas (total)");
                  }
                }}
                className="text-[10px] text-primary hover:underline"
              >
                Recalcular a partir da adesão + parcelas
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
