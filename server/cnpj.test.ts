import { describe, expect, it } from "vitest";
import { formatCnpj, mapCnpjResponse } from "./cnpj";

describe("formatCnpj", () => {
  it("formats 14 digits", () => {
    expect(formatCnpj("19131243000197")).toBe("19.131.243/0001-97");
  });
  it("leaves malformed input untouched", () => {
    expect(formatCnpj("123")).toBe("123");
  });
});

describe("mapCnpjResponse", () => {
  it("maps a BrasilAPI payload to company fields", () => {
    const f = mapCnpjResponse({
      cnpj: "19131243000197",
      razao_social: "OPEN KNOWLEDGE BRASIL",
      nome_fantasia: "REDE PELO CONHECIMENTO LIVRE",
      data_inicio_atividade: "2013-10-03",
      descricao_situacao_cadastral: "ATIVA",
      natureza_juridica: "399-9 - Associação Privada",
      cnae_fiscal: 9430800,
      cnae_fiscal_descricao: "Atividades de associações de defesa de direitos",
      descricao_porte: "DEMAIS",
      logradouro: "RUA TESTE",
      numero: "100",
      bairro: "CENTRO",
      municipio: "SAO PAULO",
      uf: "SP",
      cep: "01310100",
    });
    expect(f.cnpj).toBe("19.131.243/0001-97");
    expect(f.razaoSocial).toBe("OPEN KNOWLEDGE BRASIL");
    expect(f.nomeFantasia).toBe("REDE PELO CONHECIMENTO LIVRE");
    expect(f.dataAbertura).toBe("03/10/2013");
    expect(f.situacao).toBe("ATIVA");
    expect(f.naturezaJuridica).toBe("399-9 - Associação Privada");
    expect(f.cnae).toBe("9430800 - Atividades de associações de defesa de direitos");
    expect(f.porte).toBe("DEMAIS");
    expect(f.endereco).toBe("RUA TESTE, 100 - CENTRO - SAO PAULO/SP - CEP 01310-100");
  });

  it("omits fields that are absent", () => {
    const f = mapCnpjResponse({ cnpj: "19131243000197", razao_social: "X" });
    expect(f.cnpj).toBe("19.131.243/0001-97");
    expect(f.razaoSocial).toBe("X");
    expect(f.nomeFantasia).toBeUndefined();
    expect(f.endereco).toBeUndefined();
  });
});
