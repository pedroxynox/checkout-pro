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
 *
 * **Tipografia enxuta de propósito.** Numa grade de duas colunas o texto divide
 * a largura com o ícone e a seta, e valores como "2 atestados" ou "12h 30min"
 * não cabiam: eram cortados com "…". O valor mede 12 e o rótulo 10 — pequeno,
 * mas legível — para que o número apareça **inteiro**, que é o que interessa
 * numa métrica. Um valor cortado não informa nada.
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
        <Ionicons name={icone} size={16} color={corIcone} />
      </View>
      <View style={styles.texto}>
        {/* Sem `adjustsFontSizeToFit`: ele só funciona no iOS, então no Android
            dava a falsa sensação de que o valor caberia — e ele era cortado. O
            tamanho base já é pequeno o bastante para caber de verdade. */}
        <Text style={[styles.valor, apagado && styles.valorApagado]} numberOfLines={1}>
          {valor}
        </Text>
        <Text style={styles.rotulo} numberOfLines={1}>
          {rotulo}
        </Text>
      </View>
      {aoPressionar && (
        <Ionicons
          name="chevron-forward"
          size={12}
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
    gap: espacamento.xs,
    minWidth: '46%',
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.divisor,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.sm,
  },
  cartaoPressionado: {
    backgroundColor: cores.superficieAlternativa,
  },
  // Caixa do ícone enxuta: cada ponto que ela devolve é espaço que sobra para o
  // texto do valor, que é o que precisa caber inteiro.
  caixaIcone: {
    width: 28,
    height: 28,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: {
    flex: 1,
  },
  valor: {
    ...tipografia.rotulo,
    fontSize: 12,
    fontWeight: '700',
    color: cores.texto,
  },
  valorApagado: {
    color: cores.textoSecundario,
  },
  rotulo: {
    ...tipografia.legenda,
    fontSize: 10,
    color: cores.textoSecundario,
    marginTop: 1,
  },
});

export default CartaoMetrica;
