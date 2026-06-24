/**
 * Barra de abas inferior do app autenticado.
 *
 * Abas: Início (Home), Tarefas (pendências do dia, com selo), Mensagens (chat
 * da Cluby) e Perfil. As telas de módulo continuam na pilha (AppNavigator) e
 * são empurradas POR CIMA das abas ao navegar a partir do Início.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  ClipboardList,
  Home as HomeIcon,
  MessageCircle,
  User,
} from 'lucide-react-native';
import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { HomeScreen } from '../screens/HomeScreen';
import { MensagensScreen } from '../screens/mensagens/MensagensScreen';
import { PerfilScreen } from '../screens/perfil/PerfilScreen';
import { TarefasScreen } from '../screens/tarefas/TarefasScreen';
import { usePulsoDoDia } from '../screens/centroDeMando/usePulsoDoDia';
import { cores } from '../theme';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs(): React.ReactElement {
  const { perfil, podeAcessar } = useAuth();
  // Selo de pendências na aba Tarefas (defensivo, por regras).
  const { totalPendencias } = usePulsoDoDia(perfil, podeAcessar);

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
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
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
          title: 'Mensagens',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} />
          ),
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

export default MainTabs;
