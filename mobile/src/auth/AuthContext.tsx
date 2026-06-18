/**
 * Contexto de autenticação do app.
 *
 * Responsabilidades:
 *  - Restaurar a sessão a partir do token salvo no armazenamento seguro ao
 *    iniciar o app (Req 7.1).
 *  - Expor `entrar(login, senha)` que autentica no backend, persiste o token e
 *    carrega a identidade do usuário (perfil/login).
 *  - Expor `sair()` que limpa o token e o estado.
 *  - Disponibilizar `podeAcessar(funcionalidade)` para a navegação por perfil.
 *  - Tratar expiração de sessão (401) encerrando automaticamente.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError, registrarAoExpirarSessao } from '../api/client';
import { acessosService } from '../api/services';
import { tokenStorage } from '../api/tokenStorage';
import { Perfil, UsuarioAutenticado } from '../api/types';
import { podeAcessar } from './funcionalidades';

interface EstadoAuth {
  carregando: boolean;
  usuario: UsuarioAutenticado | null;
  perfil: Perfil | null;
  autenticado: boolean;
  entrar: (login: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  podeAcessar: (funcionalidade: string) => boolean;
}

const AuthContext = createContext<EstadoAuth | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);

  const sair = useCallback(async () => {
    await tokenStorage.limparToken();
    setUsuario(null);
  }, []);

  // Restaura a sessão ao iniciar: se houver token, busca o usuário atual.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const token = await tokenStorage.obterToken();
        if (!token) {
          return;
        }
        const eu = await acessosService.eu();
        if (ativo) {
          setUsuario(eu);
        }
      } catch (erro) {
        // Token inválido/expirado: limpa a sessão silenciosamente.
        if (erro instanceof ApiError && erro.naoAutorizado) {
          await tokenStorage.limparToken();
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  // Encerra a sessão automaticamente quando o backend retorna 401.
  useEffect(() => {
    registrarAoExpirarSessao(() => {
      void sair();
    });
    return () => registrarAoExpirarSessao(null);
  }, [sair]);

  const entrar = useCallback(async (login: string, senha: string) => {
    const { token } = await acessosService.login(login.trim(), senha);
    await tokenStorage.salvarToken(token);
    const eu = await acessosService.eu();
    setUsuario(eu);
  }, []);

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      usuario,
      perfil: usuario?.perfil ?? null,
      autenticado: usuario !== null,
      entrar,
      sair,
      podeAcessar: (funcionalidade: string) =>
        usuario ? podeAcessar(usuario.perfil, funcionalidade) : false,
    }),
    [carregando, usuario, entrar, sair],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

/** Hook de acesso ao contexto de autenticação. */
export function useAuth(): EstadoAuth {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  }
  return ctx;
}
