/** Cartão de superfície com sombra leve para agrupar conteúdo. */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { cores, espacamento, raio, sombra, tipografia } from '../theme';

interface CartaoProps {
  children: React.ReactNode;
  titulo?: string;
  rodape?: React.ReactNode;
  estilo?: ViewStyle;
  /**
   * Estilo adicional do contêiner. Alias de `estilo` que aceita também arrays
   * de estilo; mantido por compatibilidade com telas que usam `style`.
   */
  style?: StyleProp<ViewStyle>;
}

export function Cartao({
  children,
  titulo,
  rodape,
  estilo,
  style,
}: CartaoProps): React.ReactElement {
  return (
    <View style={[styles.cartao, estilo, style]}>
      {titulo ? <Text style={styles.titulo}>{titulo}</Text> : null}
      {children}
      {rodape ? <View style={styles.rodape}>{rodape}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    marginBottom: espacamento.md,
    ...sombra.cartao,
  },
  titulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.md,
  },
  rodape: {
    marginTop: espacamento.md,
  },
});

export default Cartao;
