/**
 * Jornada da pessoa pela ficha (Centro de Controle ▸ Colaboradores e perfil).
 * Espelho de `backend/src/jornada-vigencia/jornada-colaborador.*` (spec
 * `jornada-5x2`, Fase 4).
 *
 * Cada mudança de contrato, grupo, folgas fixas ou disponibilidade é uma
 * **vigência** com data de início ("vale a partir de"). Os dias antes da primeira
 * vigência seguem o 6x1 da ficha antiga. Dias: 0 = domingo … 6 = sábado.
 */
import { apiClient } from '../client';

export type TipoAvisoJornada =
  'DIA_SEM_HORARIO' | 'DISPONIBILIDADE_FORA_DA_CARGA' | 'SEM_FOLGA';

/** Aviso da vigência (não impede salvar). */
export interface AvisoJornada {
  tipo: TipoAvisoJornada;
  /** Dia da semana a que se refere (0 = domingo), quando há um. */
  diaSemana: number | null;
  mensagem: string;
}

/** Horário de um dia da semana ("HH:mm"). */
export interface DisponibilidadeDia {
  diaSemana: number;
  entrada: string;
  saida: string;
}

/** Uma vigência como a API devolve. */
export interface VigenciaJornada {
  id: string;
  /** Primeiro dia (AAAA-MM-DD). */
  aPartirDe: string;
  tipoContratoJornadaId: string;
  tipoContratoNome: string | null;
  grupo: string | null;
  /** As da ficha (vazias = as padrão do contrato). */
  folgasFixas: number[];
  /** As que valem; vazio com grupo. */
  folgasFixasEfetivas: number[];
  /** De segunda a domingo; só os dias com horário. */
  disponibilidade: DisponibilidadeDia[];
  motivo: string | null;
  criadoPor: string | null;
  criadoEm: string;
  atualizadoPor: string | null;
  atualizadoEm: string;
  avisos: AvisoJornada[];
}

export type RegimeJornada = 'LEGADO_6X1' | 'SEMANAL';

/** `GET /colaboradores/:id/jornada`. */
export interface JornadaDoColaborador {
  colaboradorId: string;
  /** Regime de hoje: sem vigência que já começou, o 6x1 da ficha antiga. */
  regimeHoje: RegimeJornada;
  vigente: VigenciaJornada | null;
  /** Contrato de hoje e desde quando (null no 6x1: vem da ficha). */
  contratoVigente: { id: string; nome: string | null; desde: string | null };
  /** Da mais nova para a mais antiga (inclui as futuras). */
  historico: VigenciaJornada[];
  /** Folgas dos próximos 14 dias. */
  proximasFolgas: { data: string; diaSemana: number }[];
}

/** Um dia como a tela manda: entrada e saída vazias = sem horário. */
export interface DisponibilidadeInput {
  diaSemana: number;
  entrada?: string | null;
  saida?: string | null;
}

/** Corpo do `PUT` (e do bloco `jornada` do cadastro, com data opcional). */
export interface JornadaInput {
  aPartirDe: string;
  /** Ausente = o contrato que já vale na data (só o administrador troca). */
  tipoContratoJornadaId?: string | null;
  grupo?: string | null;
  folgasFixas?: number[];
  disponibilidade?: DisponibilidadeInput[];
  motivo?: string | null;
}

/** `PUT /colaboradores/:id/jornada`. */
export interface ResultadoGravacaoJornada {
  vigencia: VigenciaJornada;
  avisos: AvisoJornada[];
}

export const jornadaColaboradorService = {
  /** Vigente, histórico e próximas folgas. */
  obter(colaboradorId: string): Promise<JornadaDoColaborador> {
    return apiClient.get<JornadaDoColaborador>(
      `/colaboradores/${colaboradorId}/jornada`,
    );
  },

  /** Grava (cria ou substitui) a vigência de `aPartirDe`. */
  gravar(
    colaboradorId: string,
    input: JornadaInput,
  ): Promise<ResultadoGravacaoJornada> {
    return apiClient.put<ResultadoGravacaoJornada>(
      `/colaboradores/${colaboradorId}/jornada`,
      input,
    );
  },

  /** Remove uma vigência (nunca num ciclo fechado). */
  remover(
    colaboradorId: string,
    vigenciaId: string,
  ): Promise<JornadaDoColaborador> {
    return apiClient.delete<JornadaDoColaborador>(
      `/colaboradores/${colaboradorId}/jornada/${vigenciaId}`,
    );
  },
};
