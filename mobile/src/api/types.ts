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

/** Item do log de jornada do dia (tempos por fiscal) — uso gerencial. */
export interface ItemJornadaFiscal extends JornadaTempos {
  fiscalId: string;
  colaboradorId: string | null;
  primeiroNome: string;
  status: StatusFiscal;
}

/** Acumulado de horas extras do mês por fiscal. */
export interface ItemHorasExtrasFiscal {
  fiscalId: string;
  primeiroNome: string;
  horasExtrasMs: number;
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
  esperados: number;
  listaDisponiveis: OperadorAgora[];
  listaFaltantes: OperadorAgora[];
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
}

/** Roster de um dia (ordenado por entrada, folga ao fim). */
export interface DiaOperadores {
  dataISO: string;
  diaSemana: number;
  trabalhando: number;
  folgas: number;
  faltas: number;
  colaboradores: ColaboradorDia[];
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
  usuarioId: string | null;
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
    risco: 'BAIXO' | 'MEDIO' | 'ALTO';
    tendencia: number;
    porMes: PontoSerie[];
    porDiaSemana: PontoSerie[];
  };
  motivosCancelamento: PontoSerie[];
  insignias: InsigniaPerfil[];
}
