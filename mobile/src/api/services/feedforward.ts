/**
 * Serviço do Feedforward (acompanhamento de desenvolvimento no perfil do
 * colaborador). Lista as rodadas, cria uma nova (com os pontos a melhorar),
 * envia a foto do formulário e revisa um ponto (atingido/não atingido).
 */
import { apiClient } from '../client';
import { PontoFeedforward, RodadaFeedforward } from '../types';
import { ImagemSelecionada } from './checklist';

/** Um ponto a melhorar informado ao criar uma rodada. */
export interface PontoNovoFeedforward {
  descricao: string;
  /** Prazo (ISO — data exata ou calculada de "em X dias/semanas/meses"). */
  prazo: string;
}

/** Dados para criar uma rodada de feedforward. */
export interface CriarFeedforwardInput {
  colaboradorId: string;
  data: string;
  pontosFortes?: string;
  oportunidades?: string;
  compromissoFinal?: string;
  evolucaoNota?: number;
  pontos?: PontoNovoFeedforward[];
}

export const feedforwardService = {
  /** Histórico de rodadas de um colaborador (mais recentes primeiro). */
  doColaborador(colaboradorId: string): Promise<RodadaFeedforward[]> {
    return apiClient.get<RodadaFeedforward[]>(
      `/feedforward/colaborador/${colaboradorId}`,
    );
  },

  /** Cria uma rodada de feedforward (com os pontos a melhorar). */
  criar(input: CriarFeedforwardInput): Promise<RodadaFeedforward> {
    return apiClient.post<RodadaFeedforward>('/feedforward', input);
  },

  /** Envia a foto do formulário preenchido à mão. */
  enviarFoto(
    id: string,
    imagem: ImagemSelecionada,
  ): Promise<RodadaFeedforward> {
    const form = new FormData();
    form.append('file', {
      uri: imagem.uri,
      name: imagem.name,
      type: imagem.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
    return apiClient.upload<RodadaFeedforward>(
      `/feedforward/${id}/foto`,
      form,
    );
  },

  /** Revisa um ponto (marca como atingido ou não atingido). */
  revisarPonto(
    pontoId: string,
    status: 'ATINGIDO' | 'NAO_ATINGIDO',
    observacao?: string,
  ): Promise<PontoFeedforward> {
    return apiClient.patch<PontoFeedforward>(
      `/feedforward/ponto/${pontoId}/revisar`,
      { status, observacao },
    );
  },

  /** Remove uma rodada de feedforward. */
  remover(id: string): Promise<void> {
    return apiClient.delete<void>(`/feedforward/${id}`);
  },
};
