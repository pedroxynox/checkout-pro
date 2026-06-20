/**
 * Navegador raiz: decide entre o fluxo de login e o app autenticado conforme o
 * estado do `AuthContext`. Enquanto a sessão é restaurada do armazenamento
 * seguro, exibe um indicador de carregamento.
 */
import {
  DefaultTheme,
  NavigationContainer,
  Theme,
} from '@react-navigation/native';
import React from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AssistenteFlutuante, Carregando } from '../components';
import { LoginScreen } from '../screens/LoginScreen';
import { cores } from '../theme';
import { AppNavigator } from './AppNavigator';

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
    <NavigationContainer theme={temaNavegacao}>
      {autenticado ? (
        <>
          <AppNavigator />
          <AssistenteFlutuante />
        </>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}

export default RootNavigator;
