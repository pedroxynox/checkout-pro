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

// ----- Importações (Req 1.x) -----
export type TipoArquivo =
  | 'CANCELAMENTO_ITENS'
  | 'TROCO_SOLIDARIO'
  | 'RECARGAS_CELULAR'
  | 'DEVOLUCOES';

export type StatusImportacao = 'importado' | 'pendente';

export type StatusDia = Record<TipoArquivo, StatusImportacao>;

export interface RegistroImportacao {
  id: string;
  tipo: TipoArquivo;
  dataReferencia: string;
  importadoEm: string;
  importadoPor: string | null;
  nomesNaoReconhecidos: string[];
}

export interface ResultadoImportacao {
  tipo: TipoArquivo;
  dataReferencia: string;
  registrosVinculados: unknown[];
  nomesNaoReconhecidos: string[];
  importadoPor: string | null;
  importadoEm: string;
}

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
export type StatusFiscal = 'DISPONIVEL' | 'EM_INTERVALO' | 'EM_ATENDIMENTO';

export interface SessaoFiscal {
  id: string;
  fiscalId: string;
  checkIn: string;
  checkOut: string | null;
  statusAtual: StatusFiscal;
  statusDefinidoEm: string;
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
  efetiva: EscalaEfetiva;
}

/** Evento recebido pelo WebSocket do painel de fiscais. */
export interface EventoStatusFiscal {
  fiscalId: string;
  status: StatusFiscal;
  statusDefinidoEm: string;
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
