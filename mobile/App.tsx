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
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { ConfigSistemaProvider } from './src/config/ConfigSistemaContext';
import { OfflineProvider } from './src/offline/OfflineContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { cores } from './src/theme';
import { useProtecaoTela } from './src/utils/protecaoTela';

/**
 * Na WEB (notebook/PC e mobile), fixa a RAIZ do app à altura VISÍVEL da janela
 * e impede o `body` de rolar (overflow hidden). Assim só o conteúdo interno
 * rola: o header (topo) e a barra de abas (base) ficam FIXOS. No app nativo
 * nada disso se aplica.
 *
 * A altura visível dinâmica (100dvh) é aplicada no PRÓPRIO #root via CSS; aqui o
 * app só preenche o pai com height 100% (mais confiável no mobile do que somar
 * 100dvh em níveis diferentes, que estava cortando a barra inferior).
 */
const estiloRaizWeb: ViewStyle | undefined =
  Platform.OS === 'web' ? ({ height: '100%' } as unknown as ViewStyle) : undefined;

// Trava a rolagem da página (apenas web). Tipagem mínima do `document` para não
// depender da lib DOM no tsconfig.
type EstiloMin = Partial<{ height: string; margin: string; overflow: string }>;
type DocumentoMin = {
  documentElement: { style: EstiloMin };
  body: { style: EstiloMin };
  getElementById: (id: string) => { style: EstiloMin } | null;
};
const docWeb = (globalThis as { document?: DocumentoMin }).document;
if (Platform.OS === 'web' && docWeb) {
  docWeb.documentElement.style.height = '100%';
  docWeb.documentElement.style.overflow = 'hidden';
  docWeb.body.style.height = '100%';
  docWeb.body.style.margin = '0';
  docWeb.body.style.overflow = 'hidden';
  const raiz = docWeb.getElementById('root');
  if (raiz) {
    // Altura VISÍVEL real do navegador. Usamos 100svh (small viewport height):
    // corresponde à área visível COM a barra do navegador presente, então a
    // barra de abas inferior nunca fica cortada. Fallback para vh em navegadores
    // antigos (a 2ª atribuição é ignorada se 'svh' não existir).
    raiz.style.height = '100vh';
    raiz.style.height = '100svh';
    raiz.style.overflow = 'hidden';
  }
}

export default function App(): React.ReactElement {
  // Bloqueia/dissuade capturas de tela (conteúdo interno e confidencial).
  useProtecaoTela();

  // Fonte Inter (corpo/UI) + Plus Jakarta Sans (marca e títulos — visual mais
  // "convincente"/arredondado, no estilo dos SaaS premium).
  const [fontesCarregadas, erroFontes] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Enquanto carrega (e sem erro), mostra um fundo na cor da marca. Em caso de
  // erro, segue em frente com a fonte do sistema (não bloqueia o app).
  if (!fontesCarregadas && !erroFontes) {
    return (
      <View style={[{ flex: 1, backgroundColor: cores.primaria }, estiloRaizWeb]} />
    );
  }

  return (
    <SafeAreaProvider style={estiloRaizWeb}>
      <StatusBar style="light" />
      <AuthProvider>
        <ConfigSistemaProvider>
          <OfflineProvider>
            <RootNavigator />
          </OfflineProvider>
        </ConfigSistemaProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
