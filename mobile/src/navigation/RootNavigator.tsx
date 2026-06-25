/**
 * Navegador raiz: decide entre o fluxo de login e o app autenticado conforme o
 * estado do `AuthContext`. Enquanto a sessão é restaurada do armazenamento
 * seguro, exibe um indicador de carregamento.
 */
import {
  DefaultTheme,
  LinkingOptions,
  NavigationContainer,
  Theme,
} from '@react-navigation/native';
import React from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Carregando, ToastNotificacao } from '../components';
import { AssistenteProvider } from '../assistente/AssistenteContext';
import { NotificacoesProvider } from '../notificacoes/NotificacoesContext';
import { LoginScreen } from '../screens/LoginScreen';
import { cores } from '../theme';
import { AppNavigator } from './AppNavigator';
import { RootStackParamList } from './types';

const temaNavegacao: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: cores.primaria,
    background: cores.fundo,
    card: cores.superficie,
    text: cores.texto,
    border: cores.borda,
  },
};

/**
 * Configuração de links/URLs. Na web, faz a pilha de navegação sincronizar com
 * o histórico do navegador: assim, o botão "voltar" do navegador (e o gesto de
 * voltar) retorna à aba anterior do app em vez de sair do site. Cada tela tem
 * sua própria URL.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [],
  config: {
    screens: {
      Tabs: {
        screens: {
          Inicio: '',
          Tarefas: 'tarefas',
          Mensagens: 'mensagens',
          Notificacoes: 'notificacoes',
          Perfil: 'perfil',
        },
      },
      Importacoes: 'importacoes',
      Fechamento: 'fechamento',
      Indicadores: 'indicadores',
      IndicadorDetalhe: 'indicadores/detalhe/:tipo',
      PainelVendas: 'painel-vendas',
      LoteApae: 'lote-apae',
      Insumos: 'insumos',
      InsumoDetalhe: 'insumos/detalhe/:insumoId',
      Requisicoes: 'requisicoes',
      Fiscais: 'fiscais',
      JornadaFiscais: 'fiscais/jornada',
      Checklist: 'checklist',
      Operadores: 'operadores',
      Colaboradores: 'colaboradores',
      Usuarios: 'usuarios',
      AlertasFila: 'alertas-fila',
      Normativas: 'normativas',
      IndicadorQuebra: 'quebra',
      GerenciarDados: 'gerenciar-dados',
    },
  },
};

export function RootNavigator(): React.ReactElement {
  const { carregando, autenticado } = useAuth();

  if (carregando) {
    return (
      <View style={{ flex: 1, backgroundColor: cores.fundo }}>
        <Carregando texto="Carregando o Check-out Pro..." />
      </View>
    );
  }

  return (
    <NavigationContainer theme={temaNavegacao} linking={linking}>
      {autenticado ? (
        <NotificacoesProvider>
          <AssistenteProvider>
            <AppNavigator />
            <ToastNotificacao />
          </AssistenteProvider>
        </NotificacoesProvider>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}

export default RootNavigator;
