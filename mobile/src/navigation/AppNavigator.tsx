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
import { MainTabs } from './MainTabs';
import { ImportacoesScreen } from '../screens/importacoes/ImportacoesScreen';
import { FechamentoScreen } from '../screens/fechamento/FechamentoScreen';
import { IndicadoresScreen } from '../screens/indicadores/IndicadoresScreen';
import { IndicadorDetalheScreen } from '../screens/indicadores/IndicadorDetalheScreen';
import { PainelVendasScreen } from '../screens/indicadores/PainelVendasScreen';
import { LoteApaeScreen } from '../screens/loteApae/LoteApaeScreen';
import { InsumosScreen } from '../screens/insumos/InsumosScreen';
import { InsumoDetalheScreen } from '../screens/insumos/InsumoDetalheScreen';
import { RequisicoesScreen } from '../screens/insumos/RequisicoesScreen';
import { JornadaFiscaisScreen } from '../screens/fiscais/JornadaFiscaisScreen';
import { RegistroPontoScreen } from '../screens/ponto/RegistroPontoScreen';
import { CentralJornadaScreen } from '../screens/ponto/CentralJornadaScreen';
import { InconsistenciasScreen } from '../screens/ponto/InconsistenciasScreen';
import { ExportarCicloScreen } from '../screens/ponto/ExportarCicloScreen';
import { FeriadosScreen } from '../screens/ponto/FeriadosScreen';
import { ChecklistScreen } from '../screens/checklist/ChecklistScreen';
import { OperadoresScreen } from '../screens/operadores/OperadoresScreen';
import { JustificativasScreen } from '../screens/operadores/JustificativasScreen';
import { ColaboradoresScreen } from '../screens/colaboradores/ColaboradoresScreen';
import { ContratosScreen } from '../screens/contratos/ContratosScreen';
import { SancoesScreen } from '../screens/colaboradores/SancoesScreen';
import { GestaoColaboradoresScreen } from '../screens/colaboradores/GestaoColaboradoresScreen';
import { PerfilColaboradorScreen } from '../screens/colaboradores/PerfilColaboradorScreen';
import { CentroControleScreen } from '../screens/centroControle/CentroControleScreen';
import { ConfigEscalaDomingoScreen } from '../screens/centroControle/ConfigEscalaDomingoScreen';
import { CentralVendasScreen } from '../screens/centroControle/CentralVendasScreen';
import { RelatoriosScreen } from '../screens/relatorios/RelatoriosScreen';
import { MetasScreen } from '../screens/metas/MetasScreen';
import { NaoReconhecidosScreen } from '../screens/indicadores/NaoReconhecidosScreen';
import { InsumosDadosScreen } from '../screens/centroControle/InsumosDadosScreen';
import { ReiniciarDadosScreen } from '../screens/centroControle/ReiniciarDadosScreen';
import { TiposContratoScreen } from '../screens/centroControle/TiposContratoScreen';
import { UsuariosScreen } from '../screens/usuarios/UsuariosScreen';
import { CheckOutsScreen } from '../screens/checkouts/CheckOutsScreen';
import { CheckOutDetalheScreen } from '../screens/checkouts/CheckOutDetalheScreen';
import { CheckOutsConfigScreen } from '../screens/checkouts/CheckOutsConfigScreen';
import { PermissoesScreen } from '../screens/permissoes/PermissoesScreen';
import { PermissoesUsuarioScreen } from '../screens/permissoes/PermissoesUsuarioScreen';
import { PermissoesHistoricoScreen } from '../screens/permissoes/PermissoesHistoricoScreen';
import { PermissoesPerfisScreen } from '../screens/permissoes/PermissoesPerfisScreen';
import { PermissoesPerfilScreen } from '../screens/permissoes/PermissoesPerfilScreen';
import { AlertasFilaScreen } from '../screens/alertasFila/AlertasFilaScreen';
import { NormativasScreen } from '../screens/normativas/NormativasScreen';
import { IndicadorQuebraScreen } from '../screens/quebra/IndicadorQuebraScreen';
import { cores } from '../theme';
import { ROTULO_TIPO_ARRECADACAO } from '../utils/rotulos';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator(): React.ReactElement {
  const { podeAcessar } = useAuth();

  return (
    <Stack.Navigator
      initialRouteName="Tabs"
      screenOptions={{
        headerStyle: { backgroundColor: cores.primaria },
        headerTintColor: cores.textoInverso,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: cores.fundo },
      }}
    >
      <Stack.Screen
        name="Tabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />

      {podeAcessar('IMPORTACOES') && (
        <Stack.Screen
          name="Importacoes"
          component={ImportacoesScreen}
          options={{ title: 'Importações' }}
        />
      )}
      {podeAcessar('FECHAMENTO') && (
        <Stack.Screen
          name="Fechamento"
          component={FechamentoScreen}
          options={{ title: 'Fechamento' }}
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
          <Stack.Screen
            name="Requisicoes"
            component={RequisicoesScreen}
            options={{ title: 'Requisições' }}
          />
        </>
      )}
      {podeAcessar('FISCAIS_JORNADA') && (
        <Stack.Screen
          name="JornadaFiscais"
          component={JornadaFiscaisScreen}
          options={{ title: 'Jornada da equipe' }}
        />
      )}
      {podeAcessar('PONTO_VISUALIZAR') && (
        <Stack.Screen
          name="RegistroPonto"
          component={RegistroPontoScreen}
          options={{ title: 'Relógio Ponto' }}
        />
      )}
      {podeAcessar('CENTRAL_JORNADA') && (
        <Stack.Screen
          name="CentralJornada"
          component={CentralJornadaScreen}
          options={{ title: 'Central de Jornada' }}
        />
      )}
      {podeAcessar('CENTRAL_JORNADA') && (
        <Stack.Screen
          name="Inconsistencias"
          component={InconsistenciasScreen}
          options={{ title: 'Inconsistências' }}
        />
      )}
      {podeAcessar('CENTRAL_JORNADA') && (
        <Stack.Screen
          name="ExportarCiclo"
          component={ExportarCicloScreen}
          options={{ title: 'Revisar / fechar ciclo' }}
        />
      )}
      {podeAcessar('CENTRAL_JORNADA') && (
        <Stack.Screen
          name="Feriados"
          component={FeriadosScreen}
          options={{ title: 'Feriados' }}
        />
      )}
      {podeAcessar('CHECKLIST') && (
        <Stack.Screen
          name="Checklist"
          component={ChecklistScreen}
          options={{ title: 'Checklist' }}
        />
      )}
      {podeAcessar('CHECKOUTS') && (
        <>
          <Stack.Screen
            name="CheckOuts"
            component={CheckOutsScreen}
            options={{ title: 'Check-Outs' }}
          />
          <Stack.Screen
            name="CheckOutDetalhe"
            component={CheckOutDetalheScreen}
            options={{ title: 'Check-out' }}
          />
        </>
      )}
      {podeAcessar('OPERADORES_AUSENCIAS') && (
        <Stack.Screen
          name="Operadores"
          component={OperadoresScreen}
          options={{ title: 'Escalas' }}
        />
      )}
      {podeAcessar('OPERADORES_AUSENCIAS') && (
        <Stack.Screen
          name="Justificativas"
          component={JustificativasScreen}
          options={{ title: 'Justificativas' }}
        />
      )}
      {podeAcessar('OPERADORES_AUSENCIAS') && (
        <Stack.Screen
          name="Colaboradores"
          component={ColaboradoresScreen}
          options={{ title: 'Colaboradores' }}
        />
      )}
      {podeAcessar('OPERADORES_AUSENCIAS') && (
        <Stack.Screen
          name="PerfilColaborador"
          component={PerfilColaboradorScreen}
          options={{ title: 'Perfil do colaborador' }}
        />
      )}
      {podeAcessar('CONTRATOS_VISUALIZAR') && (
        <Stack.Screen
          name="Contratos"
          component={ContratosScreen}
          options={{ title: 'Contratos' }}
        />
      )}
      {podeAcessar('ESCALA_VISUALIZAR') && (
        <Stack.Screen
          name="Sancoes"
          component={SancoesScreen}
          options={{ title: 'Sanções' }}
        />
      )}
      {podeAcessar('OPERADORES_CRUD') && (
        <>
          <Stack.Screen
            name="CentroControle"
            component={CentroControleScreen}
            options={{ title: 'Centro de Controle' }}
          />
          <Stack.Screen
            name="GestaoColaboradores"
            component={GestaoColaboradoresScreen}
            options={{ title: 'Colaboradores (gestão)' }}
          />
          <Stack.Screen
            name="Relatorios"
            component={RelatoriosScreen}
            options={{ title: 'Relatórios' }}
          />
          <Stack.Screen
            name="Metas"
            component={MetasScreen}
            options={{ title: 'Metas' }}
          />
          <Stack.Screen
            name="CentralVendas"
            component={CentralVendasScreen}
            options={{ title: 'Central de Vendas' }}
          />
          <Stack.Screen
            name="NaoReconhecidos"
            component={NaoReconhecidosScreen}
            options={{ title: 'Não reconhecidos' }}
          />
          <Stack.Screen
            name="CheckOutsConfig"
            component={CheckOutsConfigScreen}
            options={{ title: 'Check-Outs' }}
          />
        </>
      )}
      {podeAcessar('ESCALA_DOMINGO_CONFIG') && (
        <Stack.Screen
          name="ConfigEscalaDomingo"
          component={ConfigEscalaDomingoScreen}
          options={{ title: 'Rodízio de domingo' }}
        />
      )}
      {podeAcessar('USUARIOS_CRUD') && (
        <Stack.Screen
          name="Usuarios"
          component={UsuariosScreen}
          options={{ title: 'Acesso' }}
        />
      )}
      {podeAcessar('PERMISSOES_GERENCIAR') && (
        <>
          <Stack.Screen
            name="Permissoes"
            component={PermissoesScreen}
            options={{ title: 'Permissões' }}
          />
          <Stack.Screen
            name="PermissoesUsuario"
            component={PermissoesUsuarioScreen}
            options={{ title: 'Permissões do login' }}
          />
          <Stack.Screen
            name="PermissoesHistorico"
            component={PermissoesHistoricoScreen}
            options={{ title: 'Histórico de permissões' }}
          />
          <Stack.Screen
            name="PermissoesPerfis"
            component={PermissoesPerfisScreen}
            options={{ title: 'Padrões por perfil' }}
          />
          <Stack.Screen
            name="PermissoesPerfil"
            component={PermissoesPerfilScreen}
            options={{ title: 'Padrão do perfil' }}
          />
        </>
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
      {podeAcessar('ADMIN_DADOS') && (
        <>
          <Stack.Screen
            name="InsumosDados"
            component={InsumosDadosScreen}
            options={{ title: 'Insumos' }}
          />
          <Stack.Screen
            name="ReiniciarDados"
            component={ReiniciarDadosScreen}
            options={{ title: 'Zerar dados operacionais' }}
          />
          <Stack.Screen
            name="TiposContrato"
            component={TiposContratoScreen}
            options={{ title: 'Tipos de contrato' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

export default AppNavigator;
