/**
 * Placeholder de seção "em desenvolvimento". Usado por novas áreas que ainda
 * serão construídas, mantendo a navegação e a identidade visual.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tela } from './Tela';
import { cores, espacamento, raio, tipografia } from '../theme';

interface Props {
  titulo: string;
  descricao: string;
  icone: keyof typeof Ionicons.glyphMap;
}

export function EmDesenvolvimento({
  titulo,
  descricao,
  icone,
}: Props): React.ReactElement {
  return (
    <Tela>
      <View style={styles.box}>
        <View style={styles.iconeBox}>
          <Ionicons name={icone} size={44} color={cores.primaria} />
        </View>
        <Text style={styles.titulo}>{titulo}</Text>
        <Text style={styles.descricao}>{descricao}</Text>
        <View style={styles.tag}>
          <Text style={styles.tagTexto}>Em breve</Text>
        </View>
      </View>
    </Tela>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingTop: espacamento.xxl, paddingHorizontal: espacamento.lg },
  iconeBox: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espacamento.lg,
  },
  titulo: { ...tipografia.titulo, color: cores.texto, textAlign: 'center' },
  descricao: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: espacamento.sm,
  },
  tag: {
    marginTop: espacamento.xl,
    backgroundColor: cores.primariaClara,
    borderRadius: raio.pill,
    paddingHorizontal: espacamento.lg,
    paddingVertical: espacamento.xs,
  },
  tagTexto: { ...tipografia.rotulo, color: cores.primaria },
});

export default EmDesenvolvimento;
