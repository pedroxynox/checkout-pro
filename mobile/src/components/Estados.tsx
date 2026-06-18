/**
 * Componentes utilitários de estado de tela: carregamento, erro, vazio e
 * mensagem informativa. Padronizam o feedback ao usuário em Português.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, tipografia } from '../theme';
import { Botao } from './Botao';

export function Carregando({
  texto = 'Carregando...',
}: {
  texto?: string;
}): React.ReactElement {
  return (
    <View style={styles.centro}>
      <ActivityIndicator size="large" color={cores.primaria} />
      <Text style={styles.legenda}>{texto}</Text>
    </View>
  );
}

export function MensagemErro({
  mensagem,
  aoTentarNovamente,
}: {
  mensagem: string;
  aoTentarNovamente?: () => void;
}): React.ReactElement {
  return (
    <View style={styles.centro}>
      <Ionicons name="alert-circle-outline" size={40} color={cores.erro} />
      <Text style={[styles.legenda, { color: cores.erro }]}>{mensagem}</Text>
      {aoTentarNovamente ? (
        <Botao
          titulo="Tentar novamente"
          variante="secundario"
          aoPressionar={aoTentarNovamente}
          estilo={{ marginTop: espacamento.md }}
        />
      ) : null}
    </View>
  );
}

export function EstadoVazio({
  icone = 'file-tray-outline',
  titulo,
  descricao,
}: {
  icone?: keyof typeof Ionicons.glyphMap;
  titulo: string;
  descricao?: string;
}): React.ReactElement {
  return (
    <View style={styles.centro}>
      <Ionicons name={icone} size={40} color={cores.textoSecundario} />
      <Text style={styles.tituloVazio}>{titulo}</Text>
      {descricao ? <Text style={styles.legenda}>{descricao}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centro: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: espacamento.xxl,
    paddingHorizontal: espacamento.lg,
  },
  legenda: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: espacamento.sm,
  },
  tituloVazio: {
    ...tipografia.subtitulo,
    color: cores.texto,
    marginTop: espacamento.sm,
  },
});
