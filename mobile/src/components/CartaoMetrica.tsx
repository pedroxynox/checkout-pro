/**
 * Cartão de métrica com ícone em caixa de cor suave.
 *
 * Usado nas grades de resumo (ex.: Central de Jornada): um ícone colorido numa
 * caixa arredondada à esquerda e, à direita, o valor em destaque com um rótulo
 * curto embaixo. A cor do valor e o fundo do ícone são controlados pela tela
 * para refletir a semântica do dado (verde/vermelho/azul etc.).
 *
 * Pode ser **tocável**: ao receber `aoPressionar`, o cartão ganha uma seta
 * discreta à direita (a mesma afordância dos atalhos da Central) para que se
 * perceba que ele abre algo — sem ela, um cartão clicável parece estático.
 *
 * `apagado` serve às grades de posição fixa: um cartão zerado continua no lugar
 * (a grade não salta, o usuário não perde o botão de vista) mas fica em cinza,
 * comunicando "não há nada aqui" sem desaparecer.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme';

interface CartaoMetricaProps {
  icone: React.ComponentProps<typeof Ionicons>['name'];
  /** Cor do ícone (a caixa suave usa `fundo`). O valor é sempre neutro. */
  cor: string;
  /** Fundo suave da caixa do ícone. */
  fundo: string;
  valor: string;
  rotulo: string;
  /** Quando informado, o cartão vira tocável e exibe a seta de afordância. */
  aoPressionar?: () => void;
  /** Estado neutro (sem dado): ícone e valor em cinza, cartão esmaecido. */
  apagado?: boolean;
}

export function CartaoMetrica({
  icone,
  cor,
  fundo,
  valor,
  rotulo,
  aoPressionar,
  apagado = false,
}: CartaoMetricaProps): React.ReactElement {
  const corIcone = apagado ? cores.textoSecundario : cor;
  const fundoIcone = apagado ? cores.superficieAlternativa : fundo;

  const conteudo = (
    <>
      <View style={[styles.caixaIcone, { backgroundColor: fundoIcone }]}>
        <Ionicons name={icone} size={20} color={corIcone} />
      </View>
      <View style={styles.texto}>
        <Text
          style={[styles.valor, apagado && styles.valorApagado]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {valor}
        </Text>
        <Text style={styles.rotulo} numberOfLines={1}>
          {rotulo}
        </Text>
      </View>
      {aoPressionar && (
        <Ionicons
          name="chevron-forward"
          size={14}
          color={cores.textoSecundario}
        />
      )}
    </>
  );

  if (!aoPressionar) {
    return <View style={styles.cartao}>{conteudo}</View>;
  }

  return (
    <Pressable
      onPress={aoPressionar}
      style={({ pressed }) => [
        styles.cartao,
        pressed && styles.cartaoPressionado,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}: ${valor}`}
    >
      {conteudo}
    </Pressable>
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
  cartaoPressionado: {
    backgroundColor: cores.superficieAlternativa,
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
    fontSize: 16,
    color: cores.texto,
  },
  valorApagado: {
    color: cores.textoSecundario,
  },
  rotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
});

export default CartaoMetrica;
