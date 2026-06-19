/**
 * Componentes de gráfico reutilizáveis (sem dependências externas além de
 * react-native-svg): gráfico pizza (rosca) com legenda e gráfico de barras
 * verticais. Usados no Painel de Vendas e nos Indicadores.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { cores, espacamento, tipografia } from '../theme';

/** Paleta de cores para as fatias/barras. */
export const CORES_GRAFICO = [
  '#C8102E',
  '#1E9E5A',
  '#C99700',
  '#2E6FD2',
  '#8E44AD',
  '#E67E22',
  '#16A085',
  '#7F8C8D',
  '#D81B60',
  '#43A047',
  '#FB8C00',
  '#3949AB',
  '#00897B',
  '#6D4C41',
  '#5E35B1',
  '#00ACC1',
];

export interface FatiaGrafico {
  rotulo: string;
  valor: number;
  cor: string;
}

/**
 * Monta as fatias a partir de uma lista qualquer (rótulo + valor): mostra os
 * maiores e agrupa o restante em "Outros", para o gráfico não ficar poluído.
 */
export function montarFatias(
  itens: { rotulo: string; valor: number }[],
  maximoFatias = 6,
): FatiaGrafico[] {
  const positivos = itens.filter((i) => i.valor > 0);
  const principais = positivos.slice(0, maximoFatias);
  const fatias: FatiaGrafico[] = principais.map((i, idx) => ({
    rotulo: i.rotulo,
    valor: i.valor,
    cor: CORES_GRAFICO[idx % CORES_GRAFICO.length],
  }));
  const resto = positivos.slice(maximoFatias);
  if (resto.length > 0) {
    fatias.push({
      rotulo: `Outros (${resto.length})`,
      valor: resto.reduce((s, i) => s + i.valor, 0),
      cor: CORES_GRAFICO[CORES_GRAFICO.length - 1],
    });
  }
  return fatias;
}

/** Gráfico pizza (rosca) com legenda em percentual ou em valor. */
export function GraficoPizza({
  fatias,
  mostrarValor = false,
  formatarValor,
}: {
  fatias: FatiaGrafico[];
  /** Quando true, a legenda mostra o valor (formatado) em vez do percentual. */
  mostrarValor?: boolean;
  formatarValor?: (valor: number) => string;
}): React.ReactElement {
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const tamanho = 180;
  const espessura = 34;
  const raio = (tamanho - espessura) / 2;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;

  const alternar = (i: number) =>
    setSelecionada((atual) => (atual === i ? null : i));

  const fatiaSel = selecionada != null ? fatias[selecionada] : undefined;
  const valorFmt = (v: number): string =>
    formatarValor ? formatarValor(v) : String(v);

  return (
    <View style={styles.pizzaContainer}>
      <View style={styles.donutWrap}>
        <Svg width={tamanho} height={tamanho}>
          <G rotation={-90} originX={tamanho / 2} originY={tamanho / 2}>
            {total > 0 ? (
              fatias.map((f, i) => {
                const comprimento = (f.valor / total) * circunferencia;
                const elemento = (
                  <Circle
                    key={`${f.rotulo}-${i}`}
                    cx={tamanho / 2}
                    cy={tamanho / 2}
                    r={raio}
                    stroke={f.cor}
                    strokeWidth={selecionada === i ? espessura + 8 : espessura}
                    opacity={selecionada == null || selecionada === i ? 1 : 0.35}
                    fill="none"
                    strokeDasharray={`${comprimento} ${circunferencia - comprimento}`}
                    strokeDashoffset={-acumulado}
                    onPress={() => alternar(i)}
                    onPressIn={() => alternar(i)}
                  />
                );
                acumulado += comprimento;
                return elemento;
              })
            ) : (
              <Circle
                cx={tamanho / 2}
                cy={tamanho / 2}
                r={raio}
                stroke={cores.divisor}
                strokeWidth={espessura}
                fill="none"
              />
            )}
          </G>
        </Svg>
        <Pressable
          style={styles.centro}
          onPress={() => setSelecionada(null)}
        >
          {fatiaSel ? (
            <>
              <Text style={styles.centroRotulo} numberOfLines={2}>
                {fatiaSel.rotulo}
              </Text>
              <Text style={styles.centroValor}>{valorFmt(fatiaSel.valor)}</Text>
              <Text style={styles.centroPct}>
                {total > 0
                  ? `${((fatiaSel.valor / total) * 100).toFixed(1)}%`
                  : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.centroDica}>Toque numa fatia</Text>
          )}
        </Pressable>
      </View>
      <View style={styles.legenda}>
        {fatias.map((f, i) => {
          const pct = total > 0 ? (f.valor / total) * 100 : 0;
          const textoDireita = mostrarValor
            ? (formatarValor ? formatarValor(f.valor) : String(f.valor))
            : `${pct.toFixed(0)}%`;
          const ativa = selecionada === i;
          return (
            <Pressable
              key={`${f.rotulo}-leg-${i}`}
              onPress={() => alternar(i)}
              style={[styles.legendaLinha, ativa && styles.legendaLinhaAtiva]}
            >
              <View style={[styles.legendaPonto, { backgroundColor: f.cor }]} />
              <Text
                style={[styles.legendaNome, ativa && styles.legendaNomeAtiva]}
                numberOfLines={1}
              >
                {f.rotulo}
              </Text>
              <View style={styles.legendaConector} />
              <Text style={styles.legendaValor}>{textoDireita}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface BarraVertical {
  rotulo: string;
  valor: number;
}

/** Gráfico de barras verticais (ex.: vendas por hora). */
export function GraficoBarrasVerticais({
  dados,
  altura = 150,
}: {
  dados: BarraVertical[];
  altura?: number;
}): React.ReactElement {
  const max = Math.max(...dados.map((d) => d.valor), 0);
  const alturaBarras = altura - 22;
  return (
    <View>
      <View style={[styles.barrasArea, { height: altura }]}>
        {dados.map((d, i) => {
          const h = max > 0 ? Math.max(3, (d.valor / max) * alturaBarras) : 3;
          const destaque = d.valor === max && max > 0;
          return (
            <View key={`${d.rotulo}-${i}`} style={styles.barraColuna}>
              <View
                style={[
                  styles.barra,
                  {
                    height: h,
                    backgroundColor: destaque
                      ? cores.primaria
                      : cores.primariaClara,
                  },
                ]}
              />
              <Text style={styles.barraRotulo} numberOfLines={1}>
                {d.rotulo}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pizzaContainer: {
    alignItems: 'center',
    gap: espacamento.md,
  },
  donutWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centro: {
    position: 'absolute',
    top: 40,
    left: 40,
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  centroRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
  },
  centroValor: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  centroPct: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '700',
    marginTop: 2,
  },
  centroDica: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
  },
  legenda: {
    width: '100%',
    gap: espacamento.xs,
  },
  legendaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  legendaLinhaAtiva: {
    backgroundColor: cores.fundo,
    borderRadius: 6,
  },
  legendaNomeAtiva: {
    fontWeight: '700',
  },
  legendaPonto: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendaNome: {
    ...tipografia.legenda,
    color: cores.texto,
    flexShrink: 1,
  },
  legendaConector: {
    flex: 1,
    marginHorizontal: espacamento.xs,
    marginBottom: 3,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: cores.textoSecundario,
  },
  legendaValor: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '700',
  },
  barrasArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 3,
  },
  barraColuna: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  barra: {
    width: '78%',
    borderRadius: 3,
  },
  barraRotulo: {
    fontSize: 9,
    color: cores.textoSecundario,
  },
});
