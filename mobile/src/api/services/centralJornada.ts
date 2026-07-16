/** Serviço da Central de Jornada (ciclo de folha 26→25). */
import { apiClient } from '../client';

export type FuncaoPessoa = 'OPERADOR' | 'FISCAL' | 'SUPERVISOR' | 'GESTOR';

export interface CentralPeriodo {
  inicio: string;
  fim: string;
  rotulo: string;
  deslocamento: number;
}

export interface CentralTotais {
  extras50Ms: number;
  extras100Ms: number;
  horasDevidasMs: number;
  horasAtestadoMs: number;
  faltas: number;
  diasTac: number;
  /** Dias com conflito: bateu ponto E tem ausência marcada no mesmo dia. */
  conflitos: number;
  /** Dias em que a entrada passou da tolerância do turno (atraso). */
  atrasos: number;
  saldoMs: number;
}

export interface CentralPessoaResumo extends CentralTotais {
  colaboradorId: string;
  nome: string;
  primeiroNome: string;
  funcao: FuncaoPessoa;
  cargaTrabalhadaMs: number;
}

export interface CentralResumo {
  periodo: CentralPeriodo;
  totais: CentralTotais;
  pessoas: CentralPessoaResumo[];
}

export type TipoDiaJornada =
  | 'TRABALHO'
  | 'INCOMPLETO'
  | 'FALTA'
  | 'FALTA_DEBITO'
  | 'ATESTADO'
  | 'SEM_REGISTRO';

export interface CentralDiaDetalhe {
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  feriadoNome?: string;
  tipo: TipoDiaJornada;
  status:
    | 'SEM_REGISTRO'
    | 'TRABALHANDO'
    | 'EM_INTERVALO'
    | 'ENCERRADO'
    | 'INCOMPLETO';
  faltando: string[];
  trabalhadoMs: number;
  baseMs: number;
  extras50Ms: number;
  extras100Ms: number;
  devidasMs: number;
  tac: boolean;
  motivosTac: string[];
  /** id da ausência (dias de falta/atestado), para marcar débito. */
  ausenciaId?: string;
  /** true se a falta está marcada como débito de horas. */
  debito?: boolean;
  /** Conflito: bateu ponto E tem ausência marcada no mesmo dia. */
  conflitoAusencia?: {
    ausenciaId: string;
    motivoJustificativa: string | null;
    statusJustificativa: string;
    debito: boolean;
  };
  /** Horário de entrada esperado pela escala ("HH:mm"), quando há turno. */
  entradaPrevista?: string | null;
  /** Minutos de atraso na entrada além da tolerância (só quando houve atraso). */
  atrasoMinutos?: number;
}

export interface CentralComparativo {
  periodo: CentralPeriodo;
  totais: CentralTotais;
}

export const centralJornadaService = {
  /** Resumo do ciclo (por pessoa + totais). `ciclo` 0 = atual, -1 = anterior. */
  resumo(ciclo = 0): Promise<CentralResumo> {
    return apiClient.get<CentralResumo>('/central-jornada', {
      ciclo: String(ciclo),
    });
  },

  /** Comparativo dos últimos ciclos. */
  comparativos(qtd = 6): Promise<CentralComparativo[]> {
    return apiClient.get<CentralComparativo[]>('/central-jornada/comparativos', {
      qtd: String(qtd),
    });
  },

  /** Detalhe diário de um colaborador no ciclo. */
  pessoa(
    colaboradorId: string,
    ciclo = 0,
  ): Promise<{ periodo: CentralPeriodo; dias: CentralDiaDetalhe[] }> {
    return apiClient.get<{ periodo: CentralPeriodo; dias: CentralDiaDetalhe[] }>(
      `/central-jornada/pessoa/${colaboradorId}`,
      { ciclo: String(ciclo) },
    );
  },

  /** Marca/desmarca uma falta como débito de horas. */
  marcarDebito(ausenciaId: string, debito: boolean): Promise<unknown> {
    return apiClient.post<unknown>(
      `/central-jornada/ausencia/${ausenciaId}/debito`,
      { debito },
    );
  },
};
