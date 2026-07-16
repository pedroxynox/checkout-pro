/**
 * Serviço da seção Check-Outs: tablero, reportes de avaria (com foto opcional),
 * resolução e configuração da quantidade de caixas.
 */
import { apiClient } from '../client';
import { ReporteCheckout, TableroCheckouts } from '../types';

export interface FotoAvaria {
  uri: string;
  name: string;
  mimeType?: string;
}

export const checkoutsService = {
  /** Tablero: total de caixas + avarias abertas por caixa. */
  tablero(): Promise<TableroCheckouts> {
    return apiClient.get<TableroCheckouts>('/checkouts');
  },

  /** Quantidade de check-outs configurada. */
  config(): Promise<{ quantidade: number }> {
    return apiClient.get<{ quantidade: number }>('/checkouts/config');
  },

  /** Define a quantidade de check-outs (gerente/admin). */
  definirConfig(quantidade: number): Promise<{ quantidade: number }> {
    return apiClient.put<{ quantidade: number }>('/checkouts/config', {
      quantidade,
    });
  },

  /** Reportes de um check-out (abertos primeiro). */
  doCheckout(numero: number): Promise<ReporteCheckout[]> {
    return apiClient.get<ReporteCheckout[]>(`/checkouts/${numero}`);
  },

  /** Lista reportes por status (padrão: todos). */
  listarReportes(status?: 'ABERTO' | 'RESOLVIDO'): Promise<ReporteCheckout[]> {
    return apiClient.get<ReporteCheckout[]>(
      '/checkouts/reportes',
      status ? { status } : undefined,
    );
  },

  /** Registra uma avaria (com foto opcional) num check-out. */
  reportar(
    numero: number,
    dados: { equipamento: string; descricao: string },
    foto?: FotoAvaria,
  ): Promise<ReporteCheckout> {
    const form = new FormData();
    form.append('equipamento', dados.equipamento);
    form.append('descricao', dados.descricao);
    if (foto) {
      form.append('file', {
        uri: foto.uri,
        name: foto.name,
        type: foto.mimeType ?? 'image/jpeg',
      } as unknown as Blob);
    }
    return apiClient.upload<ReporteCheckout>(
      `/checkouts/${numero}/reportes`,
      form,
    );
  },

  /** Marca um reporte como resolvido (gestão). */
  resolver(id: string): Promise<ReporteCheckout> {
    return apiClient.post<ReporteCheckout>(
      `/checkouts/reportes/${id}/resolver`,
      {},
    );
  },
};
