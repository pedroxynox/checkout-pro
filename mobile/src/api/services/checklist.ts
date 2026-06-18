/** Serviço de Checklist (Req 5.x): disponibiliza, envia imagem e status. */
import { apiClient } from '../client';
import {
  Checklist,
  JanelaExecucao,
  StatusChecklist,
  TipoChecklist,
} from '../types';

export interface ImagemSelecionada {
  uri: string;
  name: string;
  mimeType?: string;
}

export const checklistService = {
  /** Disponibiliza (cria se ausente) o checklist do dia (Req 5.1.1). */
  garantir(tipo: TipoChecklist, data?: string): Promise<Checklist> {
    return apiClient.post<Checklist>(`/checklist/${tipo}`, { data });
  },

  /** Envia a imagem do checklist e marca como "Feito" (Req 5.1.2–5.1.4). */
  enviarImagem(
    tipo: TipoChecklist,
    imagem: ImagemSelecionada,
    data?: string,
  ): Promise<Checklist> {
    const form = new FormData();
    form.append('file', {
      uri: imagem.uri,
      name: imagem.name,
      type: imagem.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
    return apiClient.upload<Checklist>(`/checklist/${tipo}/imagem`, form, {
      data,
    });
  },

  /** Status atual do checklist do dia (Req 5.1.5). */
  status(
    tipo: TipoChecklist,
    data?: string,
  ): Promise<{ status: StatusChecklist }> {
    return apiClient.get<{ status: StatusChecklist }>(
      `/checklist/${tipo}/status`,
      { data },
    );
  },

  /** Janela fixa de execução do checklist (Req 5.2). */
  janela(tipo: TipoChecklist): Promise<JanelaExecucao> {
    return apiClient.get<JanelaExecucao>(`/checklist/${tipo}/janela`);
  },
};
