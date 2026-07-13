/** Serviço do Registro de Ponto (leitor de papelito) — Fase A. */
import { apiClient } from '../client';
import {
  JornadaDiaPonto,
  LeituraPapelito,
  PessoaPonto,
  TipoBatida,
} from '../types';

export const pontoService = {
  /** Busca pessoas (fiscais) por nome para escolher de quem é o papelito. */
  buscarPessoas(busca?: string): Promise<PessoaPonto[]> {
    return apiClient.get<PessoaPonto[]>('/ponto/pessoas', { busca });
  },

  /** Batidas + jornada calculada de um dia (data ISO yyyy-mm-dd). */
  jornadaDoDia(
    pessoaId: string,
    data: string,
    tipoPessoa: 'FISCAL' | 'OPERADOR' = 'FISCAL',
  ): Promise<JornadaDiaPonto> {
    return apiClient.get<JornadaDiaPonto>('/ponto/dia', {
      pessoaId,
      tipoPessoa,
      data,
    });
  },

  /** Registra uma batida (hora do papelito) para um colaborador. */
  registrarBatida(input: {
    pessoaId: string;
    tipoPessoa?: 'FISCAL' | 'OPERADOR';
    data: string;
    hora: string;
    origem?: 'MANUAL' | 'LEITOR' | 'EDITADO';
  }): Promise<JornadaDiaPonto> {
    return apiClient.post<JornadaDiaPonto>('/ponto/batidas', input);
  },

  /** Corrige uma batida (hora e/ou tipo). */
  editarBatida(
    id: string,
    input: { hora?: string; tipo?: TipoBatida },
  ): Promise<JornadaDiaPonto> {
    return apiClient.patch<JornadaDiaPonto>(`/ponto/batidas/${id}`, input);
  },

  /** Remove uma batida e reclassifica o dia. */
  removerBatida(id: string): Promise<JornadaDiaPonto> {
    return apiClient.delete<JornadaDiaPonto>(`/ponto/batidas/${id}`);
  },

  /**
   * Lê o papelito: envia o texto (já lido no Android) ou a imagem (OCR no
   * servidor, na web) e recebe nome/data/hora + colaboradores sugeridos.
   */
  lerPapelito(input: {
    texto?: string;
    imagem?: string;
  }): Promise<LeituraPapelito> {
    return apiClient.post<LeituraPapelito>('/ponto/ocr', input);
  },
};
