/**
 * Pequenos componentes reutilizáveis: controle segmentado e linha de
 * informação (rótulo/valor).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espacamento, raio, tipografia } from '../theme';

interface OpcaoSegmento<T extends string> {
  valor: T;
  rotulo: string;
}

export function Segmentado<T extends string>({
  opcoes,
  selecionado,
  aoSelecionar,
}: {
  opcoes: OpcaoSegmento<T>[];
  selecionado: T;
  aoSelecionar: (valor: T) => void;
}): React.ReactElement {
  return (
    <View style={styles.segmentoContainer}>
      {opcoes.map((op) => {
        const ativo = op.valor === selecionado;
        return (
          <Pressable
            key={op.valor}
            onPress={() => aoSelecionar(op.valor)}
            style={[styles.segmento, ativo && styles.segmentoAtivo]}
          >
            <Text style={[styles.segmentoTexto, ativo && styles.segmentoTextoAtivo]}>
              {op.rotulo}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LinhaInfo({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: string | number;
}): React.ReactElement {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={styles.linhaValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  segmentoContainer: {
    flexDirection: 'row',
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.md,
    padding: espacamento.xs,
    marginBottom: espacamento.md,
  },
  segmento: {
    flex: 1,
    paddingVertical: espacamento.sm,
    borderRadius: raio.sm,
    alignItems: 'center',
  },
  segmentoAtivo: {
    backgroundColor: cores.superficie,
  },
  segmentoTexto: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
  },
  segmentoTextoAtivo: {
    color: cores.primaria,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  linhaRotulo: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    flex: 1,
  },
  linhaValor: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
});
