/**
 * Structured fields captured per document category. These drive the dynamic
 * form in the Cofre Digital and the (best-effort) automatic extraction.
 */
export type DocField = { key: string; label: string };

export const CATEGORY_FIELDS: Record<string, DocField[]> = {
  vehicle: [
    { key: "placa", label: "Placa" },
    { key: "renavam", label: "RENAVAM" },
    { key: "chassi", label: "Chassi" },
    { key: "marcaModelo", label: "Marca/Modelo" },
    { key: "ano", label: "Ano" },
    { key: "cor", label: "Cor" },
    { key: "proprietario", label: "Proprietário" },
  ],
  property: [
    { key: "matricula", label: "Matrícula" },
    { key: "inscricaoMunicipal", label: "Inscrição municipal" },
    { key: "endereco", label: "Endereço" },
    { key: "area", label: "Área (m²)" },
    { key: "proprietario", label: "Proprietário" },
  ],
  personal: [
    { key: "cpf", label: "CPF" },
    { key: "rg", label: "RG" },
    { key: "numero", label: "Número do documento" },
    { key: "orgaoEmissor", label: "Órgão emissor" },
    { key: "validade", label: "Validade" },
  ],
  company: [
    { key: "cnpj", label: "CNPJ" },
    { key: "razaoSocial", label: "Razão social" },
    { key: "inscricaoEstadual", label: "Inscrição estadual" },
  ],
  tax: [
    { key: "cpfCnpj", label: "CPF/CNPJ" },
    { key: "exercicio", label: "Exercício/Ano" },
    { key: "valor", label: "Valor" },
  ],
  insurance: [
    { key: "apolice", label: "Apólice" },
    { key: "seguradora", label: "Seguradora" },
    { key: "vigencia", label: "Vigência" },
    { key: "valor", label: "Prêmio/Valor" },
  ],
  contract: [
    { key: "partes", label: "Partes" },
    { key: "valor", label: "Valor" },
    { key: "vigencia", label: "Vigência" },
  ],
  certificate: [
    { key: "numero", label: "Número" },
    { key: "dataEmissao", label: "Data de emissão" },
  ],
  legal: [
    { key: "numeroProcesso", label: "Número do processo" },
  ],
  other: [],
};

export function fieldsForCategory(category: string): DocField[] {
  return CATEGORY_FIELDS[category] ?? [];
}
