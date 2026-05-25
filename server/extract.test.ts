import { describe, expect, it } from "vitest";
import { extractFields } from "./extract";

describe("extractFields", () => {
  it("extracts vehicle fields from CRLV-like text", () => {
    const text = "CRLV PLACA ABC1D23 RENAVAM 12345678901 CHASSI 9BWHE21JX24060831 ANO 2022 FABRICACAO";
    const f = extractFields(text, "vehicle");
    expect(f.placa).toBe("ABC1D23");
    expect(f.renavam).toBe("12345678901");
    expect(f.chassi).toBe("9BWHE21JX24060831");
    expect(f.ano).toBe("2022");
  });

  it("normalizes an old-format plate with a separator", () => {
    expect(extractFields("Placa: ABC-1234", "vehicle").placa).toBe("ABC1234");
  });

  it("extracts CPF and validity for personal documents", () => {
    const f = extractFields("NOME FULANO CPF 123.456.789-09 VALIDADE 10/05/2030", "personal");
    expect(f.cpf).toBe("123.456.789-09");
    expect(f.validade).toBe("10/05/2030");
  });

  it("extracts CNPJ for company documents", () => {
    expect(extractFields("Razao Social X CNPJ 12.345.678/0001-90", "company").cnpj).toBe("12.345.678/0001-90");
  });

  it("extracts exercicio and document number for tax/cnpj", () => {
    const f = extractFields("IPTU EXERCICIO 2025 CNPJ 12.345.678/0001-90", "tax");
    expect(f.exercicio).toBe("2025");
    expect(f.cpfCnpj).toBe("12.345.678/0001-90");
  });

  it("returns nothing useful when there are no patterns", () => {
    expect(extractFields("documento sem dados estruturados", "vehicle")).toEqual({});
  });

  it("ignores categories without a schema", () => {
    expect(extractFields("PLACA ABC1D23", "other")).toEqual({});
  });
});
