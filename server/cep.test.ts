import { describe, expect, it } from "vitest";
import { formatCep, mapCepResponse } from "./cep";

describe("formatCep", () => {
  it("formats 8 digits", () => {
    expect(formatCep("01310100")).toBe("01310-100");
  });
  it("leaves malformed input untouched", () => {
    expect(formatCep("123")).toBe("123");
  });
});

describe("mapCepResponse", () => {
  it("maps a BrasilAPI payload to property fields", () => {
    const f = mapCepResponse({
      cep: "01310100",
      state: "SP",
      city: "São Paulo",
      neighborhood: "Bela Vista",
      street: "Avenida Paulista",
    });
    expect(f.cep).toBe("01310-100");
    expect(f.endereco).toBe("Avenida Paulista, Bela Vista - São Paulo/SP");
  });

  it("handles a payload without street (CEP geral)", () => {
    const f = mapCepResponse({ cep: "01001000", state: "SP", city: "São Paulo" });
    expect(f.cep).toBe("01001-000");
    expect(f.endereco).toBe("São Paulo/SP");
  });
});
