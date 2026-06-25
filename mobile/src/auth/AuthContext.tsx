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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, registrarAoExpirarSessao } from '../api/client';
import { acessosService } from '../api/services';
import { tokenStorage } from '../api/tokenStorage';
import { Perfil, UsuarioAutenticado } from '../api/types';
import { podeAcessar } from './funcionalidades';

/**
 * Nome do último usuário autenticado, guardado para a saudação personalizada
 * na tela de login (ex.: "Bom dia, João!" em vez da matrícula). É lido pelo
 * LoginScreen na próxima abertura.
 */
const CHAVE_NOME_SALVO = 'checkoutpro:nome-lembrado';

/** Persiste o nome do usuário para a saudação do login (silencioso). */
async function lembrarNome(nome?: string | null): Promise<void> {
  try {
    if (nome && nome.trim()) {
      await AsyncStorage.setItem(CHAVE_NOME_SALVO, nome.trim());
    }
  } catch {
    // ignora — a saudação cai para o login/matrícula se não houver nome.
  }
}

interface EstadoAuth {
  carregando: boolean;
  usuario: UsuarioAutenticado | null;
  perfil: Perfil | null;
  autenticado: boolean;
  entrar: (login: string, senha: string) => Promise<void>;
  /** Restaura a sessão a partir de um token já existente (login biométrico). */
  entrarComToken: (token: string) => Promise<void>;
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
        await lembrarNome(eu.nome);
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
    await lembrarNome(eu.nome);
  }, []);

  // Login por biometria: usa um token previamente salvo (validado no backend
  // ao buscar o usuário; se estiver expirado, o erro 401 é propagado).
  const entrarComToken = useCallback(async (token: string) => {
    await tokenStorage.salvarToken(token);
    const eu = await acessosService.eu();
    setUsuario(eu);
    await lembrarNome(eu.nome);
  }, []);

  const valor = useMemo<EstadoAuth>(
    () => ({
      carregando,
      usuario,
      perfil: usuario?.perfil ?? null,
      autenticado: usuario !== null,
      entrar,
      entrarComToken,
      sair,
      podeAcessar: (funcionalidade: string) =>
        usuario ? podeAcessar(usuario.perfil, funcionalidade) : false,
    }),
    [carregando, usuario, entrar, entrarComToken, sair],
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
