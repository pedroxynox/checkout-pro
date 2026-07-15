/** Serviço do Registro de Ponto (leitor de comprovante) — Fase A. */
import { apiClient } from '../client';
import {
  JornadaDiaPonto,
  LeituraComprovante,
  PessoaPonto,
  TipoBatida,
} from '../types';

export const pontoService = {
  /** Busca pessoas (fiscais) por nome para escolher de quem é o comprovante. */
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

  /** Registra uma batida (hora do comprovante) para um colaborador. */
  registrarBatida(input: {
    pessoaId: string;
    tipoPessoa?: 'FISCAL' | 'OPERADOR';
    data: string;
    hora: string;
    origem?: 'MANUAL' | 'LEITOR' | 'EDITADO';
    /** Nome como foi LIDO do comprovante (para o leitor aprender a pessoa). */
    nomeLido?: string;
    /** Confiança (0–1) da leitura que originou a batida. */
    confianca?: number;
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
   * Lê o comprovante: envia o texto lido no aparelho (ML Kit, no APK) e recebe
   * nome/data/hora + colaboradores sugeridos.
   */
  lerComprovante(input: { texto: string }): Promise<LeituraComprovante> {
    return apiClient.post<LeituraComprovante>('/ponto/ocr', input);
  },
};
