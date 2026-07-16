/**
 * Centro de Controle — área de gestão (apenas gestor, OPERADORES_CRUD).
 *
 * Hub das ferramentas de gestão estrutural. Hoje: "Colaboradores" (cadastro e
 * edição). Pensado para crescer (metas, configurações) sem mexer nas seções
 * gerais do app.
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
  {
    rota: 'CentralVendas',
    titulo: 'Central de Vendas',
    descricao: 'Estimativas de venda por dia (a do mês é a soma das diárias)',
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
    rota: 'InsumosDados',
    titulo: 'Insumos',
    descricao: 'Zerar estoque e limpar histórico de requisições',
    icone: 'cube-outline',
    funcionalidade: 'ADMIN_DADOS',
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
