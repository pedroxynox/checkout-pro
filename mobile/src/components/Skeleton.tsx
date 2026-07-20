/**
 * Skeleton — placeholder de carregamento.
 *
 * Uma barra/retângulo cinza-claro que ocupa o espaço do conteúdo enquanto ele
 * ainda está sendo buscado. Dá a sensação de que a tela já "montou" (em vez de
 * ficar em branco), melhorando a percepção de velocidade.
 */
import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { cores, raio } from '../theme';

interface Props {
  /** Largura (número em px ou porcentagem). Padrão: 100%. */
  largura?: number | string;
  /** Altura em px. Padrão: 12. */
  altura?: number;
  /** Estilos extras (ex.: margens). */
  estilo?: StyleProp<ViewStyle>;
}

export function Skeleton({
  largura = '100%',
  altura = 12,
  estilo,
}: Props): React.ReactElement {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: largura as ViewStyle['width'],
          height: altura,
          borderRadius: raio.sm,
          backgroundColor: cores.divisor,
          opacity: 0.7,
        },
        estilo,
      ]}
    />
  );
}

export default Skeleton;
