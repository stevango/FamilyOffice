import { useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, Sparkles, User as UserIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Quais documentos vencem nos próximos dias?",
  "O que preciso separar para o Imposto de Renda?",
  "Resuma a situação da família.",
];

export default function Assistente() {
  const { data: cfg, isLoading } = trpc.ai.configured.useQuery();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = trpc.ai.chat.useMutation({
    onSuccess: (res) => setMessages((m) => [...m, { role: "assistant", content: res.reply }]),
    onError: (err) => setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${err.message}` }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, chat.isPending]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || chat.isPending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    chat.mutate({ messages: next });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assistente IA</h1>
        <p className="text-muted-foreground text-sm mt-1">Converse com o consultor do seu family office</p>
      </div>

      {!isLoading && cfg && !cfg.configured && (
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            Configure uma chave de Consultor IA (Claude ou OpenAI) em <strong className="text-foreground">Integrações</strong> para usar o chat.
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardContent className="p-0 flex flex-col h-[65vh]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
                <Bot className="h-10 w-10 text-primary/60" />
                <p className="text-sm">Pergunte algo sobre seus documentos, prazos, finanças ou Imposto de Renda.</p>
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs rounded-full border border-border px-3 py-1.5 hover:bg-accent/50 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-foreground"}`}>
                    {m.content}
                  </div>
                  {m.role === "user" && (
                    <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <UserIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))
            )}
            {chat.isPending && (
              <div className="flex gap-3 justify-start">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-lg px-3 py-2 bg-secondary/60">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="border-t border-border p-3 flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escreva sua pergunta..."
              disabled={chat.isPending || (cfg && !cfg.configured)}
            />
            <Button type="submit" size="icon" className="shrink-0" disabled={chat.isPending || !input.trim() || (cfg && !cfg.configured)}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
