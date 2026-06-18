/** Caixa de aviso informativo (in-app), com ícone e texto em pt-BR. */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme';

type Tom = 'info' | 'alerta' | 'sucesso';

export function Aviso({
  texto,
  tom = 'info',
}: {
  texto: string;
  tom?: Tom;
}): React.ReactElement {
  const cor =
    tom === 'alerta' ? cores.amarelo : tom === 'sucesso' ? cores.verde : cores.info;
  const fundo =
    tom === 'alerta'
      ? cores.amareloFundo
      : tom === 'sucesso'
        ? cores.verdeFundo
        : cores.primariaClara;
  const icone =
    tom === 'alerta'
      ? 'warning-outline'
      : tom === 'sucesso'
        ? 'checkmark-circle-outline'
        : 'information-circle-outline';

  return (
    <View style={[styles.container, { backgroundColor: fundo }]}>
      <Ionicons name={icone} size={18} color={cor} />
      <Text style={[styles.texto, { color: cor }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacamento.sm,
    padding: espacamento.md,
    borderRadius: raio.md,
    marginBottom: espacamento.md,
  },
  texto: {
    ...tipografia.legenda,
    flex: 1,
    lineHeight: 18,
  },
});

export default Aviso;
