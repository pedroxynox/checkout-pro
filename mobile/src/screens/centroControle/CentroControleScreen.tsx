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
import { PropsTela, RotaApp } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';

interface ItemControle {
  rota: RotaApp;
  titulo: string;
  descricao: string;
  icone: keyof typeof Ionicons.glyphMap;
}

const ITENS: ItemControle[] = [
  {
    rota: 'GestaoColaboradores',
    titulo: 'Colaboradores',
    descricao: 'Cadastrar e editar operadores e fiscais',
    icone: 'id-card-outline',
  },
];

export function CentroControleScreen({
  navigation,
}: PropsTela<'CentroControle'>): React.ReactElement {
  return (
    <Tela>
      <Text style={styles.intro}>
        Ferramentas de gestão. Apenas o gestor tem acesso a esta área.
      </Text>
      {ITENS.map((item) => (
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
