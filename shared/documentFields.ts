/**
 * Structured fields captured per document category. These drive the dynamic
 * form in the Cofre Digital and the (best-effort) automatic extraction.
 */
export type DocField = {
  key: string;
  label: string;
  options?: string[];
  /** Multi-select linking to other documents (e.g. "consorcio"). */
  multi?: "consorcio";
  /** Only show this field when all listed conditions match (AND). */
  showWhen?: Array<{ field: string; value: string }>;
};

export const CATEGORY_FIELDS: Record<string, DocField[]> = {
  vehicle: [
    { key: "tipoDocumento", label: "Tipo de documento", options: ["CRLV", "CRV"] },
    { key: "operacao", label: "Operação", options: ["Compra", "Venda"], showWhen: [{ field: "tipoDocumento", value: "CRV" }] },
    { key: "placa", label: "Placa" },
    { key: "renavam", label: "RENAVAM" },
    { key: "chassi", label: "Chassi" },
    { key: "marcaModelo", label: "Marca/Modelo" },
    { key: "anoFabricacao", label: "Ano fabricação" },
    { key: "anoModelo", label: "Ano modelo" },
    { key: "cor", label: "Cor" },
    { key: "combustivel", label: "Combustível", options: ["Gasolina", "Diesel", "Flex", "Elétrico", "Híbrido", "Plug-in", "Combustão"] },
    { key: "hodometro", label: "Hodômetro (km)" },
    { key: "proprietario", label: "Proprietário" },
    { key: "numeroCrv", label: "Número do CRV", showWhen: [{ field: "tipoDocumento", value: "CRV" }] },
    { key: "codigoSegurancaCrv", label: "Código de segurança CRV", showWhen: [{ field: "tipoDocumento", value: "CRV" }] },
    { key: "dataEmissaoCrv", label: "Data de emissão do CRV", showWhen: [{ field: "tipoDocumento", value: "CRV" }] },
    { key: "valorCompra", label: "Valor da compra", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "dataCompra", label: "Data da compra", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "consorciosVinculados", label: "Consórcio(s) utilizado(s) na compra", multi: "consorcio", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "vendedorNome", label: "Vendedor (nome)", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "vendedorTipoPessoa", label: "Vendedor: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"], showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "vendedorCpf", label: "Vendedor: CPF", showWhen: [{ field: "operacao", value: "Compra" }, { field: "vendedorTipoPessoa", value: "Pessoa física" }] },
    { key: "vendedorCnpj", label: "Vendedor: CNPJ", showWhen: [{ field: "operacao", value: "Compra" }, { field: "vendedorTipoPessoa", value: "Pessoa jurídica" }] },
    { key: "valorVenda", label: "Valor da venda", showWhen: [{ field: "operacao", value: "Venda" }] },
    { key: "dataVenda", label: "Data da venda", showWhen: [{ field: "operacao", value: "Venda" }] },
  ],
  property: [
    { key: "cep", label: "CEP" },
    { key: "endereco", label: "Endereço" },
    { key: "matricula", label: "Matrícula" },
    { key: "inscricaoMunicipal", label: "Inscrição municipal" },
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
  cnh: [
    { key: "nome", label: "Nome" },
    { key: "cpf", label: "CPF" },
    { key: "numeroRegistro", label: "Nº de registro" },
    { key: "categoria", label: "Categoria" },
    { key: "validade", label: "Validade" },
    { key: "primeiraHabilitacao", label: "1ª habilitação" },
    { key: "orgaoEmissor", label: "Órgão emissor" },
  ],
  company: [
    { key: "cnpj", label: "CNPJ" },
    { key: "razaoSocial", label: "Razão social" },
    { key: "nomeFantasia", label: "Nome fantasia" },
    { key: "dataAbertura", label: "Data de abertura" },
    { key: "situacao", label: "Situação cadastral" },
    { key: "naturezaJuridica", label: "Natureza jurídica" },
    { key: "cnae", label: "CNAE principal" },
    { key: "porte", label: "Porte" },
    { key: "endereco", label: "Endereço" },
    { key: "inscricaoEstadual", label: "Inscrição estadual" },
  ],
  tax: [
    { key: "cpfCnpj", label: "CPF/CNPJ" },
    { key: "exercicio", label: "Exercício/Ano" },
    { key: "valor", label: "Valor" },
  ],
  ir: [
    { key: "exercicio", label: "Exercício/Ano" },
    { key: "tipo", label: "Tipo (declaração/recibo/informe)" },
    { key: "cpfCnpj", label: "CPF/CNPJ" },
    { key: "valor", label: "Imposto a pagar/restituir" },
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
  consorcio: [
    { key: "administradora", label: "Administradora" },
    { key: "numeroContrato", label: "Número do contrato" },
    { key: "tipo", label: "Tipo", options: ["Imóvel", "Veículo", "Serviços", "Moto", "Outro"] },
    { key: "consorciado", label: "Consorciado (nome)" },
    { key: "tipoPessoa", label: "Tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"] },
    { key: "cpf", label: "CPF", showWhen: [{ field: "tipoPessoa", value: "Pessoa física" }] },
    { key: "cnpj", label: "CNPJ", showWhen: [{ field: "tipoPessoa", value: "Pessoa jurídica" }] },
    { key: "grupo", label: "Grupo" },
    { key: "cota", label: "Cota" },
    { key: "parcelas", label: "Parcelas (total)" },
    { key: "parcelasPagas", label: "Parcelas pagas" },
    { key: "valorParcela", label: "Valor da parcela" },
    { key: "diaVencimento", label: "Dia de vencimento", options: Array.from({ length: 31 }, (_, i) => String(i + 1)) },
    { key: "valorCredito", label: "Valor do crédito" },
    { key: "dataAdesao", label: "Data de adesão" },
    { key: "dataEncerramento", label: "Data de encerramento (estimada)" },
    { key: "situacao", label: "Situação", options: ["Em dia", "Contemplado", "Quitado", "Atrasado", "Cancelado"] },
    { key: "pagador", label: "Quem paga" },
    { key: "lance", label: "Lance" },
  ],
  certificate: [
    { key: "numero", label: "Número" },
    { key: "dataEmissao", label: "Data de emissão" },
  ],
  legal: [
    { key: "numeroProcesso", label: "Número do processo" },
  ],
  finance: [
    { key: "instituicao", label: "Instituição" },
    { key: "tipo", label: "Tipo" },
    { key: "valor", label: "Valor" },
    { key: "data", label: "Data" },
  ],
  studies: [
    { key: "instituicao", label: "Instituição" },
    { key: "curso", label: "Curso" },
    { key: "aluno", label: "Aluno" },
    { key: "conclusao", label: "Conclusão" },
  ],
  other: [],
};

export function fieldsForCategory(category: string): DocField[] {
  return CATEGORY_FIELDS[category] ?? [];
}

/** Human labels for each category (pt-BR), shared by UI and AI prompts. */
export const CATEGORY_LABELS: Record<string, string> = {
  personal: "Pessoal",
  cnh: "CNH (habilitação)",
  property: "Imóvel",
  vehicle: "Veículo",
  company: "Empresa",
  legal: "Jurídico/Processo",
  tax: "Fiscal",
  ir: "Imposto de Renda",
  insurance: "Seguro",
  contract: "Contrato",
  consorcio: "Consórcio",
  certificate: "Certidão",
  finance: "Finanças",
  studies: "Estudos",
  other: "Outro",
};
