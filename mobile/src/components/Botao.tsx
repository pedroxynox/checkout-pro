/** Botão padrão do app, com variantes e estado de carregamento. */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme';

type Variante = 'primario' | 'secundario' | 'perigo' | 'texto';

interface BotaoProps {
  titulo: string;
  aoPressionar: () => void;
  variante?: Variante;
  carregando?: boolean;
  desabilitado?: boolean;
  estilo?: ViewStyle;
}

export function Botao({
  titulo,
  aoPressionar,
  variante = 'primario',
  carregando = false,
  desabilitado = false,
  estilo,
}: BotaoProps): React.ReactElement {
  const inativo = desabilitado || carregando;
  const corFundo =
    variante === 'primario'
      ? cores.primaria
      : variante === 'perigo'
        ? cores.erro
        : variante === 'secundario'
          ? cores.primariaClara
          : 'transparent';
  const corTexto =
    variante === 'secundario'
      ? cores.primaria
      : variante === 'texto'
        ? cores.primaria
        : cores.textoInverso;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={aoPressionar}
      disabled={inativo}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: corFundo },
        variante === 'texto' && styles.semFundo,
        inativo && styles.inativo,
        pressed && !inativo && styles.pressionado,
        estilo,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={corTexto} />
      ) : (
        <Text style={[styles.texto, { color: corTexto }]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: espacamento.lg,
    borderRadius: raio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  semFundo: {
    minHeight: 40,
  },
  texto: {
    ...tipografia.rotulo,
    fontSize: 15,
  },
  inativo: {
    opacity: 0.5,
  },
  pressionado: {
    opacity: 0.85,
  },
});

export default Botao;
