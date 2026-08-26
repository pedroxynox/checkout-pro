/** Serviço de Férias (inativação NÃO rígida de um colaborador por período). */
import { apiClient } from '../client';
import { FeriasColaborador, FeriasDetalhada } from '../types';

export const feriasService = {
  /**
   * Cadastra um período de férias para um colaborador. Enquanto vigente, o
   * colaborador some da escala do dia e não gera falta automática — sem tocar em
   * `ativo` (não é desligamento). Gestão.
   */
  registrar(input: {
    colaboradorId: string;
    inicio: string;
    fim: string;
    observacao?: string;
  }): Promise<FeriasColaborador> {
    return apiClient.post<FeriasColaborador>('/ferias', input);
  },

  /**
   * Lista as férias **em curso e futuras** (todas ou de um colaborador), com o
   * nome e a marca de vigência na data de referência (hoje por padrão).
   *
   * Períodos já encerrados NÃO vêm: a lista é operacional ("quem está de férias
   * e quem vai entrar"). O registro continua no banco — os dias passados seguem
   * aparecendo como férias na escala. Use `incluirEncerradas` para ver tudo.
   */
  listar(
    filtro: {
      colaboradorId?: string;
      referencia?: string;
      incluirEncerradas?: boolean;
    } = {},
  ): Promise<FeriasDetalhada[]> {
    const params: Record<string, string> = {};
    if (filtro.colaboradorId) params.colaboradorId = filtro.colaboradorId;
    if (filtro.referencia) params.referencia = filtro.referencia;
    if (filtro.incluirEncerradas) params.incluirEncerradas = 'true';
    return apiClient.get<FeriasDetalhada[]>('/ferias', params);
  },

  /** Remove (cancela) um período de férias. Gestão. */
  remover(id: string): Promise<void> {
    return apiClient.delete<void>(`/ferias/${id}`);
  },
};
