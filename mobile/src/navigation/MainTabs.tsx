/**
 * Barra de abas inferior do app autenticado.
 *
 * Abas: Início (Home), Tarefas (pendências do dia, com selo), [Cluby central],
 * Notificações (com selo) e Perfil.
 *
 * O botão central é a **Cluby** — elevado, com degradê e ícone de "sparkles"
 * (sem robô). Ao tocar, abre o chat (tela Mensagens). As telas de módulo
 * continuam na pilha (AppNavigator), empurradas por cima das abas.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  ClipboardList,
  Home as HomeIcon,
  Sparkles,
  User,
} from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { useNotificacoes } from '../notificacoes/NotificacoesContext';
import { HomeScreen } from '../screens/HomeScreen';
import { MensagensScreen } from '../screens/mensagens/MensagensScreen';
import { NotificacoesScreen } from '../screens/notificacoes/NotificacoesScreen';
import { PerfilScreen } from '../screens/perfil/PerfilScreen';
import { TarefasScreen } from '../screens/tarefas/TarefasScreen';
import { usePulsoDoDia } from '../screens/centroDeMando/usePulsoDoDia';
import { cores, gradientes } from '../theme';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Botão central elevado da Cluby (assistente de IA). */
function BotaoCluby(): React.ReactElement {
  const navigation = useNavigation();
  return (
    <View style={styles.clubyContainer} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir a Cluby"
        onPress={() => navigation.navigate('Mensagens' as never)}
        style={({ pressed }) => [styles.clubyPressable, pressed && styles.clubyPress]}
      >
        <LinearGradient
          colors={gradientes.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.clubyCirculo}
        >
          <Sparkles size={24} color={cores.textoInverso} />
        </LinearGradient>
        <Text style={styles.clubyLabel}>Cluby</Text>
      </Pressable>
    </View>
  );
}

export function MainTabs(): React.ReactElement {
  const { perfil, podeAcessar } = useAuth();
  const { naoLidas } = useNotificacoes();
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
        tabBarActiveTintColor: cores.primaria,
        tabBarInactiveTintColor: cores.textoSecundario,
        tabBarStyle: {
          backgroundColor: cores.superficie,
          borderTopColor: cores.divisor,
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
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
        component={MensagensScreen}
        options={{
          headerShown: false,
          title: 'Cluby',
          tabBarButton: () => <BotaoCluby />,
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
  clubyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  clubyPressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubyPress: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  clubyCirculo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    borderWidth: 3,
    borderColor: cores.superficie,
    shadowColor: '#0F4C81',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  clubyLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    fontWeight: '700',
    color: cores.primaria,
    marginTop: 3,
  },
});

export default MainTabs;
