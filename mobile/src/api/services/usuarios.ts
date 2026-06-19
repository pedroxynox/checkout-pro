/** Serviço de gestão de pessoas/usuários (uso do gerente). */
import { apiClient } from '../client';
import { Perfil, UsuarioConta } from '../types';

export const usuariosService = {
  /** Lista os usuários cadastrados. */
  listar(): Promise<UsuarioConta[]> {
    return apiClient.get<UsuarioConta[]>('/usuarios');
  },

  /** Cadastra uma nova pessoa (login por matrícula). */
  cadastrar(dados: {
    matricula: string;
    nome: string;
    perfil: Perfil;
    senha: string;
  }): Promise<UsuarioConta> {
    return apiClient.post<UsuarioConta>('/usuarios', dados);
  },

  /** Redefine a senha de um usuário. */
  redefinirSenha(id: string, senha: string): Promise<void> {
    return apiClient.patch<void>(`/usuarios/${id}/senha`, { senha });
  },

  /** Remove um usuário. */
  remover(id: string): Promise<void> {
    return apiClient.delete<void>(`/usuarios/${id}`);
  },
};
