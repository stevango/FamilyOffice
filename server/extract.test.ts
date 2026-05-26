import { describe, expect, it } from "vitest";
import { extractFields } from "./extract";

describe("extractFields", () => {
  it("extracts vehicle fields from CRLV-like text", () => {
    const text = "CRLV PLACA ABC1D23 RENAVAM 12345678901 CHASSI 9BWHE21JX24060831 ANO 2022 FABRICACAO";
    const f = extractFields(text, "vehicle");
    expect(f.placa).toBe("ABC1D23");
    expect(f.renavam).toBe("12345678901");
    expect(f.chassi).toBe("9BWHE21JX24060831");
    expect(f.anoFabricacao).toBe("2022");
  });

  it("normalizes an old-format plate with a separator", () => {
    expect(extractFields("Placa: ABC-1234", "vehicle").placa).toBe("ABC1234");
  });

  it("extracts CPF and validity for personal documents", () => {
    const f = extractFields("NOME FULANO CPF 123.456.789-09 VALIDADE 10/05/2030", "personal");
    expect(f.cpf).toBe("123.456.789-09");
    expect(f.validade).toBe("10/05/2030");
  });

  it("extracts CNH fields", () => {
    const text =
      "CARTEIRA NACIONAL DE HABILITACAO REGISTRO 12345678900 CPF 123.456.789-09 CAT. HAB. AB VALIDADE 10/05/2030 1 HABILITACAO 15/03/2008 DETRAN SP";
    const f = extractFields(text, "cnh");
    expect(f.numeroRegistro).toBe("12345678900");
    expect(f.cpf).toBe("123.456.789-09");
    expect(f.categoria).toBe("AB");
    expect(f.validade).toBe("10/05/2030");
    expect(f.primeiraHabilitacao).toBe("15/03/2008");
    expect(f.orgaoEmissor).toBe("DETRAN-SP");
  });

  it("extracts RG and issuing authority for personal documents", () => {
    const f = extractFields("RG 12.345.678-9 SSP/SP CPF 123.456.789-09", "personal");
    expect(f.rg).toBe("12.345.678-9");
    expect(f.orgaoEmissor).toBe("SSP-SP");
  });

  it("extracts company name and state registration", () => {
    const f = extractFields("RAZAO SOCIAL: ACME LTDA CNPJ 12.345.678/0001-90 INSCRICAO ESTADUAL 110.042.490.114", "company");
    expect(f.cnpj).toBe("12.345.678/0001-90");
    expect(f.razaoSocial).toContain("ACME LTDA");
    expect(f.inscricaoEstadual).toBe("110.042.490.114");
  });

  it("extracts monetary amounts for insurance", () => {
    const f = extractFields("APOLICE 9988776655 VIGENCIA 01/01/2026 PREMIO R$ 1.234,56", "insurance");
    expect(f.apolice).toBe("9988776655");
    expect(f.valor).toBe("R$ 1.234,56");
  });

  it("extracts CNPJ for company documents", () => {
    expect(extractFields("Razao Social X CNPJ 12.345.678/0001-90", "company").cnpj).toBe("12.345.678/0001-90");
  });

  it("extracts cartão CNPJ fields from Receita layout", () => {
    const text =
      "COMPROVANTE DE INSCRICAO E DE SITUACAO CADASTRAL NUMERO DE INSCRICAO 19.131.243/0001-97 MATRIZ " +
      "DATA DE ABERTURA 03/10/2013 NOME EMPRESARIAL OPEN KNOWLEDGE BRASIL " +
      "NOME DE FANTASIA REDE PELO CONHECIMENTO LIVRE SITUACAO CADASTRAL ATIVA";
    const f = extractFields(text, "company");
    expect(f.cnpj).toBe("19.131.243/0001-97");
    expect(f.dataAbertura).toBe("03/10/2013");
    expect(f.razaoSocial).toContain("OPEN KNOWLEDGE BRASIL");
    expect(f.nomeFantasia).toContain("REDE PELO CONHECIMENTO LIVRE");
    expect(f.situacao).toBe("ATIVA");
  });

  it("extracts exercicio and document number for tax/cnpj", () => {
    const f = extractFields("IPTU EXERCICIO 2025 CNPJ 12.345.678/0001-90", "tax");
    expect(f.exercicio).toBe("2025");
    expect(f.cpfCnpj).toBe("12.345.678/0001-90");
  });

  it("extracts consórcio fields", () => {
    const f = extractFields("CONSORCIO PORTO SEGURO GRUPO 12345 COTA 678 PRAZO 80 PARCELAS VALOR DA PARCELA R$ 1.234,56", "consorcio");
    expect(f.grupo).toBe("12345");
    expect(f.cota).toBe("678");
    expect(f.parcelas).toBe("80");
    expect(f.valorParcela).toBe("R$ 1.234,56");
  });

  it("returns nothing useful when there are no patterns", () => {
    expect(extractFields("documento sem dados estruturados", "vehicle")).toEqual({});
  });

  it("ignores categories without a schema", () => {
    expect(extractFields("PLACA ABC1D23", "other")).toEqual({});
  });
});
