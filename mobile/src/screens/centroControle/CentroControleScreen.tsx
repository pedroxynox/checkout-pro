/**
 * Centro de Controle — área de gestão (apenas gestor, OPERADORES_CRUD).
 *
 * Hub das ferramentas de gestão estrutural (colaboradores, metas, vendas,
 * acessos, importações, dados…). Pensado para crescer sem mexer nas seções
 * gerais do app. Também abriga atalhos de áreas que saíram temporariamente da
 * Home (hoje, o Painel de Vendas).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Tela } from '../../components';
import { useAuth } from '../../auth/AuthContext';
import { PropsTela, RotaApp } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';

interface ItemControle {
  rota: RotaApp;
  titulo: string;
  descricao: string;
  icone: keyof typeof Ionicons.glyphMap;
  /** Funcionalidade necessária para ver a card (opcional). */
  funcionalidade?: string;
}

const ITENS: ItemControle[] = [
  {
    rota: 'GestaoColaboradores',
    titulo: 'Colaboradores',
    descricao: 'Cadastrar e editar operadores, fiscais e gerentes',
    icone: 'id-card-outline',
  },
  {
    rota: 'Metas',
    titulo: 'Metas',
    descricao: 'Definir as metas de cada indicador por mês',
    icone: 'flag-outline',
  },
  {
    rota: 'ConfigEscalaDomingo',
    titulo: 'Rodízio de domingo',
    descricao: 'Ponto de partida do rodízio de grupos (G1/G2/G3) no domingo',
    icone: 'calendar-outline',
    funcionalidade: 'ESCALA_DOMINGO_CONFIG',
  },
  // As duas cards de vendas ficam lado a lado e com descrições que deixam
  // clara a diferença: o Painel ACOMPANHA o realizado; a Central PLANEJA as
  // estimativas. O Painel saiu temporariamente da Home (`ocultoNaHome` em
  // `navigation/areas`) e é acessado por aqui.
  {
    rota: 'PainelVendas',
    titulo: 'Painel de Vendas',
    descricao: 'Acompanhar o vendido: dia, acumulado do mês e meta',
    icone: 'stats-chart-outline',
    funcionalidade: 'PAINEL_VENDAS_VISUALIZAR',
  },
  {
    rota: 'CentralVendas',
    titulo: 'Central de Vendas',
    descricao: 'Planejar as estimativas de venda por dia (a do mês é a soma das diárias)',
    icone: 'cash-outline',
  },
  {
    rota: 'CheckOutsConfig',
    titulo: 'Check-Outs',
    descricao: 'Definir quantas caixas (check-outs) existem na loja',
    icone: 'desktop-outline',
  },
  {
    rota: 'Relatorios',
    titulo: 'Relatórios',
    descricao: 'Baixar relatórios dos operadores em PDF (semana ou período)',
    icone: 'document-text-outline',
    // O relatório é montado a partir da ficha individual de cada operador
    // (dado confidencial), então segue a mesma permissão do perfil.
    funcionalidade: 'COLABORADORES_PERFIL',
  },
  {
    rota: 'Usuarios',
    titulo: 'Acesso',
    descricao: 'Quem tem acesso ao app, redefinir senha e revogar',
    icone: 'key-outline',
    funcionalidade: 'USUARIOS_CRUD',
  },
  {
    rota: 'Permissoes',
    titulo: 'Permissões',
    descricao: 'Conceder ou remover permissões por login',
    icone: 'shield-checkmark-outline',
    funcionalidade: 'PERMISSOES_GERENCIAR',
  },
  {
    rota: 'Importacoes',
    titulo: 'Importações',
    descricao: 'Carregar os arquivos do dia',
    icone: 'cloud-upload-outline',
    funcionalidade: 'IMPORTACOES',
  },
  {
    rota: 'ProdutosPesadosCarga',
    titulo: 'Produtos pesados',
    descricao: 'Carregar o arquivo .txt com os códigos de balança',
    icone: 'barcode-outline',
    funcionalidade: 'PRODUTOS_PESADOS_GERENCIAR',
  },
  {
    rota: 'TiposContrato',
    titulo: 'Tipos de contrato',
    descricao: 'Criar e ativar contratos de jornada (5x2, 6h/dia…) e suas regras',
    icone: 'briefcase-outline',
    funcionalidade: 'ADMIN_DADOS',
  },
  {
    rota: 'InsumosDados',
    titulo: 'Insumos',
    descricao: 'Zerar estoque e limpar histórico de requisições',
    icone: 'cube-outline',
    funcionalidade: 'ADMIN_DADOS',
  },
  {
    rota: 'ConferenciaEscala',
    titulo: 'Conferência de escala',
    descricao:
      'Onde a ficha e a escala semanal discordam, e quem seria afetado ao acertar',
    icone: 'git-compare-outline',
    funcionalidade: 'OPERADORES_CRUD',
  },
  {
    rota: 'ReiniciarDados',
    titulo: 'Zerar dados operacionais',
    descricao: 'Reiniciar o sistema: apagar os dados de movimento (mantém os cadastros)',
    icone: 'refresh-outline',
    funcionalidade: 'ADMIN_DADOS',
  },
];

export function CentroControleScreen({
  navigation,
}: PropsTela<'CentroControle'>): React.ReactElement {
  const { podeAcessar } = useAuth();
  const itens = ITENS.filter(
    (i) => !i.funcionalidade || podeAcessar(i.funcionalidade),
  );
  return (
    <Tela>
      <Text style={styles.intro}>
        Ferramentas de gestão. Apenas o gestor tem acesso a esta área.
      </Text>
      {itens.map((item) => (
        <TouchableOpacity
          key={item.rota}
          activeOpacity={0.7}
          onPress={() => navigation.navigate(item.rota as never)}
          style={styles.card}
        >
          <View style={styles.icone}>
            <Ionicons name={item.icone} size={24} color={cores.primaria} />
          </View>
          <View style={styles.info}>
            <Text style={styles.titulo}>{item.titulo}</Text>
            <Text style={styles.descricao}>{item.descricao}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={cores.textoSecundario} />
        </TouchableOpacity>
      ))}
    </Tela>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    padding: espacamento.md,
    marginBottom: espacamento.sm,
    borderWidth: 1,
    borderColor: cores.divisor,
  },
  icone: {
    width: 48,
    height: 48,
    borderRadius: raio.md,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, paddingHorizontal: espacamento.md },
  titulo: { ...tipografia.subtitulo, color: cores.texto },
  descricao: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 2 },
});

export default CentroControleScreen;
