/**
 * Contexto da configuração global do sistema (Req 7.2).
 *
 * Ao autenticar, busca a Data_Inicial_Sistema (`GET /config/data-inicial`) e a
 * disponibiliza para o app via `useConfigSistema().dataInicial` (ISO
 * `yyyy-mm-dd`). Essa data é o limite inferior dos seletores de data das telas
 * de carga/edição.
 *
 * Robustez: enquanto carrega ou em caso de erro de rede, usa o mesmo default do
 * backend (`'2026-07-01'`) para nunca deixar um seletor sem limite. A fonte de
 * verdade da validação continua sendo o backend; aqui só melhoramos a UX.
 *
 * Deve ser montado ABAIXO do `AuthProvider`, pois observa o estado de sessão.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { configSistemaService } from '../api/services';
import { useAuth } from '../auth/AuthContext';

/** Default da Data_Inicial_Sistema (espelha o backend). */
export const DATA_INICIAL_PADRAO = '2026-07-01';

interface EstadoConfigSistema {
  /** Data inicial do sistema (ISO `yyyy-mm-dd`). Nunca vazia (usa o default). */
  dataInicial: string;
  /** Indica que a data ainda está sendo carregada do backend. */
  carregando: boolean;
}

/**
 * Valor default do contexto: usado quando não há um `ConfigSistemaProvider`
 * acima na árvore. Como a data inicial é uma melhoria de UX (a validação de
 * verdade é do backend), o consumidor degrada graciosamente para o default do
 * sistema em vez de quebrar.
 */
const CONFIG_PADRAO: EstadoConfigSistema = {
  dataInicial: DATA_INICIAL_PADRAO,
  carregando: false,
};

const ConfigSistemaContext = createContext<EstadoConfigSistema>(CONFIG_PADRAO);

export function ConfigSistemaProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const { autenticado } = useAuth();
  const [dataInicial, setDataInicial] = useState<string>(DATA_INICIAL_PADRAO);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    // Só busca quando há sessão; ao sair, volta ao default.
    if (!autenticado) {
      setDataInicial(DATA_INICIAL_PADRAO);
      setCarregando(false);
      return;
    }

    let ativo = true;
    setCarregando(true);
    (async () => {
      try {
        const { dataInicial: iso } =
          await configSistemaService.obterDataInicial();
        if (ativo && iso) {
          setDataInicial(iso);
        }
      } catch {
        // Falha de rede/erro: mantém o default para não travar os seletores.
        if (ativo) {
          setDataInicial(DATA_INICIAL_PADRAO);
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
  }, [autenticado]);

  const valor = useMemo<EstadoConfigSistema>(
    () => ({ dataInicial, carregando }),
    [dataInicial, carregando],
  );

  return (
    <ConfigSistemaContext.Provider value={valor}>
      {children}
    </ConfigSistemaContext.Provider>
  );
}

/**
 * Acesso à configuração do sistema. Fora de um `ConfigSistemaProvider`, devolve
 * o default seguro (data inicial padrão), pois trata-se de uma melhoria de UX.
 */
export function useConfigSistema(): EstadoConfigSistema {
  return useContext(ConfigSistemaContext);
}
