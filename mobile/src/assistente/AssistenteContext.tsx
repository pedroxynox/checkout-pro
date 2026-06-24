/**
 * Contexto da Cluby (assistente de IA).
 *
 * Permite que qualquer tela peça à Cluby um resumo/briefing com uma pergunta
 * já pronta — por exemplo, o botão "Pedir um briefing à Cluby" no Resumo do
 * Dia (topo da Home). O chat da Cluby (aba Mensagens) observa o `pedido` e, ao
 * receber um, abre o chat e envia a pergunta automaticamente.
 *
 * O valor padrão é "no-op" (não faz nada) para que telas usadas em testes —
 * que não montam o provider — continuem funcionando sem erro.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

/** Um pedido de briefing à Cluby (com nonce para disparar mesmo se repetido). */
export interface PedidoCluby {
  pergunta: string;
  /** Identificador único do pedido (permite repetir a mesma pergunta). */
  nonce: number;
}

interface EstadoAssistente {
  /** Pedido pendente a ser consumido pelo chat (ou null). */
  pedido: PedidoCluby | null;
  /** Abre a Cluby e envia automaticamente a `pergunta` informada. */
  pedirBriefing: (pergunta: string) => void;
  /** Marca o pedido como consumido (chamado pelo chat após enviar). */
  limparPedido: () => void;
}

const AssistenteContext = createContext<EstadoAssistente>({
  pedido: null,
  pedirBriefing: () => {},
  limparPedido: () => {},
});

export function AssistenteProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [pedido, setPedido] = useState<PedidoCluby | null>(null);

  const pedirBriefing = useCallback((pergunta: string) => {
    const texto = pergunta.trim();
    if (texto.length === 0) {
      return;
    }
    setPedido({ pergunta: texto, nonce: Date.now() });
  }, []);

  const limparPedido = useCallback(() => setPedido(null), []);

  const valor = useMemo<EstadoAssistente>(
    () => ({ pedido, pedirBriefing, limparPedido }),
    [pedido, pedirBriefing, limparPedido],
  );

  return (
    <AssistenteContext.Provider value={valor}>
      {children}
    </AssistenteContext.Provider>
  );
}

/** Hook de acesso ao contexto da Cluby (seguro mesmo sem provider). */
export function useAssistente(): EstadoAssistente {
  return useContext(AssistenteContext);
}

export default AssistenteContext;
