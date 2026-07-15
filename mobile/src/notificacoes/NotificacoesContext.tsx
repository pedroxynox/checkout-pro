/**
 * Contexto de notificações em tempo real.
 *
 * Quando há usuário autenticado, abre uma conexão WebSocket com o canal
 * `/notificacoes` do backend e:
 * - mantém o contador de não lidas (badge),
 * - expõe a última notificação recebida (para o toast in-app).
 *
 * Tem um valor padrão seguro (sem provider → contador 0), para que telas
 * isoladas (e testes) funcionem sem precisar do provider.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { conectarNotificacoes, EventoNotificacao } from '../api/socket';
import { useAuth } from '../auth/AuthContext';
import { tocarSomNotificacao } from '../utils/som';

interface NotificacoesContextValor {
  /** Quantidade de notificações não lidas (desde o último "zerar"). */
  naoLidas: number;
  /** Última notificação recebida em tempo real (para exibir o toast). */
  ultima: EventoNotificacao | null;
  /** Zera o contador de não lidas (ex.: ao abrir a tela de Notificações). */
  zerar: () => void;
  /** Descarta o toast da última notificação. */
  descartarUltima: () => void;
}

const NotificacoesContext = createContext<NotificacoesContextValor>({
  naoLidas: 0,
  ultima: null,
  zerar: () => undefined,
  descartarUltima: () => undefined,
});

export function useNotificacoes(): NotificacoesContextValor {
  return useContext(NotificacoesContext);
}

export function NotificacoesProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { autenticado } = useAuth();
  const [naoLidas, setNaoLidas] = useState(0);
  const [ultima, setUltima] = useState<EventoNotificacao | null>(null);

  useEffect(() => {
    if (!autenticado) {
      setNaoLidas(0);
      setUltima(null);
      return;
    }
    let ativo = true;
    let conexao: { desconectar: () => void } | undefined;
    void conectarNotificacoes({
      aoReceber: (n) => {
        setNaoLidas((c) => c + 1);
        setUltima(n);
        tocarSomNotificacao();
      },
    }).then((c) => {
      if (ativo) {
        conexao = c;
      } else {
        c.desconectar();
      }
    });
    return () => {
      ativo = false;
      conexao?.desconectar();
    };
  }, [autenticado]);

  const zerar = useCallback(() => setNaoLidas(0), []);
  const descartarUltima = useCallback(() => setUltima(null), []);

  // Memoiza o valor para não recriar o objeto a cada render do provider —
  // assim os consumidores só re-renderizam quando algo realmente muda.
  const valor = useMemo(
    () => ({ naoLidas, ultima, zerar, descartarUltima }),
    [naoLidas, ultima, zerar, descartarUltima],
  );

  return (
    <NotificacoesContext.Provider value={valor}>
      {children}
    </NotificacoesContext.Provider>
  );
}
