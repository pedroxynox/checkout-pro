/**
 * Componente raiz do app Check-out PRO.
 *
 * Compõe os provedores globais (área segura e autenticação) ao redor do
 * navegador raiz, que alterna entre o login e o app conforme a sessão.
 */
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { OfflineProvider } from './src/offline/OfflineContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useProtecaoTela } from './src/utils/protecaoTela';

export default function App(): React.ReactElement {
  // Bloqueia/dissuade capturas de tela (conteúdo interno e confidencial).
  useProtecaoTela();

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <OfflineProvider>
          <RootNavigator />
        </OfflineProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
