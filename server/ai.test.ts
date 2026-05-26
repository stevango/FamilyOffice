import { describe, expect, it } from "vitest";
import { buildSummaryPrompt, parseSummary } from "./ai";

describe("buildSummaryPrompt", () => {
  it("includes the title, category and the income-tax question", () => {
    const p = buildSummaryPrompt("texto do contrato", "Contrato X", "contract");
    expect(p).toContain("Contrato X");
    expect(p).toContain("contract");
    expect(p).toContain("comunicarContador");
    expect(p).toContain("texto do contrato");
  });

  it("truncates very long documents", () => {
    const p = buildSummaryPrompt("a".repeat(20000), "T", "other");
    expect(p).toContain("documento truncado");
  });
});

describe("parseSummary", () => {
  it("parses a clean JSON response", () => {
    const r = parseSummary('{"resumo":"Resumo aqui","pontos":["p1","p2"],"comunicarContador":true,"irJustificativa":"Despesa dedutível"}');
    expect(r.resumo).toBe("Resumo aqui");
    expect(r.pontos).toEqual(["p1", "p2"]);
    expect(r.comunicarContador).toBe(true);
    expect(r.irJustificativa).toBe("Despesa dedutível");
  });

  it("parses JSON wrapped in markdown fences", () => {
    const r = parseSummary('```json\n{"resumo":"X","pontos":[],"comunicarContador":false,"irJustificativa":""}\n```');
    expect(r.resumo).toBe("X");
    expect(r.comunicarContador).toBe(false);
  });

  it("falls back to raw text when there is no JSON", () => {
    const r = parseSummary("apenas um texto livre");
    expect(r.resumo).toBe("apenas um texto livre");
    expect(r.pontos).toEqual([]);
    expect(r.comunicarContador).toBe(false);
  });

  it("ignores non-string points and defaults missing fields", () => {
    const r = parseSummary('{"resumo":"X","pontos":["ok",2,null]}');
    expect(r.pontos).toEqual(["ok"]);
    expect(r.comunicarContador).toBe(false);
  });
});
