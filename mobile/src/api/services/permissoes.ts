/**
 * Serviço da Central de Permissões (uso exclusivo do Administrador). Ajusta as
 * permissões POR LOGIN como desvios do padrão do perfil.
 */
import { apiClient } from '../client';
import {
  ItemAuditoria,
  PermissoesDoPerfil,
  PermissoesDoUsuario,
  ResumoPerfil,
} from '../types';

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

  // ----- Padrões por perfil -----

  /** Resumo dos perfis ajustáveis (com contagem de personalizações). */
  perfis(): Promise<ResumoPerfil[]> {
    return apiClient.get<ResumoPerfil[]>('/permissoes/perfis');
  },

  /** Padrão (código + ajustes) de um perfil. */
  doPerfil(perfil: string): Promise<PermissoesDoPerfil> {
    return apiClient.get<PermissoesDoPerfil>(`/permissoes/perfil/${perfil}`);
  },

  /** Define o padrão de um perfil (afeta todos os usuários do perfil). */
  definirPerfil(perfil: string, permissoes: string[]): Promise<PermissoesDoPerfil> {
    return apiClient.put<PermissoesDoPerfil>(`/permissoes/perfil/${perfil}`, {
      permissoes,
    });
  },

  /** Restaura o perfil ao padrão de código (remove os ajustes de perfil). */
  restaurarPerfil(perfil: string): Promise<PermissoesDoPerfil> {
    return apiClient.post<PermissoesDoPerfil>(
      `/permissoes/perfil/${perfil}/restaurar`,
      {},
    );
  },

  // ----- Histórico -----

  /** Últimas mudanças de permissão (por login e por perfil). */
  historico(limite = 100): Promise<ItemAuditoria[]> {
    return apiClient.get<ItemAuditoria[]>('/permissoes/historico', { limite });
  },
};
