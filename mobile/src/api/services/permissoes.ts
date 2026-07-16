/**
 * Serviço da Central de Permissões (uso exclusivo do Administrador). Ajusta as
 * permissões POR LOGIN como desvios do padrão do perfil.
 */
import { apiClient } from '../client';
import { PermissoesDoUsuario } from '../types';

export const permissoesService = {
  /** Catálogo de funcionalidades ajustáveis por login. */
  catalogo(): Promise<{ funcionalidades: string[] }> {
    return apiClient.get<{ funcionalidades: string[] }>('/permissoes/catalogo');
  },

  /** Permissões (padrão do perfil + ajustes) de um usuário. */
  doUsuario(usuarioId: string): Promise<PermissoesDoUsuario> {
    return apiClient.get<PermissoesDoUsuario>(`/permissoes/usuario/${usuarioId}`);
  },

  /** Define as permissões ajustáveis LIGADAS de um usuário. */
  definir(usuarioId: string, permissoes: string[]): Promise<PermissoesDoUsuario> {
    return apiClient.put<PermissoesDoUsuario>(
      `/permissoes/usuario/${usuarioId}`,
      { permissoes },
    );
  },

  /** Restaura o usuário ao padrão do seu perfil (remove todos os ajustes). */
  restaurar(usuarioId: string): Promise<PermissoesDoUsuario> {
    return apiClient.post<PermissoesDoUsuario>(
      `/permissoes/usuario/${usuarioId}/restaurar`,
      {},
    );
  },
};
