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
  /** Horas 50% REAIS disponíveis agora (acumulado − o que deve, piso 0). */
  extras50AtualMs: number;
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
  /** O que deve DE VERDADE agora (devidas − extras 50%, piso 0). É o valor do chip "Deve". */
  horasDevidasAtualMs: number;
  /**
   * Saldo das horas 50% (extras 50% − o que deve), **com sinal**: é o "saldo"
   * exibido na card da pessoa e no detalhe. As 100% não entram — nunca são
   * debitadas e aparecem no chip `+100%`.
   */
  saldo50Ms: number;
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

/** Tipo de problema no painel de inconsistências. */
export type TipoInconsistencia =
  | 'INCOMPLETA'
  | 'DUPLICADA'
  | 'CONFLITO_AUSENCIA'
  | 'ATRASO'
  | 'TAC';

/** Um problema detectado num dia de um colaborador. */
export interface InconsistenciaItem {
  colaboradorId: string;
  nome: string;
  primeiroNome: string;
  funcao: FuncaoPessoa;
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  tipo: TipoInconsistencia;
  detalhe: string;
}

export interface CentralInconsistencias {
  periodo: CentralPeriodo;
  totais: {
    incompletas: number;
    duplicadas: number;
    conflitos: number;
    atrasos: number;
    tac: number;
    total: number;
  };
  itens: InconsistenciaItem[];
}

/** Uma das quatro marcações canônicas do dia, na ordem em que acontecem. */
export type MarcacaoCanonica =
  | 'ENTRADA'
  | 'SAIDA_INTERVALO'
  | 'RETORNO_INTERVALO'
  | 'ENCERRAMENTO';

/** Grau de certeza da análise: `BAIXA` pede conferência humana. */
export type ConfiancaAnalise = 'ALTA' | 'BAIXA';

/** Um dia com marcações faltando (relatório de ajuste do ponto). */
export interface MarcacaoInvalidaItem {
  colaboradorId: string;
  nome: string;
  primeiroNome: string;
  funcao: FuncaoPessoa;
  data: string;
  diaSemana: number;
  ehFeriado: boolean;
  /** Horário de entrada esperado pela escala ("HH:mm"), quando há turno. */
  entradaPrevista: string | null;
  /** Horas registradas no dia ("HH:mm"), em ordem cronológica. */
  horasRegistradas: string[];
  esperadas: number;
  registradas: number;
  quantidadeFaltante: number;
  /** QUAIS marcações faltam, na ordem do dia. */
  tiposFaltantes: MarcacaoCanonica[];
  /** Como as registradas foram interpretadas, na ordem do dia. */
  tiposPresentes: MarcacaoCanonica[];
  confianca: ConfiancaAnalise;
  /** Por que precisa de conferência (só quando `confianca` é `BAIXA`). */
  observacao: string | null;
  /** Frase pronta do que falta ("Falta registrar: entrada"). */
  detalhe: string;
  /** Horas lançadas como devidas neste dia por causa do registro incompleto. */
  devidasMs: number;
}

/** Relatório de marcações inválidas do ciclo (26→25). */
export interface CentralMarcacoesInvalidas {
  periodo: CentralPeriodo;
  totais: {
    dias: number;
    pessoas: number;
    marcacoesFaltantes: number;
    faltaUma: number;
    faltamDuas: number;
    faltamTresOuMais: number;
    aConferir: number;
    porTipo: Record<MarcacaoCanonica, number>;
    devidasMs: number;
  };
  itens: MarcacaoInvalidaItem[];
}

/** Uma linha do relatório de exportação (um dia relevante de um colaborador). */
export interface LinhaExportacaoCiclo {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoPessoa;
  data: string;
  diaSemana: number;
  tipo: TipoDiaJornada;
  trabalhadoMs: number;
  baseMs: number;
  extras50Ms: number;
  extras100Ms: number;
  devidasMs: number;
  atestado: boolean;
  tac: boolean;
  motivosTac: string[];
  problemas: string[];
}

/** Exportação do ciclo para revisão/folha (antes do fechamento). */
export interface CentralExportacao {
  periodo: CentralPeriodo;
  geradoEm: string;
  totais: {
    extras50Ms: number;
    extras100Ms: number;
    horasDevidasMs: number;
    horasAtestadoMs: number;
    faltas: number;
    diasTac: number;
    conflitos: number;
    atrasos: number;
    saldoMs: number;
    inconsistencias: number;
  };
  pessoas: CentralPessoaResumo[];
  linhas: LinhaExportacaoCiclo[];
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

  /** Painel de inconsistências do ciclo. `ciclo` 0 = atual, -1 = anterior. */
  inconsistencias(ciclo = 0): Promise<CentralInconsistencias> {
    return apiClient.get<CentralInconsistencias>(
      '/central-jornada/inconsistencias',
      { ciclo: String(ciclo) },
    );
  },

  /**
   * Relatório de marcações inválidas do ciclo: dia a dia, quantas marcações
   * faltam e QUAIS. `ciclo` 0 = atual, -1 = anterior.
   */
  marcacoesInvalidas(ciclo = 0): Promise<CentralMarcacoesInvalidas> {
    return apiClient.get<CentralMarcacoesInvalidas>(
      '/central-jornada/marcacoes-invalidas',
      { ciclo: String(ciclo) },
    );
  },

  /** Exportação do ciclo (revisão antes do fechamento) + CSV. */
  exportacao(ciclo = 0): Promise<CentralExportacao> {
    return apiClient.get<CentralExportacao>('/central-jornada/exportacao', {
      ciclo: String(ciclo),
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
