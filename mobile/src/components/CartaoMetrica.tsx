/**
 * Cartão de métrica com ícone em caixa de cor suave.
 *
 * Usado nas grades de resumo (ex.: Central de Jornada): um ícone colorido numa
 * caixa arredondada à esquerda e, à direita, o valor em destaque com um rótulo
 * curto embaixo. A cor do valor e o fundo do ícone são controlados pela tela
 * para refletir a semântica do dado (verde/vermelho/azul etc.).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme';

interface CartaoMetricaProps {
  icone: React.ComponentProps<typeof Ionicons>['name'];
  /** Cor do ícone (a caixa suave usa `fundo`). O valor é sempre neutro. */
  cor: string;
  /** Fundo suave da caixa do ícone. */
  fundo: string;
  valor: string;
  rotulo: string;
}

export function CartaoMetrica({
  icone,
  cor,
  fundo,
  valor,
  rotulo,
}: CartaoMetricaProps): React.ReactElement {
  return (
    <View style={styles.cartao}>
      <View style={[styles.caixaIcone, { backgroundColor: fundo }]}>
        <Ionicons name={icone} size={20} color={cor} />
      </View>
      <View style={styles.texto}>
        <Text style={styles.valor} numberOfLines={1}>
          {valor}
        </Text>
        <Text style={styles.rotulo} numberOfLines={1}>
          {rotulo}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    minWidth: '46%',
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.divisor,
    paddingVertical: espacamento.md,
    paddingHorizontal: espacamento.md,
  },
  caixaIcone: {
    width: 36,
    height: 36,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: {
    flex: 1,
  },
  valor: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  rotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
});

export default CartaoMetrica;
