/**
 * Cartão de ação com ícone em caixa de cor suave.
 *
 * Atalho tocável (ex.: os cartões "Revisar inconsistências", "Revisar / fechar
 * ciclo" e "Gerenciar feriados" da Central de Jornada). Mostra um ícone
 * colorido, um título e uma linha de estado (contador/pendências) cuja cor
 * comunica a urgência. Pensado para uma linha de 3 cartões (grade que quebra).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, raio, sombra, tipografia } from '../theme';

interface CartaoAcaoProps {
  icone: React.ComponentProps<typeof Ionicons>['name'];
  /** Cor do ícone. */
  cor: string;
  /** Fundo suave da caixa do ícone. */
  fundo: string;
  titulo: string;
  /** Linha de estado (ex.: "12 pendências", "Pronto para revisão"). */
  estado: string;
  /** Cor do texto de estado (comunica urgência). */
  estadoCor: string;
  aoPressionar: () => void;
}

export function CartaoAcao({
  icone,
  cor,
  fundo,
  titulo,
  estado,
  estadoCor,
  aoPressionar,
}: CartaoAcaoProps): React.ReactElement {
  return (
    <Pressable
      onPress={aoPressionar}
      style={styles.cartao}
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. ${estado}`}
    >
      <View style={styles.topo}>
        <View style={[styles.caixaIcone, { backgroundColor: fundo }]}>
          <Ionicons name={icone} size={20} color={cor} />
        </View>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={cores.textoSecundario}
        />
      </View>
      <Text style={styles.titulo} numberOfLines={2}>
        {titulo}
      </Text>
      <Text style={[styles.estado, { color: estadoCor }]} numberOfLines={1}>
        {estado}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cartao: {
    minWidth: '30%',
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    borderWidth: 1,
    borderColor: cores.divisor,
    padding: espacamento.lg,
    ...sombra.cartao,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.sm,
  },
  caixaIcone: {
    width: 40,
    height: 40,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  estado: {
    ...tipografia.legenda,
    fontWeight: '600',
    marginTop: espacamento.xs,
  },
});

export default CartaoAcao;
