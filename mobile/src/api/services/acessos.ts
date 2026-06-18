/** Serviço de Acessos (Req 7.1, 7.2): login e identidade do usuário. */
import { apiClient } from '../client';
import { ResultadoLogin, UsuarioAutenticado } from '../types';

export const acessosService = {
  /** Autentica pelo login individual e senha (Req 7.1). */
  login(login: string, senha: string): Promise<ResultadoLogin> {
    return apiClient.post<ResultadoLogin>('/acessos/login', { login, senha });
  },

  /** Retorna o usuário autenticado a partir do token atual. */
  eu(): Promise<UsuarioAutenticado> {
    return apiClient.get<UsuarioAutenticado>('/acessos/eu');
  },
};
