/**
 * Componente raiz do app Check-out PRO.
 *
 * Compõe os provedores globais (área segura e autenticação) ao redor do
 * navegador raiz, que alterna entre o login e o app conforme a sessão.
 *
 * Carrega a fonte Inter (identidade visual SaaS). O carregamento é DEFENSIVO:
 * se as fontes não carregarem por algum motivo, o app ainda abre (cai para a
 * fonte do sistema) — nunca trava numa tela em branco.
 */
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { OfflineProvider } from './src/offline/OfflineContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { cores } from './src/theme';
import { useProtecaoTela } from './src/utils/protecaoTela';

export default function App(): React.ReactElement {
  // Bloqueia/dissuade capturas de tela (conteúdo interno e confidencial).
  useProtecaoTela();

  // Fonte Inter (pesos usados pela tipografia do tema).
  const [fontesCarregadas, erroFontes] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Enquanto carrega (e sem erro), mostra um fundo na cor da marca. Em caso de
  // erro, segue em frente com a fonte do sistema (não bloqueia o app).
  if (!fontesCarregadas && !erroFontes) {
    return <View style={{ flex: 1, backgroundColor: cores.primaria }} />;
  }

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
