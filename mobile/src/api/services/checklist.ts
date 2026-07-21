/** Serviço de Checklist (Req 5.x): disponibiliza, envia imagem e status. */
import { Platform } from 'react-native';
import { apiClient } from '../client';
import {
  Checklist,
  ChecklistHistoricoDia,
  ChecklistMetricas,
  EstadoChecklists,
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
  async enviarImagem(
    tipo: TipoChecklist,
    imagem: ImagemSelecionada,
    data?: string,
  ): Promise<Checklist> {
    const form = new FormData();
    const tipoMime = imagem.mimeType ?? 'image/jpeg';
    // Compatível com web e nativo. No nativo (APK) o React Native aceita o
    // objeto { uri, name, type }; na WEB o navegador precisa de um Blob real —
    // por isso lemos o conteúdo da URI (data:/blob:) e o anexamos com o nome do
    // arquivo. Antes, o objeto { uri, ... } era enviado sempre, e a foto do
    // checklist não subia pelo site (só pelo aparelho).
    if (Platform.OS === 'web') {
      const resposta = await fetch(imagem.uri);
      const blob = await resposta.blob();
      form.append('file', blob, imagem.name);
    } else {
      form.append('file', {
        uri: imagem.uri,
        name: imagem.name,
        type: tipoMime,
      } as unknown as Blob);
    }
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

  /** Estado rico dos dois checklists do dia (auditoria/pontualidade). */
  estado(data?: string): Promise<EstadoChecklists> {
    return apiClient.get<EstadoChecklists>('/checklist/estado', data ? { data } : undefined);
  },

  /** Métricas de cumprimento do mês (% no prazo, racha). */
  metricas(data?: string): Promise<ChecklistMetricas> {
    return apiClient.get<ChecklistMetricas>('/checklist/metricas', data ? { data } : undefined);
  },

  /** Histórico dos últimos N dias. */
  historico(dias = 14): Promise<ChecklistHistoricoDia[]> {
    return apiClient.get<ChecklistHistoricoDia[]>('/checklist/historico', {
      dias: String(dias),
    });
  },

  /** Histórico do MÊS da data informada (calendário). Padrão: mês atual. */
  historicoMes(data?: string): Promise<ChecklistHistoricoDia[]> {
    return apiClient.get<ChecklistHistoricoDia[]>(
      '/checklist/historico-mes',
      data ? { data } : undefined,
    );
  },
};
