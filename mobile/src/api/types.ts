/**
 * Tipos compartilhados que espelham os contratos do backend NestJS.
 *
 * Mantidos aqui de forma autônoma (sem importar do backend) para que o app
 * permaneça desacoplado, com nomes em Português alinhados ao domínio.
 */

export type Perfil =
  | 'GERENTE'
  | 'GERENTE_DESENVOLVEDOR'
  | 'SUPERVISOR'
  | 'FISCAL'
  | 'IMPORTADOR';

export interface ResultadoLogin {
  token: string;
  perfil: Perfil;
}

export interface UsuarioAutenticado {
  sub: string;
  login: string;
  nome?: string | null;
  perfil: Perfil;
}

/** Conta de usuário gerenciável no painel de pessoas (login por matrícula). */
export interface UsuarioConta {
  id: string;
  matricula: string;
  nome?: string | null;
  perfil: Perfil;
  criadoEm?: string;
}

// ----- Importações (fluxo ANTIGO, removido) -----
// Os tipos de importação CSV/XLSX (TipoArquivo, StatusDia, RegistroImportacao,
// ResultadoImportacao) foram removidos junto com o serviço `importacoesService`,
// que não era mais usado por nenhuma tela. O fluxo atual de carga de arquivos
// usa `arrecadacaoService`/`vendasService` (arquivos .txt) com os tipos de
// `TipoArrecadacao`/vendas.

// ----- Indicadores / Painel de Vendas (Req 2.x) -----
export type Periodo = 'DIA' | 'SEMANA' | 'MES';
export type StatusCor = 'VERDE' | 'AMARELO' | 'VERMELHO';
export type IndicadorTipo = 'CANCELAMENTO' | 'DEVOLUCOES' | 'TROCO' | 'RECARGAS';
export type TipoRankingOperador = 'CANCELAMENTO' | 'TROCO' | 'RECARGA';

export interface VendaDiaria {
  id: string;
  data: string;
  valor: number;
}

export interface RankingItem {
  pessoaId: string;
  total: number;
}

// ----- Arrecadação por operador (indicadores a partir dos .txt) -----
export type TipoArrecadacao =
  | 'TROCO_SOLIDARIO'
  | 'RECARGAS_CELULAR'
  | 'CANCELAMENTO_ITENS'
  | 'CANCELAMENTO_CUPOM'
  | 'DEVOLUCOES';

export interface ResultadoUploadArrecadacao {
  tipo: TipoArrecadacao;
  data: string;
  quantidade: number;
  total: number;
  /** Verdadeiro se ESTE envio concluiu o fechamento do dia. */
  fechamentoConcluido: boolean;
}

export interface ResumoArrecadacao {
  tipo: TipoArrecadacao;
  titulo: string;
  base: 'FIXA' | 'VENDAS';
  meta: number;
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  totalDia: number;
  totalSemana: number;
  totalMes: number;
  quantidadeDia: number;
  itensDia: number;
  itensSemana: number;
  itensMes: number;
  vendasDia?: number;
  vendasSemana?: number;
  vendasMes?: number;
  percentualDia?: number;
  percentualSemana?: number;
  percentualMes?: number;
}

export interface ItemRankingArrecadacao {
  nome: string;
  total: number;
  quantidade: number | null;
}

/** Agregado dos lançamentos não reconhecidos (sem cadastro) de um indicador. */
export interface ResumoNaoReconhecido {
  total: number;
  lancamentos: number;
}

/** Um código solto (matrícula/login do arquivo) sem cadastro, agregado. */
export interface ItemNaoReconhecido {
  matricula: string;
  nome: string;
  total: number;
  lancamentos: number;
  tipos: TipoArrecadacao[];
}

// ----- Inteligência de indicadores -----

/** Um ponto da série temporal (um dia). */
export interface PontoTendencia {
  data: string;
  total: number;
  percentual?: number;
}

/** Comparação de um período atual vs o anterior. */
export interface Comparativo {
  atual: number;
  anterior: number;
  variacao: number | null;
}

/** Comparativo de mês e semana. */
export interface ComparativoIndicador {
  mes: Comparativo;
  semana: Comparativo;
}

/** Projeção de fechamento de mês. */
export interface ProjecaoMes {
  tipo: TipoArrecadacao;
  base: 'FIXA' | 'VENDAS';
  meta: number;
  acumuladoMes: number;
  diasTranscorridos: number;
  diasDoMes: number;
  projecao: number;
  metaDiaria: number;
  metaAcumuladaHoje: number;
  vaiCumprir: boolean;
}

/** Meta configurável de um indicador. */
export interface MetaIndicador {
  tipo: TipoArrecadacao;
  titulo: string;
  meta: number;
  base: 'FIXA' | 'VENDAS';
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
}

// ----- Metas mensais (Centro de Controle ▸ Metas) -----

/** Indicadores cuja meta é configurável por mês (período mensal). */
export type TipoMeta =
  | 'VENDAS'
  | 'RECARGAS_CELULAR'
  | 'CANCELAMENTO_ITENS'
  | 'CANCELAMENTO_CUPOM'
  | 'DEVOLUCOES';

/** Unidade do valor da meta (R$ ou % sobre vendas). */
export type UnidadeMeta = 'REAIS' | 'PERCENTUAL';

/** Meta mensal de um indicador (valor + metadados de exibição). */
export interface MetaMensal {
  tipo: TipoMeta;
  /** Período mensal "AAAA-MM" (ex.: "2026-06"). */
  anoMes: string;
  titulo: string;
  unidade: UnidadeMeta;
  sentido: 'MAIOR_MELHOR' | 'MENOR_MELHOR';
  meta: number;
  /** Verdadeiro se há um valor salvo para o mês (não é apenas o padrão). */
  definida: boolean;
}

/** Um destaque (top operador) de uma categoria. */
export interface DestaqueOperador {
  nome: string;
  total: number;
}

/** Destaques do mês: top operador por categoria. */
export interface DestaquesMes {
  trocoSolidario: DestaqueOperador | null;
  recargas: DestaqueOperador | null;
  cancelamentoItens: DestaqueOperador | null;
  menosCancelou: DestaqueOperador | null;
}

/** Anomalia detectada (operador acima da média). */
export interface AnomaliaIndicador {
  tipo: TipoArrecadacao;
  nome: string;
  total: number;
  media: number;
}

/** Severidade de um alerta do painel de atenção. */
export type Severidade = 'CRITICO' | 'ATENCAO';

/** Tendência de um alerta vs a semana anterior. */
export type TendenciaAlerta = 'PIORANDO' | 'MELHORANDO' | 'ESTAVEL';

/** Um alerta do painel "Precisa de atenção". */
export interface AlertaAtencao {
  categoria: 'META' | 'OPERADOR';
  severidade: Severidade;
  tipo: TipoArrecadacao;
  titulo: string;
  mensagem: string;
  acaoSugerida: string;
  tendencia?: TendenciaAlerta;
  detalheTendencia?: string;
  projecaoTexto?: string;
  operadorNome?: string;
  operadorValor?: number;
  operadorItens?: number;
  ticketMedio?: number;
  autorizadoPor?: string;
}

/** Resposta do painel "Precisa de atenção". */
export interface PainelAtencao {
  criticos: number;
  emAtencao: number;
  tudoCerto: boolean;
  alertas: AlertaAtencao[];
}

/** Estado de um arquivo de arrecadação no dia. */
export type StatusArquivoArrecadacao = 'ENVIADO' | 'SEM_MOVIMENTO' | 'PENDENTE';

/** Status (enviado/sem movimento/pendente) de cada tipo no dia. */
export type StatusArrecadacao = Record<TipoArrecadacao, StatusArquivoArrecadacao>;

// ----- Fechamento inteligente (resumo do dia) -----
export type StatusItemFechamento =
  | 'OK'
  | 'SEM_MOVIMENTO'
  | 'PENDENTE'
  | 'NAO_ENVIADO';

export type CategoriaFechamento = 'ARRECADACAO' | 'VENDAS' | 'CHECKLIST';

export interface ItemFechamento {
  id: string;
  titulo: string;
  categoria: CategoriaFechamento;
  status: StatusItemFechamento;
}

/** Resumo inteligente do fechamento do dia. */
export interface ResumoFechamento {
  dataISO: string;
  completoArquivos: boolean;
  tudoPronto: boolean;
  totalItens: number;
  concluidos: number;
  itens: ItemFechamento[];
  pendentes: string[];
  alertas: string[];
}

// ----- Vendas por hora (Painel de Vendas) -----
export interface ItemVendaHora {
  hora: number;
  valor: number;
}

export interface VendasPorHora {
  total: number;
  horas: ItemVendaHora[];
}

export interface ResumoVendas {
  totalDia: number;
  totalSemana: number;
  totalMes: number;
}

export interface ResultadoUploadVendas {
  data: string;
  horas: number;
  total: number;
  /** Verdadeiro se ESTE envio concluiu o fechamento do dia. */
  fechamentoConcluido: boolean;
}

export interface StatusVendas {
  enviado: boolean;
}

// ----- Painel de Vendas inteligente -----

/** Configuração do Painel de Vendas (meta mensal de faturamento). */
export interface ConfigVendas {
  metaMensal: number;
}

/** Estimativa de venda de um dia (ISO yyyy-mm-dd + valor R$). */
export interface EstimativaDia {
  data: string;
  valor: number;
}

/** Estimativas de venda de um mês (por dia) + total (soma) do mês. */
export interface EstimativasMes {
  anoMes: string;
  dias: EstimativaDia[];
  totalMes: number;
}

/** Comparativo entre o período atual e o equivalente anterior. */
export interface ComparativoVendas {
  atual: number;
  anterior: number;
  /** Variação % (null quando não há base anterior). */
  variacao: number | null;
}

export interface PontoTendenciaVendas {
  data: string;
  valor: number;
}

export interface PontoCurvaHora {
  hora: number;
  /** Média de venda nessa hora num dia com movimento. */
  valor: number;
  /** Participação da hora no total do dia típico [0, 1]. */
  pct: number;
}

export interface PadraoDiaSemana {
  diaSemana: number;
  nome: string;
  /** Média do total diário nesse dia da semana. */
  media: number;
}

/** Painel inteligente consolidado de vendas. */
export interface PainelVendas {
  metaMensal: number;
  /** Faturamento do mês até a data de referência. */
  arrecadadoMes: number;
  diasComVenda: number;
  diasNoMes: number;
  mediaDiaria: number;
  /** Projeção de fechamento do mês (run-rate). */
  projecaoFechamento: number;
  metaProgresso: number;
  /** Projeção vs meta em % (null sem meta). */
  projecaoVsMeta: number | null;
  /**
   * Estimativa de venda definida para o dia de referência (Central de Vendas).
   * `null` quando não há estimativa cadastrada para o dia.
   */
  estimativaDia: number | null;
  comparativos: {
    dia: ComparativoVendas;
    semana: ComparativoVendas;
    mes: ComparativoVendas;
  };
  tendencia: PontoTendenciaVendas[];
  curvaHoraria: PontoCurvaHora[];
  horaPico: number | null;
  /** Matriz 7x24 (dia da semana x hora) com a média de venda. */
  heatmap: number[][];
  padraoDiaSemana: PadraoDiaSemana[];
}

export interface DetalheArrecadacao {
  nome: string;
  autorizadoPor: string | null;
  motivo: string | null;
  valor: number;
  /** Quantidade (itens/cupons) do lançamento, quando o arquivo informa. */
  quantidade: number | null;
  data: string;
}

// ----- Lote APAE (Req 2.6) -----
export type StatusLote = 'ABERTO' | 'ENCERRADO';

export interface LoteApae {
  id: string;
  quantidadeInicial: number;
  saldoAtual: number;
  quantidadeVendida: number;
  dataInicio: string;
  dataEncerramento: string | null;
  status: StatusLote;
}

/** Configuração das Sacolas APAE (preço unitário e meta mensal em R$). */
export interface ConfigApae {
  precoSacola: number;
  metaMensal: number;
}

/** Um ponto da tendência diária de vendas de sacolas (últimos 30 dias). */
export interface PontoTendenciaApae {
  data: string;
  vendidas: number;
  valor: number;
}

/** Painel inteligente consolidado das Sacolas APAE. */
export interface PainelApae {
  precoSacola: number;
  metaMensal: number;
  /** Arrecadado no mês atual (R$). */
  arrecadadoMes: number;
  /** Arrecadado no mês anterior (R$). */
  arrecadadoMesAnterior: number;
  /** Variação % vs mês anterior (`null` se não houver base de comparação). */
  variacaoMes: number | null;
  /** Total histórico arrecadado em todos os lotes (R$). */
  totalHistorico: number;
  /** Sacolas vendidas no mês atual (unidades). */
  sacolasVendidasMes: number;
  /** Velocidade média de venda (sacolas/dia, janela de 14 dias). */
  velocidadeDia: number;
  /** Previsão de dias até o fim do lote ativo (`null` se sem dados). */
  previsaoDiasFimLote: number | null;
  /** Saldo do lote ativo (`null` se não houver lote aberto). */
  saldoLoteAtivo: number | null;
  /** Progresso da meta mensal em [0, 1]. */
  metaProgresso: number;
  /** Série diária dos últimos 30 dias. */
  tendencia: PontoTendenciaApae[];
}

// ----- Insumos (Req 3.x) -----
export type CategoriaInsumo = 'SACOLA' | 'BOBINA' | 'PANO' | 'ALCOOL' | 'OUTRO';

export interface Insumo {
  id: string;
  nome: string;
  categoria: CategoriaInsumo;
  saldo: number;
  limiteMinimo: number;
  /** Unidade base de contagem (ex.: sacola, bobina, metro, litro). */
  unidade: string;
  /** Embalagem de entrada (ex.: fardo, caixa, rolo, galão). */
  embalagem: string;
  /** Quantas unidades base há em uma embalagem (ex.: 1000, 20, 100, 5). */
  fatorEmbalagem: number;
  ativo: boolean;
}

/** Insumo com o resumo de estoque do painel (tudo em quantidade, não R$). */
export interface InsumoResumo extends Insumo {
  estoqueBaixo: boolean;
  consumoSemana: number;
  entradaSemana: number;
  semanasRestantes: number | null;
}

/** Nível de urgência do estoque. */
export type NivelEstoque = 'CRITICO' | 'ATENCAO' | 'OK';

/** Insumo com resumo proativo (predicción, nível, sugestão de reposição). */
export interface InsumoProativo extends Insumo {
  estoqueBaixo: boolean;
  consumoSemana: number;
  entradaSemana: number;
  semanasRestantes: number | null;
  diasAteRuptura: number | null;
  nivel: NivelEstoque;
  sugestaoReposicao: number;
}

export interface MovimentoEstoque {
  id: string;
  insumoId: string;
  delta: number;
  responsavelId: string | null;
  dataHora: string;
  destino: string | null;
  pdvId: string | null;
  origem?: string | null;
  /** Quem registrou a saída (ou aprovou a entrada de requisição). */
  responsavelNome?: string | null;
  /** Quem requisitou (só em entradas vindas de requisição). */
  requisitanteNome?: string | null;
}

/** Um ponto do gráfico de utilização do insumo vs. vendas (por dia). */
export interface PontoAnaliseDia {
  /** Dia (ISO yyyy-mm-dd). */
  data: string;
  /** Consumo do dia em unidade base. */
  consumo: number;
  /** Venda do dia (R$). */
  venda: number;
}

/** Análise de um insumo: consumo por dia vs. vendas + resumos semana/mês. */
export interface AnaliseInsumo {
  consumoSemana: number;
  consumoMes: number;
  porDia: PontoAnaliseDia[];
}

/** Uma entrada de estoque (movimento com delta > 0) — Controle de requisição. */
export interface EntradaInsumo {
  id: string;
  insumoId: string;
  insumoNome: string;
  unidade: string;
  embalagem: string;
  fatorEmbalagem: number;
  quantidade: number;
  origem: string | null;
  dataHora: string;
}

// ----- Requisições de insumos -----
export type StatusRequisicao = 'PENDENTE' | 'APROVADA' | 'NEGADA';

// ----- Pedidos Recorrentes -----
export type StatusSugestao = 'PENDENTE' | 'CONFIRMADA' | 'IGNORADA';

export interface SugestaoPedido {
  id: string;
  insumoId: string;
  insumoNome: string;
  embalagem: string;
  fatorEmbalagem: number;
  unidade: string;
  quantidade: number;
  quantidadeAjustada: number | null;
  lote: string | null;
  criadaEm: string;
}

export interface PedidoRecorrente {
  id: string;
  insumoId: string;
  quantidade: number;
  frequenciaDias: number;
  diaSugestao: number;
  ativo: boolean;
  insumo: { nome: string; embalagem: string };
}

export interface Requisicao {
  id: string;
  insumoId: string;
  insumoNome: string;
  unidade: string;
  embalagem: string;
  fatorEmbalagem: number;
  quantidade: number;
  status: StatusRequisicao;
  observacao: string | null;
  solicitanteNome: string | null;
  criadaEm: string;
  decididaPorNome: string | null;
  decididaEm: string | null;
  motivo: string | null;
}

// ----- Fiscais / Escala (Req 4.x) -----
export type StatusFiscal = 'DISPONIVEL' | 'INTERVALO' | 'FORA_EXPEDIENTE';

/** Tempos da jornada do dia (em milissegundos). */
export interface JornadaTempos {
  tempoTrabalhandoMs: number;
  tempoIntervaloMs: number;
  cargaHorariaMs: number;
}

/** Item do painel em tempo real: um fiscal e seu status atual. */
export interface ItemPainelFiscal {
  fiscalId: string;
  /** Ficha única correspondente (para abrir o perfil), ou null. */
  colaboradorId: string | null;
  primeiroNome: string;
  status: StatusFiscal;
  desde: string | null;
}

/** Resumo do próprio fiscal (status atual + jornada do dia). */
export interface MeuResumoFiscal extends JornadaTempos {
  fiscalId: string;
  primeiroNome: string;
  status: StatusFiscal;
  em: string;
  faltaHoje: boolean;
  folgaHoje: boolean;
}

/** Item do log de jornada do dia (tempos por pessoa: fiscal ou colaborador). */
export interface ItemJornadaFiscal extends JornadaTempos {
  /** Id da pessoa: Fiscal.id (fiscais) ou Colaborador.id (demais). */
  fiscalId: string;
  /** Igual ao fiscalId; nome explícito para chave/lookup independente do tipo. */
  pessoaId: string;
  tipoPessoa: 'FISCAL' | 'OPERADOR';
  /** Função (FISCAL/OPERADOR/SUPERVISOR) para exibir o papel. */
  funcao: string;
  colaboradorId: string | null;
  primeiroNome: string;
  status: StatusFiscal;
}

/** Acumulado de horas extras do mês por pessoa (fiscal ou colaborador). */
export interface ItemHorasExtrasFiscal {
  fiscalId: string;
  pessoaId: string;
  tipoPessoa: 'FISCAL' | 'OPERADOR';
  primeiroNome: string;
  /** Total de horas extras do mês (50% + 100%), em ms. */
  horasExtrasMs: number;
  /** Extras com adicional de 50% (segunda a sábado), em ms. */
  horasExtras50Ms: number;
  /** Extras com adicional de 100% (domingos), em ms. */
  horasExtras100Ms: number;
}

/** Fiscal de folga hoje. */
export interface ItemFolgaFiscal {
  fiscalId: string;
  primeiroNome: string;
}

/** Histórico semanal do fiscal (últimos 7 dias). */
export interface HistoricoSemanalFiscal {
  fiscalId: string;
  primeiroNome: string;
  dias: {
    data: string;
    diaSemana: number;
    trabalhadoMs: number;
    esperadoMs: number;
  }[];
}

/** Item do ranking mensal (puntualidade). */
export interface ItemRankingFiscal {
  fiscalId: string;
  primeiroNome: string;
  diasContados: number;
  desvioMedioMin: number;
  pontuacao: number;
}

/** Item da previsão de horas extras do mês. */
export interface ItemPrevisaoExtras {
  fiscalId: string;
  primeiroNome: string;
  extrasAtualMs: number;
  projecaoMesMs: number;
  critico: boolean;
}

export interface EscalaEntry {
  funcionarioId: string;
  diaSemana: number;
  entrada: string | null;
  saida: string | null;
  intervaloMin: number;
  folga: boolean;
  especial: boolean;
}

/** Escala efetiva resolvida: a entrada aplicável ou 'FOLGA'. */
export type EscalaEfetiva = EscalaEntry | 'FOLGA';

/** Item da escala consolidada por funcionário (ver escala.domain do backend). */
export interface ItemEscalaConsolidada {
  funcionarioId: string;
  /** Nome resolvido do funcionário (fallback para o id). */
  nome?: string;
  /** Ficha única correspondente (para abrir o perfil), ou null. */
  colaboradorId?: string | null;
  /** Matrícula da ficha, quando resolvida. */
  matricula?: string | null;
  efetiva: EscalaEfetiva;
}

/** Evento recebido pelo WebSocket do painel de fiscais (tempo real). */
export interface EventoStatusFiscal {
  fiscalId: string;
  primeiroNome: string;
  status: StatusFiscal;
  em: string;
}

// ----- Incidências de Escala (Fase 1/2 — "não retornou do intervalo") -----

/** Tipos de incidência de escala (espelho do enum Prisma do backend). */
export type TipoIncidenciaEscala =
  | 'NAO_RETORNO_INTERVALO'
  | 'ATRASO'
  | 'SAIDA_ANTECIPADA'
  | 'RETORNO_TARDIO'
  | 'ADVERTENCIA'
  | 'SUSPENSAO';

/** Onde uma incidência é registrada (ESCALA, PERFIL ou legado = null). */
export type LocalRegistroIncidencia = 'ESCALA' | 'PERFIL' | null;

/** Metadados de um tipo de incidência (espelho de META_TIPO_INCIDENCIA). */
export interface MetaTipoIncidencia {
  rotulo: string;
  /** Faz uso dos horários (saída/esperado/real). Ex.: advertência/suspensão não. */
  usaHorarios: boolean;
  /** Só o não-retorno é auto-detectável do ponto; os demais são manuais. */
  autoDetectavel: boolean;
  /** Onde o tipo é registrado (ou null se legado/não registrável). */
  registro: LocalRegistroIncidencia;
}

/** Rótulos + regras por tipo, na ordem de exibição (espelho do backend). */
export const META_TIPO_INCIDENCIA: Record<
  TipoIncidenciaEscala,
  MetaTipoIncidencia
> = {
  NAO_RETORNO_INTERVALO: {
    rotulo: 'Não retorno do intervalo',
    usaHorarios: false,
    autoDetectavel: true,
    registro: 'ESCALA',
  },
  ATRASO: {
    rotulo: 'Atraso',
    usaHorarios: true,
    autoDetectavel: false,
    registro: null,
  },
  SAIDA_ANTECIPADA: {
    rotulo: 'Saída antecipada',
    usaHorarios: true,
    autoDetectavel: false,
    registro: null,
  },
  RETORNO_TARDIO: {
    rotulo: 'Retorno tardio',
    usaHorarios: true,
    autoDetectavel: false,
    registro: null,
  },
  ADVERTENCIA: {
    rotulo: 'Advertência',
    usaHorarios: false,
    autoDetectavel: false,
    registro: 'PERFIL',
  },
  SUSPENSAO: {
    rotulo: 'Suspensão',
    usaHorarios: false,
    autoDetectavel: false,
    registro: 'PERFIL',
  },
};

/** Todos os tipos de incidência conhecidos (ordem de exibição). */
export const TIPOS_INCIDENCIA: TipoIncidenciaEscala[] = [
  'NAO_RETORNO_INTERVALO',
  'ATRASO',
  'SAIDA_ANTECIPADA',
  'RETORNO_TARDIO',
  'ADVERTENCIA',
  'SUSPENSAO',
];

/** Tipos lançados no perfil do colaborador (advertência, suspensão). */
export const TIPOS_PERFIL: TipoIncidenciaEscala[] = TIPOS_INCIDENCIA.filter(
  (t) => META_TIPO_INCIDENCIA[t].registro === 'PERFIL',
);

/** Origem do registro: manual (gestor) ou auto-detectado do ponto. */
export type OrigemIncidencia = 'MANUAL' | 'DETECTADO_PONTO';

/** Estado de justificativa (abono) de uma ocorrência (falta ou não-retorno). */
export type StatusJustificativa = 'PENDENTE' | 'JUSTIFICADA' | 'INJUSTIFICADA';

/** Motivo da justificativa (define o peso no score: atestado 2%, outros 10%). */
export type MotivoJustificativa =
  | 'ATESTADO_MEDICO'
  | 'ABONADA'
  | 'LICENCA'
  | 'ATRASO_JUSTIFICADO'
  | 'OUTRO';

/** Campos de justificativa comuns às ocorrências (falta e não-retorno). */
export interface DadosJustificativa {
  statusJustificativa: StatusJustificativa;
  motivoJustificativa?: MotivoJustificativa | null;
  observacaoJustificativa?: string | null;
  justificadaPorNome?: string | null;
  justificadaEm?: string | null;
}

/** Falta enriquecida com nome + justificativa (painel de justificativas). */
export interface AusenciaDetalhada extends DadosJustificativa {
  id: string;
  pessoaId: string;
  nome: string;
  matricula: string | null;
  data: string;
  registradaPorNome: string | null;
}

/**
 * Uma incidência de escala registrada (espelha `IncidenciaEscala` do Prisma).
 */
export interface IncidenciaEscala {
  id: string;
  colaboradorId: string;
  funcionarioId?: string | null;
  tipo: TipoIncidenciaEscala;
  data: string;
  horaSaida?: string | null;
  horaEsperadaRetorno?: string | null;
  horaReal?: string | null;
  origem: OrigemIncidencia;
  motivo?: string | null;
  observacao?: string | null;
  registradoPorNome?: string | null;
  /** Sanções: duração da suspensão (dias) e data final inclusiva. */
  diasSuspensao?: number | null;
  dataFim?: string | null;
  /** Vínculo opcional com a ocorrência que motivou a sanção (informativo). */
  causaTipo?: string | null;
  causaData?: string | null;
  /** Justificativa (abono) do não-retorno — mesmo modelo das faltas. */
  statusJustificativa?: StatusJustificativa;
  motivoJustificativa?: MotivoJustificativa | null;
  observacaoJustificativa?: string | null;
  justificadaPorNome?: string | null;
  justificadaEm?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Candidato auto-detectado a partir do ponto dos fiscais (sugestão para
 * registrar uma incidência de "não retorno do intervalo").
 */
export interface SugestaoIncidencia {
  colaboradorId: string;
  funcionarioId?: string;
  nome: string;
  tipo?: TipoIncidenciaEscala;
  horaSaida?: string;
  horaEsperadaRetorno?: string;
  origem: 'DETECTADO_PONTO';
}

/** Uma linha do ranking de incidências por colaborador. */
export interface RankingIncidencia {
  colaboradorId: string;
  nome: string;
  total: number;
}

/** Dados para registrar uma incidência (espelha o CriarIncidenciaDto). */
export interface RegistrarIncidenciaInput {
  colaboradorId: string;
  tipo: TipoIncidenciaEscala;
  /** Data ISO (yyyy-mm-dd). */
  data: string;
  horaSaida?: string;
  horaEsperadaRetorno?: string;
  horaReal?: string;
  motivo?: string;
  observacao?: string;
  /** Duração da suspensão em dias (só para SUSPENSAO; mínimo 1). */
  diasSuspensao?: number;
  /** Vínculo opcional com a ocorrência que motivou a sanção. */
  causaTipo?: string;
  causaData?: string;
}

/** Tipos lançados como sanção (advertência/suspensão). */
export const TIPOS_SANCAO: TipoIncidenciaEscala[] = ['ADVERTENCIA', 'SUSPENSAO'];

/** Próximo passo sugerido pela disciplina progressiva. */
export type ProximoPassoDisciplinar =
  | 'ADVERTENCIA'
  | 'SUSPENSAO'
  | 'AVALIAR_DESLIGAMENTO';

/** Linha do panorama de sanções por colaborador. */
export interface ItemSancaoColaborador {
  colaboradorId: string;
  nome: string;
  advertencias: number;
  suspensoes: number;
  ultima: { tipo: TipoIncidenciaEscala; data: string } | null;
  proximoPasso: ProximoPassoDisciplinar;
  risco: 'BAIXO' | 'MEDIO' | 'ALTO';
}

/** Colaborador suspenso hoje (com dias restantes, inclusivo). */
export interface ItemSuspensoAgora {
  colaboradorId: string;
  nome: string;
  inicio: string;
  fim: string;
  diasRestantes: number;
}

/** Solicitação automática de advertência por falta não justificada. */
export interface SolicitacaoAdvertencia {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  ausenciaId: string;
  dataFalta: string;
  motivo: string;
  status: 'PENDENTE' | 'APROVADA' | 'CANCELADA';
  criadaEm: string;
}

/** Panorama de sanções do período (espelha ResumoSancoes do backend). */
export interface PanoramaSancoes {
  totalAdvertencias: number;
  totalSuspensoes: number;
  tendenciaAdvertencias: number;
  tendenciaSuspensoes: number;
  suspensosAgora: ItemSuspensoAgora[];
  porColaborador: ItemSancaoColaborador[];
}

/** Campos editáveis de uma incidência (espelha o EditarIncidenciaDto). */
export interface EditarIncidenciaInput {
  horaSaida?: string;
  horaEsperadaRetorno?: string;
  horaReal?: string;
  motivo?: string;
  observacao?: string;
}

/** Filtros de listagem de incidências. */
export interface FiltroIncidencias {
  colaboradorId?: string;
  tipo?: TipoIncidenciaEscala;
  inicio?: string;
  fim?: string;
}

/**
 * Um item da linha do tempo unificada (faltas + incidências). Espelha o
 * formato do backend: `{ data (ISO yyyy-mm-dd), kind }`.
 */
export interface TimelineItem {
  data: string;
  kind: 'FALTA' | TipoIncidenciaEscala;
  /** Só para faltas: `true` quando foi justificada (abonada). */
  justificada?: boolean;
}

// ----- Checklist (Req 5.x) -----
export type TipoChecklist = 'ABERTURA' | 'FECHAMENTO';
export type StatusChecklist = 'PENDENTE' | 'FEITO';

export interface Checklist {
  id: string;
  tipo: TipoChecklist;
  data: string;
  status: StatusChecklist;
  imagemUrl: string | null;
  enviadoPor: string | null;
  enviadoEm: string | null;
}

export interface JanelaExecucao {
  inicio: string;
  fim: string;
}

/** Status visual (derivado) do checklist para a UI. */
export type StatusVisualChecklist =
  | 'FEITO_NO_PRAZO'
  | 'ATRASADO'
  | 'PENDENTE'
  | 'NAO_FEITO';

/** Estado rico de um checklist (auditoria/pontualidade). */
export interface ChecklistEstado {
  tipo: TipoChecklist;
  status: StatusChecklist;
  statusVisual: StatusVisualChecklist;
  janela: { inicio: string; fim: string };
  enviadoPor: string | null;
  enviadoEm: string | null;
  imagemUrl: string | null;
  noPrazo: boolean | null;
  duplicado: boolean;
}

export interface EstadoChecklists {
  dataISO: string;
  abertura: ChecklistEstado;
  fechamento: ChecklistEstado;
}

export interface ChecklistMetricas {
  mes: string;
  diasOperacao: number;
  totalEsperado: number;
  feitos: number;
  noPrazo: number;
  percentualNoPrazo: number;
  rachaDias: number;
}

export interface ChecklistHistoricoTipo {
  statusVisual: StatusVisualChecklist;
  imagemUrl: string | null;
  enviadoPor: string | null;
  enviadoEm: string | null;
}

export interface ChecklistHistoricoDia {
  dataISO: string;
  diaSemana: number;
  abertura: ChecklistHistoricoTipo | null;
  fechamento: ChecklistHistoricoTipo | null;
}

// ----- Operadores / Ausências (Req 6.x) -----
export interface Operador {
  id: string;
  nome: string;
}

export interface Ausencia {
  id: string;
  pessoaId: string;
  data: string;
}

export interface ItemRelatorioAusencia {
  pessoaId: string;
  quantidade: number;
}

export interface ContagemTurno {
  abertura: number;
  intermediario: number;
  fechamento: number;
  total: number;
}

export interface OperadorEscalaDia {
  operadorId: string;
  entrada?: string | null;
  folga?: boolean;
  ferias?: boolean;
  desligado?: boolean;
}

// ----- Quadro de Operadores (escala fixa visual) -----

/** Turno fixo de um operador. */
export interface OperadorTurno {
  id: string;
  nome: string;
  entradaSemana: string;
  saidaSemana: string;
  entradaFds: string;
  saidaFds: string;
  /** 0=Dom..6=Sáb. */
  folgaDiaSemana: number;
  ativo: boolean;
}

export type StatusCelula = 'TRABALHA' | 'FOLGA' | 'FALTA';

export interface GradeCelula {
  diaSemana: number;
  data: string;
  status: StatusCelula;
  entrada: string | null;
  saida: string | null;
  ausenciaId: string | null;
}

export interface GradeOperador {
  id: string;
  nome: string;
  folgaDiaSemana: number;
  celulas: GradeCelula[];
}

export interface GradeCobertura {
  diaSemana: number;
  data: string;
  trabalhando: number;
  folgas: number;
  faltas: number;
}

/** Grade semanal (Seg–Sáb) do Quadro de Operadores. */
export interface GradeOperadores {
  inicio: string;
  hojeISO: string;
  dias: { diaSemana: number; data: string }[];
  operadores: GradeOperador[];
  cobertura: GradeCobertura[];
}

export interface OperadorAgora {
  nome: string;
  entrada: string;
  saida: string;
}

/** Tablero "ao vivo": quem deveria estar no caixa agora. */
export interface AoVivoOperadores {
  horaLocal: string;
  dataISO: string;
  diaSemana: number;
  disponiveis: number;
  faltas: number;
  /** Quantos saíram para o intervalo e não retornaram (fora do caixa). */
  semRetorno: number;
  esperados: number;
  listaDisponiveis: OperadorAgora[];
  listaFaltantes: OperadorAgora[];
  listaSemRetorno: OperadorAgora[];
}

export type RiscoFalta = 'BAIXO' | 'MEDIO' | 'ALTO';

export interface FaltasPorOperador {
  id: string;
  nome: string;
  quantidade: number;
  diasEscalados: number;
  /** % de absenteísmo = faltas / dias escalados. */
  taxa: number;
  /** Faltas coladas à folga (véspera/dia seguinte). */
  faltasEmenda: number;
  /** Maior sequência de faltas em dias consecutivos. */
  sequenciaMax: number;
  diaRecorrente: { diaSemana: number; nome: string; quantidade: number } | null;
  /** Variação vs. período anterior (delta de faltas). */
  tendencia: number;
  risco: RiscoFalta;
}

export interface FaltasPorDiaSemana {
  diaSemana: number;
  nome: string;
  quantidade: number;
}

/** Analítica inteligente de faltas num período. */
export interface AnaliticaFaltas {
  total: number;
  totalAnterior: number;
  /** Variação % vs. período anterior; null se não havia base. */
  tendenciaPct: number | null;
  /** % global de absenteísmo. */
  taxaGlobal: number;
  porOperador: FaltasPorOperador[];
  porDiaSemana: FaltasPorDiaSemana[];
}

/** Um colaborador no roster de um dia. */
export interface ColaboradorDia {
  id: string;
  nome: string;
  genero: string | null;
  status: StatusCelula;
  entrada: string | null;
  saida: string | null;
  ausenciaId: string | null;
  /** Estado da justificativa da falta (só quando status = FALTA). */
  statusJustificativa?: StatusJustificativa | null;
  justificadaPorNome?: string | null;
}

/** Roster de um dia (ordenado por entrada, folga ao fim). */
export interface DiaOperadores {
  dataISO: string;
  diaSemana: number;
  trabalhando: number;
  folgas: number;
  faltas: number;
  colaboradores: ColaboradorDia[];
  /** Só no domingo: grupo que folga (G1/G2/G3) pelo rodízio, ou null. */
  grupoFolgaDomingo?: string | null;
}

// ----- Notificações (Req 7.3) -----
export interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string;
  criadaEm: string;
  lida?: boolean;
}


// ----- Assistente de IA (chat flutuante) -----
/** Papel de uma mensagem: 'user' (pergunta) ou 'model' (resposta da IA). */
export type PapelAssistente = 'user' | 'model';

/** Um bloco do passo a passo guiado: texto OU foto (da normativa). */
export interface BlocoProcedimento {
  tipo: 'texto' | 'imagem';
  conteudo?: string;
  /** Caminho relativo da imagem (prefixar com a URL base da API). */
  imagem?: string;
  w?: number;
  h?: number;
}

/** Passo a passo ilustrado anexado a uma resposta da Cluby. */
export interface ProcedimentoResposta {
  id: string;
  titulo: string;
  blocos: BlocoProcedimento[];
}

export interface MensagemAssistente {
  id: string;
  papel: PapelAssistente;
  conteudo: string;
  criadaEm: string;
  procedimento?: ProcedimentoResposta;
}



// ----- Cadastro Unificado de Colaboradores -----
export type FuncaoColaborador = 'OPERADOR' | 'FISCAL' | 'SUPERVISOR' | 'GESTOR';
export type TurnoColaborador =
  | 'ABERTURA'
  | 'INTERMEDIARIO'
  | 'FECHAMENTO'
  | 'APOIO';

/** Pessoa canônica (operador/fiscal) do cadastro unificado. */
export interface Colaborador {
  id: string;
  matricula: string;
  nome: string;
  funcao: FuncaoColaborador;
  genero: string | null;
  ativo: boolean;
  turno: TurnoColaborador | null;
  entradaSemana: string | null;
  saidaSemana: string | null;
  entradaFds: string | null;
  saidaFds: string | null;
  folgaDiaSemana: number | null;
  /** Grupo do rodízio de domingo ('G1'|'G2'|'G3'); null = não trabalha domingo. */
  grupoDomingo: string | null;
  /** Horário de domingo ("HH:mm"), por pessoa. */
  entradaDom: string | null;
  saidaDom: string | null;
  usuarioId: string | null;
  /** Data de admissão (ISO yyyy-mm-dd) — base do módulo de Contratos. */
  dataAdmissao: string | null;
}

/** Dados para cadastrar/editar um colaborador. */
export interface ColaboradorInput {
  nome: string;
  matricula: string;
  login?: string;
  /** Conta de acesso já existente (Usuario.id). String vazia = desvincular. */
  usuarioId?: string | null;
  /** Senha de acesso ao app (cria/reseta o login = matrícula). */
  senha?: string;
  /** Quando a função é Gerente (GESTOR): se é gerente desenvolvedor. */
  gerenteDesenvolvedor?: boolean;
  funcao?: FuncaoColaborador;
  genero?: 'M' | 'F';
  turno?: TurnoColaborador;
  entradaSemana?: string;
  saidaSemana?: string;
  entradaFds?: string;
  saidaFds?: string;
  folgaDiaSemana?: number;
  /** Grupo do rodízio de domingo ('G1'|'G2'|'G3'); null = não trabalha domingo. */
  grupoDomingo?: string | null;
  /** Horário de domingo ("HH:mm"), por pessoa. */
  entradaDom?: string;
  saidaDom?: string;
  /** Data de admissão (ISO yyyy-mm-dd) — base do módulo de Contratos. */
  dataAdmissao?: string;
  ativo?: boolean;
}

/** Identificador (matrícula/login) vinculado a um colaborador. */
export interface ColaboradorIdentificador {
  tipo: 'MATRICULA' | 'LOGIN';
  valor: string;
}

/** Colaborador com seus identificadores (resposta do detalhe `obter`). */
export interface ColaboradorDetalhe extends Colaborador {
  identificadores: ColaboradorIdentificador[];
}

/** Conta de acesso (login) disponível para vincular a um colaborador. */
export interface LoginColaborador {
  id: string;
  login: string;
  nome: string | null;
  perfil: Perfil;
  /** Colaborador já vinculado a este login (null se livre). */
  colaboradorId: string | null;
  colaboradorNome: string | null;
}


// ----- Perfil Inteligente do Colaborador -----
export type SentidoIndicador = 'MAIOR_MELHOR' | 'MENOR_MELHOR';
export type FormatoIndicador = 'MOEDA' | 'NUMERO';
export type NivelSaude = 'BOM' | 'ATENCAO' | 'CRITICO';

/** Ponto de uma série (mês/dia/motivo) para gráficos. */
export interface PontoSerie {
  rotulo: string;
  valor: number;
}

/** Indicador do perfil (com ranking, tendência e comparação à equipe). */
export interface IndicadorPerfil {
  chave: string;
  titulo: string;
  valor: number;
  formato: FormatoIndicador;
  quantidade: number | null;
  sentido: SentidoIndicador;
  posicao: number | null;
  totalParticipantes: number;
  tendencia: number;
  mediaEquipe: number;
  serie: PontoSerie[];
}

/** Sub-nota do score (0–100 com peso). */
export interface ComponenteScore {
  chave: string;
  rotulo: string;
  valor: number;
  peso: number;
}

/** Score de Saúde do Colaborador (0–100 + semáforo). */
export interface ScoreSaude {
  valor: number;
  nivel: NivelSaude;
  componentes: ComponenteScore[];
}

/** Insígnia/destaque (gamificação). */
export interface InsigniaPerfil {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
}

/** Perfil inteligente completo de um colaborador num período. */
export interface PerfilColaborador {
  colaborador: {
    id: string;
    nome: string;
    matricula: string;
    login: string | null;
    funcao: FuncaoColaborador;
    genero: string | null;
    ativo: boolean;
    turno: TurnoColaborador | null;
    entradaSemana: string | null;
    saidaSemana: string | null;
    entradaFds: string | null;
    saidaFds: string | null;
    folgaDiaSemana: number | null;
  };
  /** Vínculo com a conta de acesso do app (online/offline + jornada de hoje). */
  vinculoApp: {
    usuarioId: string;
    login: string | null;
    ehFiscal: boolean;
    online: boolean;
    status: StatusFiscal | null;
    desde: string | null;
    jornada: JornadaTempos | null;
  } | null;
  periodo: { inicio: string; fim: string };
  score: ScoreSaude;
  resumo: string[];
  indicadores: IndicadorPerfil[];
  faltas: {
    total: number;
    taxa: number;
    /** Absenteísmo efetivo (justificadas pesam menos): alimenta o score. */
    taxaPonderada: number;
    /** Quantas faltas do período estão justificadas (abonadas). */
    justificadas: number;
    risco: 'BAIXO' | 'MEDIO' | 'ALTO';
    tendencia: number;
    porMes: PontoSerie[];
    porDiaSemana: PontoSerie[];
  };
  motivosCancelamento: PontoSerie[];
  insignias: InsigniaPerfil[];
  /**
   * Incidências de escala (Fase 1 — "não retornou do intervalo"): resumo
   * analítico do colaborador (últimos ~6 meses) + linha do tempo unificada
   * (incidências + faltas). Espelha 1:1 o formato do backend.
   */
  incidencias: {
    /** Total de incidências de TODOS os tipos no período (~6 meses). */
    total: number;
    /** Desglose por tipo (só tipos com ocorrências). */
    porTipo: { tipo: TipoIncidenciaEscala; rotulo: string; total: number }[];
    /** Retrocompatível: total só de "não retorno do intervalo". */
    totalNaoRetorno: number;
    ultimoNaoRetorno: string | null;
    diasConsecutivosSemIncidencia: number;
    risco: string;
    tendencia: string;
    porDiaSemana: PontoSerie[];
    frequenciaMensal: number;
    percentualSobreEscalados: number;
    timeline: TimelineItem[];
  };
  /**
   * Contrato de experiência / **tempo de casa** (informativo — NÃO afeta o
   * score). `temAdmissao=false` quando ainda não há data de admissão definida.
   */
  contrato: ResumoContratoColaborador;
}


// ----- Contratos de experiência (45 + 45 dias) -----
export type MarcoContrato = 'MARCO_45' | 'MARCO_90';
export type ResultadoDecisao = 'APROVADO' | 'REPROVADO';
export type EstadoContrato =
  | 'SEM_ADMISSAO'
  | 'EXPERIENCIA'
  | 'EFETIVADO'
  | 'ENCERRADO';
export type EtiquetaContrato =
  | 'sem_admissao'
  | 'experiencia'
  | 'efetivado'
  | 'encerrado';
export type UrgenciaContrato = 'INATIVO' | 'OK' | 'ATENCAO' | 'CRITICO';

/** Card de contrato de um operador (seção Contratos). */
export interface ContratoCard {
  colaboradorId: string;
  nome: string;
  matricula: string;
  dataAdmissao: string | null;
  diasDeCasa: number;
  estado: EstadoContrato;
  etiqueta: EtiquetaContrato;
  urgencia: UrgenciaContrato;
  proximoMarco: MarcoContrato | null;
  dataProximoMarco: string | null;
  diasParaProximoMarco: number | null;
  marcoEmAtraso: MarcoContrato | null;
  efetivadoPorDecurso: boolean;
  decisao45: ResultadoDecisao | null;
  decisao90: ResultadoDecisao | null;
}

/** Seção "Tempo de casa / Contrato" do perfil (informativa). */
export interface ResumoContratoColaborador {
  temAdmissao: boolean;
  dataAdmissao: string | null;
  diasDeCasa: number;
  estado: EstadoContrato;
  etiqueta: EtiquetaContrato;
  dataMarco45: string | null;
  dataMarco90: string | null;
  proximoMarco: MarcoContrato | null;
  dataProximoMarco: string | null;
  diasParaProximoMarco: number | null;
  marcoEmAtraso: MarcoContrato | null;
  efetivadoPorDecurso: boolean;
  decisao45: ResultadoDecisao | null;
  decisao90: ResultadoDecisao | null;
}

/** Contagens agregadas da carteira de contratos (resumo do topo da seção). */
export interface ResumoCarteiraContratos {
  total: number;
  emExperiencia: number;
  efetivados: number;
  encerrados: number;
  semAdmissao: number;
  vencendoSemana: number;
  decisaoPendente: number;
}


// ---------------------------------------------------------------------------
// Registro de Ponto (leitor de comprovante) — Fase A
// ---------------------------------------------------------------------------

/** Tipo de cada batida do dia (pela ordem: 1ª entrada ... 4ª encerramento). */
export type TipoBatida =
  | 'ENTRADA'
  | 'SAIDA_INTERVALO'
  | 'RETORNO_INTERVALO'
  | 'ENCERRAMENTO'
  | 'EXTRA';

/** Estado da jornada do dia. */
export type StatusJornadaPonto =
  | 'SEM_REGISTRO'
  | 'TRABALHANDO'
  | 'EM_INTERVALO'
  | 'ENCERRADO'
  | 'INCOMPLETO';

/** Uma batida como exibida no app. */
export interface BatidaPontoView {
  id: string;
  /** Hora da batida (ISO). A hora que vale é a do comprovante. */
  hora: string;
  tipo: TipoBatida;
  origem: string;
  registradoPorNome: string | null;
}

/** Jornada do dia calculada a partir das batidas. */
export interface JornadaPontoView {
  trabalhadoMs: number;
  intervaloMs: number;
  status: StatusJornadaPonto;
  baseMs: number;
  horasExtrasMs: number;
  horasExtras50Ms: number;
  horasExtras100Ms: number;
  alertaIminente: boolean;
  tac: boolean;
  motivosTac: string[];
  faltando: string[];
}

/** Resposta do dia: pessoa, jornada e batidas. */
export interface JornadaDiaPonto {
  pessoaId: string;
  tipoPessoa: string;
  data: string;
  jornada: JornadaPontoView;
  batidas: BatidaPontoView[];
}

/** Confiança (0–1) da leitura do comprovante, por campo e geral. */
export interface ConfiancaComprovante {
  nome: number;
  data: number;
  hora: number;
  geral: number;
}

/** Colaborador sugerido pela leitura, com a confiança do casamento (0–1). */
export interface CandidatoPonto extends PessoaPonto {
  confianca: number;
  /** true quando veio de um alias já confirmado antes (memória do leitor). */
  aprendido?: boolean;
}

/** Pessoa selecionável para registrar o ponto. */
export interface PessoaPonto {
  id: string;
  nome: string;
  tipoPessoa: 'FISCAL' | 'OPERADOR';
  /** Ficha do Cadastro de Colaboradores (para não-fiscais); null p/ fiscais. */
  colaboradorId?: string | null;
}

/** Resultado da leitura do comprovante (Fase B): nome/data/hora + sugestões. */
export interface LeituraComprovante {
  texto: string;
  nome: string | null;
  data: string | null;
  hora: string | null;
  /** Confiança estimada da leitura (por campo e geral). */
  confianca: ConfiancaComprovante;
  /** Colaboradores sugeridos, do mais provável ao menos (com confiança). */
  candidatos: CandidatoPonto[];
}


// ----- Feedforward (acompanhamento de desenvolvimento no perfil) -----

/** Estado persistido de um ponto a melhorar. */
export type StatusPontoFeedforward = 'PENDENTE' | 'ATINGIDO' | 'NAO_ATINGIDO';

/** Situação (semáforo) exibida de um ponto. */
export type SituacaoPontoFeedforward =
  | 'EM_DIA'
  | 'PROXIMO'
  | 'VENCIDO'
  | 'ATINGIDO'
  | 'NAO_ATINGIDO';

/** Um ponto a melhorar (com prazo) de uma rodada de feedforward. */
export interface PontoFeedforward {
  id: string;
  descricao: string;
  /** Prazo (ISO). */
  prazo: string;
  status: StatusPontoFeedforward;
  situacao: SituacaoPontoFeedforward;
  revisadoPorNome: string | null;
  revisadoEm: string | null;
  observacaoRevisao: string | null;
}

/** Uma rodada de feedforward (uma conversa/formulário). */
export interface RodadaFeedforward {
  id: string;
  colaboradorId: string;
  /** Data da conversa (ISO). */
  data: string;
  liderNome: string | null;
  cargo: string | null;
  pontosFortes: string | null;
  oportunidades: string | null;
  compromissoFinal: string | null;
  /** Nota de evolução da conversa (1 a 5). */
  evolucaoNota: number | null;
  /** URL da foto do formulário preenchido. */
  fotoUrl: string | null;
  criadoEm: string;
  pontos: PontoFeedforward[];
}
