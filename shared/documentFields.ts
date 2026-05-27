/**
 * Structured fields captured per document category. These drive the dynamic
 * form in the Cofre Digital and the (best-effort) automatic extraction.
 */
export type DocField = {
  key: string;
  label: string;
  options?: string[];
  /** Multi-select linking to other documents (e.g. "consorcio", "vehicle"). */
  multi?: "consorcio" | "vehicle";
  /** For a "consorcio" multi field, only offer consórcios of these tipos. */
  multiTipos?: string[];
  /** Only show this field when all listed conditions match (AND). */
  showWhen?: Array<{ field: string; value: string }>;
};

// Payment-method chain for a purchase paid without a consórcio (shared by
// vehicle and property). Shown when operação = Compra and usouConsorcio = Não.
const COMPRA = { field: "operacao", value: "Compra" };
const SEM_CONSORCIO = { field: "usouConsorcio", value: "Não" };
const FINANCIAMENTO = [COMPRA, SEM_CONSORCIO, { field: "formaPagamento", value: "Financiamento" }];
const RECURSO = [COMPRA, SEM_CONSORCIO, { field: "formaPagamento", value: "Recurso próprio" }];
const CARTAO = [...RECURSO, { field: "meioPagamento", value: "Cartão" }];

const paymentFields: DocField[] = [
  { key: "formaPagamento", label: "Forma de pagamento", options: ["Financiamento", "Recurso próprio"], showWhen: [COMPRA, SEM_CONSORCIO] },
  // Financiamento
  { key: "financeira", label: "Financeira", showWhen: FINANCIAMENTO },
  { key: "valorEntrada", label: "Valor da entrada", showWhen: FINANCIAMENTO },
  { key: "parcelasFinanciamento", label: "Nº de parcelas", showWhen: FINANCIAMENTO },
  { key: "valorParcelaFinanciamento", label: "Valor da parcela", showWhen: FINANCIAMENTO },
  { key: "taxaJuros", label: "Taxa de juros (% a.m.)", showWhen: FINANCIAMENTO },
  // Recurso próprio
  { key: "meioPagamento", label: "Meio de pagamento", options: ["PIX", "TED", "Boleto", "Cartão"], showWhen: RECURSO },
  { key: "cartaoData", label: "Data da compra no cartão", showWhen: CARTAO },
  { key: "cartaoModalidade", label: "Cartão: à vista ou parcelado", options: ["À vista", "Parcelado"], showWhen: CARTAO },
  { key: "cartaoValor", label: "Valor pago no cartão", showWhen: CARTAO },
  { key: "cartaoParcelas", label: "Cartão: nº de parcelas", showWhen: [...CARTAO, { field: "cartaoModalidade", value: "Parcelado" }] },
  { key: "cartaoValorParcela", label: "Valor da parcela (automático)", showWhen: [...CARTAO, { field: "cartaoModalidade", value: "Parcelado" }] },
  { key: "cartaoBandeira", label: "Cartão: bandeira", options: ["Visa", "Mastercard", "Elo", "Amex", "Hipercard", "Outro"], showWhen: CARTAO },
  { key: "cartaoFinal", label: "Cartão: números finais", showWhen: CARTAO },
  { key: "cartaoTitular", label: "Titular do cartão (nome)", showWhen: CARTAO },
  { key: "cartaoTitularTipoPessoa", label: "Titular: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"], showWhen: CARTAO },
  { key: "cartaoTitularCpf", label: "Titular: CPF", showWhen: [...CARTAO, { field: "cartaoTitularTipoPessoa", value: "Pessoa física" }] },
  { key: "cartaoTitularCnpj", label: "Titular: CNPJ", showWhen: [...CARTAO, { field: "cartaoTitularTipoPessoa", value: "Pessoa jurídica" }] },
];

export const CATEGORY_FIELDS: Record<string, DocField[]> = {
  vehicle: [
    { key: "tipoDocumento", label: "Tipo de documento", options: ["CRLV", "CRV", "Laudo cautelar", "Nota fiscal"] },
    { key: "numeroNf", label: "Número da NF", showWhen: [{ field: "tipoDocumento", value: "Nota fiscal" }] },
    { key: "dataEmissaoNf", label: "Data de emissão da NF", showWhen: [{ field: "tipoDocumento", value: "Nota fiscal" }] },
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
    { key: "proprietarioTipoPessoa", label: "Proprietário: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"] },
    { key: "proprietarioCpf", label: "Proprietário: CPF", showWhen: [{ field: "proprietarioTipoPessoa", value: "Pessoa física" }] },
    { key: "proprietarioCnpj", label: "Proprietário: CNPJ", showWhen: [{ field: "proprietarioTipoPessoa", value: "Pessoa jurídica" }] },
    { key: "numeroAtpv", label: "Número ATPV-e", showWhen: [{ field: "tipoDocumento", value: "CRV" }] },
    { key: "numeroCrv", label: "Número do CRV", showWhen: [{ field: "tipoDocumento", value: "CRV" }] },
    { key: "codigoSegurancaCrv", label: "Código de segurança CRV", showWhen: [{ field: "tipoDocumento", value: "CRV" }] },
    { key: "dataEmissaoCrv", label: "Data de emissão do CRV", showWhen: [{ field: "tipoDocumento", value: "CRV" }] },
    { key: "valorCompra", label: "Valor da compra", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "dataCompra", label: "Data da compra", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "usouConsorcio", label: "Houve uso de cartas de consórcio contempladas?", options: ["Sim", "Não"], showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "consorciosVinculados", label: "Cartas de consórcio utilizadas", multi: "consorcio", multiTipos: ["Veículo", "Moto"], showWhen: [{ field: "operacao", value: "Compra" }, { field: "usouConsorcio", value: "Sim" }] },
    { key: "vendedorNome", label: "Vendedor (nome)", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "vendedorTipoPessoa", label: "Vendedor: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"], showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "vendedorCpf", label: "Vendedor: CPF", showWhen: [{ field: "operacao", value: "Compra" }, { field: "vendedorTipoPessoa", value: "Pessoa física" }] },
    { key: "vendedorCnpj", label: "Vendedor: CNPJ", showWhen: [{ field: "operacao", value: "Compra" }, { field: "vendedorTipoPessoa", value: "Pessoa jurídica" }] },
    { key: "valorVenda", label: "Valor da venda", showWhen: [{ field: "operacao", value: "Venda" }] },
    { key: "dataVenda", label: "Data da venda", showWhen: [{ field: "operacao", value: "Venda" }] },
    { key: "compradorNome", label: "Comprador (nome)", showWhen: [{ field: "operacao", value: "Venda" }] },
    { key: "compradorTipoPessoa", label: "Comprador: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"], showWhen: [{ field: "operacao", value: "Venda" }] },
    { key: "compradorCpf", label: "Comprador: CPF", showWhen: [{ field: "operacao", value: "Venda" }, { field: "compradorTipoPessoa", value: "Pessoa física" }] },
    { key: "compradorCnpj", label: "Comprador: CNPJ", showWhen: [{ field: "operacao", value: "Venda" }, { field: "compradorTipoPessoa", value: "Pessoa jurídica" }] },
    { key: "entradaEmOutroVeiculo", label: "Foi dado de entrada em outro veículo?", options: ["Sim", "Não"], showWhen: [{ field: "operacao", value: "Venda" }] },
    { key: "veiculoNovoPlaca", label: "Novo veículo: placa", showWhen: [{ field: "operacao", value: "Venda" }, { field: "entradaEmOutroVeiculo", value: "Sim" }] },
    { key: "veiculoNovoProprietario", label: "Novo veículo: proprietário", showWhen: [{ field: "operacao", value: "Venda" }, { field: "entradaEmOutroVeiculo", value: "Sim" }] },
    { key: "veiculoNovoTipoPessoa", label: "Novo veículo: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"], showWhen: [{ field: "operacao", value: "Venda" }, { field: "entradaEmOutroVeiculo", value: "Sim" }] },
    { key: "veiculoNovoCpf", label: "Novo veículo: CPF do proprietário", showWhen: [{ field: "operacao", value: "Venda" }, { field: "entradaEmOutroVeiculo", value: "Sim" }, { field: "veiculoNovoTipoPessoa", value: "Pessoa física" }] },
    { key: "veiculoNovoCnpj", label: "Novo veículo: CNPJ do proprietário", showWhen: [{ field: "operacao", value: "Venda" }, { field: "entradaEmOutroVeiculo", value: "Sim" }, { field: "veiculoNovoTipoPessoa", value: "Pessoa jurídica" }] },
    { key: "veiculoNovoVinculo", label: "Vincular a um veículo cadastrado", multi: "vehicle", showWhen: [{ field: "operacao", value: "Venda" }, { field: "entradaEmOutroVeiculo", value: "Sim" }] },
    ...paymentFields,
  ],
  property: [
    { key: "cep", label: "CEP" },
    { key: "endereco", label: "Endereço" },
    { key: "tipoImovel", label: "Tipo de imóvel", options: ["Apartamento", "Casa", "Terreno", "Comercial", "Rural", "Outro"] },
    { key: "matricula", label: "Matrícula" },
    { key: "cartorio", label: "Cartório / Registro de Imóveis" },
    { key: "inscricaoMunicipal", label: "Inscrição municipal (IPTU)" },
    { key: "area", label: "Área (m²)" },
    { key: "proprietario", label: "Proprietário" },
    { key: "proprietarioTipoPessoa", label: "Proprietário: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"] },
    { key: "proprietarioCpf", label: "Proprietário: CPF", showWhen: [{ field: "proprietarioTipoPessoa", value: "Pessoa física" }] },
    { key: "proprietarioCnpj", label: "Proprietário: CNPJ", showWhen: [{ field: "proprietarioTipoPessoa", value: "Pessoa jurídica" }] },
    { key: "operacao", label: "Operação", options: ["Compra", "Venda"] },
    { key: "valorCompra", label: "Valor da compra", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "dataCompra", label: "Data da compra", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "vendedorNome", label: "Vendedor (nome)", showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "vendedorTipoPessoa", label: "Vendedor: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"], showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "vendedorCpf", label: "Vendedor: CPF", showWhen: [{ field: "operacao", value: "Compra" }, { field: "vendedorTipoPessoa", value: "Pessoa física" }] },
    { key: "vendedorCnpj", label: "Vendedor: CNPJ", showWhen: [{ field: "operacao", value: "Compra" }, { field: "vendedorTipoPessoa", value: "Pessoa jurídica" }] },
    { key: "usouConsorcio", label: "Houve uso de cartas de consórcio contempladas?", options: ["Sim", "Não"], showWhen: [{ field: "operacao", value: "Compra" }] },
    { key: "consorciosVinculados", label: "Cartas de consórcio utilizadas", multi: "consorcio", multiTipos: ["Imóvel"], showWhen: [{ field: "operacao", value: "Compra" }, { field: "usouConsorcio", value: "Sim" }] },
    { key: "valorVenda", label: "Valor da venda", showWhen: [{ field: "operacao", value: "Venda" }] },
    { key: "dataVenda", label: "Data da venda", showWhen: [{ field: "operacao", value: "Venda" }] },
    ...paymentFields,
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
    { key: "objeto", label: "Objeto do contrato" },
    { key: "contratanteNome", label: "Contratante (nome)" },
    { key: "contratanteTipoPessoa", label: "Contratante: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"] },
    { key: "contratanteCpf", label: "Contratante: CPF", showWhen: [{ field: "contratanteTipoPessoa", value: "Pessoa física" }] },
    { key: "contratanteCnpj", label: "Contratante: CNPJ", showWhen: [{ field: "contratanteTipoPessoa", value: "Pessoa jurídica" }] },
    { key: "contratadaNome", label: "Contratada (nome)" },
    { key: "contratadaTipoPessoa", label: "Contratada: tipo de pessoa", options: ["Pessoa física", "Pessoa jurídica"] },
    { key: "contratadaCpf", label: "Contratada: CPF", showWhen: [{ field: "contratadaTipoPessoa", value: "Pessoa física" }] },
    { key: "contratadaCnpj", label: "Contratada: CNPJ", showWhen: [{ field: "contratadaTipoPessoa", value: "Pessoa jurídica" }] },
    { key: "valor", label: "Valor" },
    { key: "dataAssinatura", label: "Data da assinatura" },
    { key: "vigencia", label: "Início da vigência" },
    { key: "tempoVigencia", label: "Tempo de vigência" },
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
