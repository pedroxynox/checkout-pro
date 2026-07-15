/**
 * Selo colorido para textos arbitrários (ex.: status de fiscal), com um ponto
 * e o texto na cor informada.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espacamento, raio, tipografia } from '../theme';

/** Selo genérico para textos arbitrários (ex.: status de fiscal). */
export function Selo({
  texto,
  cor,
  fundo,
}: {
  texto: string;
  cor: string;
  fundo: string;
}): React.ReactElement {
  return (
    <View style={[styles.badge, { backgroundColor: fundo }]}>
      <View style={[styles.ponto, { backgroundColor: cor }]} />
      <Text style={[styles.texto, { color: cor }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: espacamento.xs,
    paddingHorizontal: espacamento.sm,
    borderRadius: raio.pill,
  },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: espacamento.xs,
  },
  texto: {
    ...tipografia.legenda,
    fontWeight: '600',
  },
});
