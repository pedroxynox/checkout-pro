/**
 * Barra de abas inferior do app autenticado.
 *
 * Abas: Início (Home), Tarefas (pendências do dia, com selo), [Ponto central],
 * Notificações (com selo) e Perfil.
 *
 * O botão central é o **Ponto** — elevado, com degradê e ícone de câmera. Ao
 * tocar, abre direto a câmera do leitor de ponto (tela Relógio Ponto). As telas
 * de módulo continuam na pilha (AppNavigator), empurradas por cima das abas.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, Camera, ClipboardList, Home as HomeIcon, User } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { useNotificacoes } from '../notificacoes/NotificacoesContext';
import { HomeScreen } from '../screens/HomeScreen';
import { NotificacoesScreen } from '../screens/notificacoes/NotificacoesScreen';
import { PerfilScreen } from '../screens/perfil/PerfilScreen';
import { TarefasScreen } from '../screens/tarefas/TarefasScreen';
import { usePulsoDoDia } from '../screens/centroDeMando/usePulsoDoDia';
import { cores, gradientes } from '../theme';
import { MainTabParamList, RootStackParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Botão central elevado: abre a câmera do leitor de ponto (Relógio Ponto). */
function BotaoPonto({ onAbrir }: { onAbrir: () => void }): React.ReactElement {
  return (
    <View style={styles.pontoContainer} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ler ponto pela câmera"
        onPress={onAbrir}
        style={({ pressed }) => [styles.pontoPressable, pressed && styles.pontoPress]}
      >
        <LinearGradient
          colors={gradientes.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pontoCirculo}
        >
          <Camera size={24} color={cores.textoInverso} />
        </LinearGradient>
        <Text style={styles.pontoLabel}>Ponto</Text>
      </Pressable>
    </View>
  );
}

/** Slot vazio da aba central: o Ponto não é uma aba, navega para o leitor. */
function TelaVazia(): null {
  return null;
}

export function MainTabs(): React.ReactElement {
  const { perfil, podeAcessar } = useAuth();
  const { naoLidas } = useNotificacoes();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Botão central: abre a câmera do leitor de ponto. Nonce (timestamp) para
  // reabrir a câmera mesmo em toques repetidos.
  const abrirLeitorPonto = () =>
    navigation.navigate('RegistroPonto', { abrirScanner: Date.now() });
  // Selo de pendências na aba Tarefas (defensivo, por regras).
  const { totalPendencias } = usePulsoDoDia(perfil, podeAcessar);
  // Respeita a área segura inferior (barra de gestos no Android/iOS e a barra
  // do navegador na web) para que os rótulos não fiquem cortados no pé.
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: cores.primaria },
        headerTintColor: cores.textoInverso,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: '#0A3D91',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: cores.superficie,
          // Cantos superiores arredondados + sombra muito suave (visual premium).
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 6,
          // Na web a área visível já é controlada por 100svh no #root, então NÃO
          // somamos insets (evita inflar a barra e cortá-la). No nativo, soma o
          // inset inferior (gestos/notch).
          height: Platform.OS === 'web' ? 74 : 74 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'web' ? 14 : insets.bottom + 14,
          shadowColor: '#0A3D91',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 16,
          elevation: 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', lineHeight: 14 },
        tabBarIconStyle: { marginTop: 2 },
        tabBarBadgeStyle: {
          backgroundColor: cores.vermelho,
          color: cores.textoInverso,
          fontSize: 10,
          fontWeight: '700',
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: cores.superficie,
        },
      }}
    >
      <Tab.Screen
        name="Inicio"
        component={HomeScreen}
        options={{
          headerShown: false,
          title: 'Início',
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Tarefas"
        component={TarefasScreen}
        options={{
          title: 'Tarefas',
          tabBarBadge: totalPendencias > 0 ? totalPendencias : undefined,
          tabBarIcon: ({ color, size }) => (
            <ClipboardList color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Mensagens"
        component={TelaVazia}
        options={{
          headerShown: false,
          title: 'Ponto',
          tabBarButton: () => <BotaoPonto onAbrir={abrirLeitorPonto} />,
        }}
      />
      <Tab.Screen
        name="Notificacoes"
        component={NotificacoesScreen}
        options={{
          title: 'Notificações',
          tabBarBadge: naoLidas > 0 ? (naoLidas > 99 ? '99+' : naoLidas) : undefined,
          tabBarIcon: ({ color, size }) => <Bell color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Perfil"
        component={PerfilScreen}
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  pontoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pontoPressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pontoPress: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  pontoCirculo: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    // Sobressai ~35% acima da barra (mantém a posição central atual).
    marginTop: -20,
    borderWidth: 4,
    borderColor: cores.superficie,
    shadowColor: '#0A3D91',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 22,
    elevation: 10,
  },
  pontoLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    fontWeight: '600',
    color: '#0A3D91',
    marginTop: 4,
  },
});

export default MainTabs;
