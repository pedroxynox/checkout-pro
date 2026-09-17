/** Escala para publicar (dia e semana) — dados prontos para virar PDF/imagem. */
import { apiClient } from '../client';

/** Funções escaladas (a gerência não entra na escala publicada). */
export type FuncaoEscala = 'OPERADOR' | 'FISCAL' | 'SUPERVISOR';

/** Estado de uma pessoa num dia da escala. */
export type StatusEscala =
  | 'TRABALHA'
  | 'FOLGA'
  | 'FALTA'
  | 'ATESTADO'
  | 'FERIAS';

/** Uma linha da escala de um dia. */
export interface LinhaEscala {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoEscala;
  /** Turno do cadastro (ABERTURA/INTERMEDIARIO/FECHAMENTO/APOIO) ou null. */
  turno: string | null;
  status: StatusEscala;
  /**
   * Turno do dia ("HH:mm"); vem preenchido também quando a pessoa faltou.
   *
   * Vem **sempre** da ficha do colaborador (ADR 0026): não existe mais exceção
   * de horário na escala semanal que pudesse sobrepô-la.
   */
  entrada: string | null;
  saida: string | null;
}

/** As pessoas de uma função, na ordem de leitura. */
export interface SecaoEscala {
  funcao: FuncaoEscala;
  linhas: LinhaEscala[];
}

/** Contagens do dia. */
export interface TotaisEscala {
  trabalhando: number;
  folgas: number;
  faltas: number;
  atestados: number;
  ferias: number;
}

/**
 * Uma pessoa **sem dia de folga no cadastro** (ADR 0023).
 *
 * Sem folga na ficha ela é escalada os sete dias da semana, e pode receber falta
 * automática num dia em que estava descansando. Era o defeito mais silencioso do
 * conjunto: a Escala mostrava "trabalha" e não havia como saber que faltava um
 * dado.
 */
export interface PessoaSemFolga {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoEscala;
}

/** Escala publicada de um dia. */
export interface EscalaDiaPublicada {
  dataISO: string;
  diaSemana: number;
  ehFeriado: boolean;
  nomeFeriado: string | null;
  /** Só no domingo: grupo que folga pelo rodízio (ou null sem âncora). */
  grupoFolgaDomingo: 'G1' | 'G2' | 'G3' | null;
  totais: TotaisEscala;
  secoes: SecaoEscala[];
  /** Quem está sem dia de folga no cadastro — um aviso, não uma seção. */
  semFolgaNoCadastro: PessoaSemFolga[];
}

/** Um dia no cabeçalho da grade semanal. */
export interface DiaSemanaEscala {
  dataISO: string;
  diaSemana: number;
  ehFeriado: boolean;
  nomeFeriado: string | null;
}

/** Uma célula da grade semanal. */
export interface CelulaSemanaEscala {
  status: StatusEscala;
  entrada: string | null;
  saida: string | null;
}

/** Uma pessoa na grade semanal: uma célula por dia (segunda a domingo). */
export interface PessoaSemanaEscala {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoEscala;
  turno: string | null;
  celulas: CelulaSemanaEscala[];
}

/** Escala publicada de uma semana (segunda a domingo). */
export interface EscalaSemanaPublicada {
  inicioISO: string;
  fimISO: string;
  dias: DiaSemanaEscala[];
  secoes: { funcao: FuncaoEscala; pessoas: PessoaSemanaEscala[] }[];
  /** Quem está sem dia de folga no cadastro — um aviso, não uma seção. */
  semFolgaNoCadastro: PessoaSemFolga[];
}

export const escalaExportacaoService = {
  /** Escala de um dia com todo o time (sem data = hoje). */
  dia(data?: string): Promise<EscalaDiaPublicada> {
    return apiClient.get<EscalaDiaPublicada>('/escala-exportacao/dia', { data });
  },

  /** Escala da semana (segunda a domingo) que contém a data. */
  semana(data?: string): Promise<EscalaSemanaPublicada> {
    return apiClient.get<EscalaSemanaPublicada>('/escala-exportacao/semana', {
      data,
    });
  },
};
