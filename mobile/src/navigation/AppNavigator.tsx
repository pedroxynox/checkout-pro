/**
 * Pilha de navegação do app autenticado.
 *
 * Registra a Home e cada tela de módulo. Embora a Home só exiba as áreas
 * permitidas ao perfil (Req 7.2.2–7.2.4), as rotas das áreas restritas ao
 * gerente (ex.: Operadores) só são incluídas na pilha quando o usuário tem
 * acesso — uma camada extra de defesa para o perfil fiscal. A autorização
 * definitiva permanece no backend.
 */
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { HomeScreen } from '../screens/HomeScreen';
import { ImportacoesScreen } from '../screens/importacoes/ImportacoesScreen';
import { IndicadoresScreen } from '../screens/indicadores/IndicadoresScreen';
import { IndicadorDetalheScreen } from '../screens/indicadores/IndicadorDetalheScreen';
import { PainelVendasScreen } from '../screens/indicadores/PainelVendasScreen';
import { LoteApaeScreen } from '../screens/loteApae/LoteApaeScreen';
import { InsumosScreen } from '../screens/insumos/InsumosScreen';
import { InsumoDetalheScreen } from '../screens/insumos/InsumoDetalheScreen';
import { FiscaisScreen } from '../screens/fiscais/FiscaisScreen';
import { EscalaScreen } from '../screens/fiscais/EscalaScreen';
import { ChecklistScreen } from '../screens/checklist/ChecklistScreen';
import { OperadoresScreen } from '../screens/operadores/OperadoresScreen';
import { UsuariosScreen } from '../screens/usuarios/UsuariosScreen';
import { AlertasFilaScreen } from '../screens/alertasFila/AlertasFilaScreen';
import { NormativasScreen } from '../screens/normativas/NormativasScreen';
import { IndicadorQuebraScreen } from '../screens/quebra/IndicadorQuebraScreen';
import { NotificacoesScreen } from '../screens/notificacoes/NotificacoesScreen';
import { cores } from '../theme';
import { ROTULO_TIPO_ARRECADACAO } from '../utils/rotulos';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator(): React.ReactElement {
  const { podeAcessar } = useAuth();

  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: cores.primaria },
        headerTintColor: cores.textoInverso,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: cores.fundo },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />

      {podeAcessar('IMPORTACOES') && (
        <Stack.Screen
          name="Importacoes"
          component={ImportacoesScreen}
          options={{ title: 'Importações' }}
        />
      )}
      {podeAcessar('INDICADORES_VISUALIZAR') && (
        <>
          <Stack.Screen
            name="Indicadores"
            component={IndicadoresScreen}
            options={{ title: 'Indicadores' }}
          />
          <Stack.Screen
            name="IndicadorDetalhe"
            component={IndicadorDetalheScreen}
            options={({ route }) => ({
              title: ROTULO_TIPO_ARRECADACAO[route.params.tipo] ?? 'Indicador',
            })}
          />
        </>
      )}
      {podeAcessar('PAINEL_VENDAS_VISUALIZAR') && (
        <Stack.Screen
          name="PainelVendas"
          component={PainelVendasScreen}
          options={{ title: 'Painel de Vendas' }}
        />
      )}
      {podeAcessar('LOTE_APAE') && (
        <Stack.Screen
          name="LoteApae"
          component={LoteApaeScreen}
          options={{ title: 'Sacolas APAE' }}
        />
      )}
      {podeAcessar('INSUMOS') && (
        <>
          <Stack.Screen
            name="Insumos"
            component={InsumosScreen}
            options={{ title: 'Insumos' }}
          />
          <Stack.Screen
            name="InsumoDetalhe"
            component={InsumoDetalheScreen}
            options={{ title: 'Insumo' }}
          />
        </>
      )}
      {podeAcessar('FISCAIS_STATUS') && (
        <Stack.Screen
          name="Fiscais"
          component={FiscaisScreen}
          options={{ title: 'Fiscais' }}
        />
      )}
      {podeAcessar('ESCALA_VISUALIZAR') && (
        <Stack.Screen
          name="Escala"
          component={EscalaScreen}
          options={{ title: 'Escala' }}
        />
      )}
      {podeAcessar('CHECKLIST') && (
        <Stack.Screen
          name="Checklist"
          component={ChecklistScreen}
          options={{ title: 'Checklist' }}
        />
      )}
      {podeAcessar('OPERADORES_AUSENCIAS') && (
        <Stack.Screen
          name="Operadores"
          component={OperadoresScreen}
          options={{ title: 'Operadores e Ausências' }}
        />
      )}
      {podeAcessar('USUARIOS_CRUD') && (
        <Stack.Screen
          name="Usuarios"
          component={UsuariosScreen}
          options={{ title: 'Pessoas e Acessos' }}
        />
      )}
      {podeAcessar('NOTIFICACOES') && (
        <Stack.Screen
          name="Notificacoes"
          component={NotificacoesScreen}
          options={{ title: 'Notificações' }}
        />
      )}
      {podeAcessar('ALERTAS_FILA') && (
        <Stack.Screen
          name="AlertasFila"
          component={AlertasFilaScreen}
          options={{ title: 'Alertas de Fila' }}
        />
      )}
      {podeAcessar('NORMATIVAS') && (
        <Stack.Screen
          name="Normativas"
          component={NormativasScreen}
          options={{ title: 'Normativas' }}
        />
      )}
      {podeAcessar('INDICADOR_QUEBRA') && (
        <Stack.Screen
          name="IndicadorQuebra"
          component={IndicadorQuebraScreen}
          options={{ title: 'Indicador de Quebra' }}
        />
      )}
    </Stack.Navigator>
  );
}

export default AppNavigator;
