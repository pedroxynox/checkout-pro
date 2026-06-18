/**
 * Tipos compartilhados que espelham os contratos do backend NestJS.
 *
 * Mantidos aqui de forma autônoma (sem importar do backend) para que o app
 * permaneça desacoplado, com nomes em Português alinhados ao domínio.
 */

export type Perfil = 'GERENTE' | 'FISCAL';

export interface ResultadoLogin {
  token: string;
  perfil: Perfil;
}

export interface UsuarioAutenticado {
  sub: string;
  login: string;
  perfil: Perfil;
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
export type CategoriaInsumo = 'SACOLA' | 'BOBINA' | 'PANO' | 'OUTRO';

export interface Insumo {
  id: string;
  nome: string;
  categoria: CategoriaInsumo;
  saldo: number;
  limiteMinimo: number;
}

export interface MovimentoEstoque {
  id: string;
  insumoId: string;
  delta: number;
  responsavelId: string | null;
  dataHora: string;
  destino: string | null;
  pdvId: string | null;
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

export interface ItemEscalaConsolidada {
  funcionarioId: string;
  nome?: string;
  diaSemana: number;
  entrada: string | null;
  saida: string | null;
  intervaloMin: number;
  folga: boolean;
  especial: boolean;
}

export type EscalaEfetiva = ItemEscalaConsolidada | 'FOLGA';

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
export type Turno = 'ABERTURA' | 'INTERMEDIARIO' | 'FECHAMENTO';

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
  nome?: string;
  totalAusencias: number;
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
