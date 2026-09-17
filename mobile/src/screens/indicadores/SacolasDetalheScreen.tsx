/**
 * Detalhe do indicador **Sacolas** — aberto ao tocar na card do painel de
 * Indicadores (ADR 0022).
 *
 * ## A pergunta que esta tela responde
 *
 * A card diz *quanto* se vendeu por sacola. Isso é um boletim: só serve no fim do
 * mês. Esta tela responde o que fazer **enquanto o mês corre**, invertendo a
 * conta:
 *
 *     indicador = venda ÷ sacolas ≥ meta   ⟺   sacolas ≤ venda ÷ meta
 *
 * Ou seja: existe um **teto de sacolas** que o mês suporta. "Ainda cabem 7
 * fardos" é acionável; "o indicador está em R$ 22" não é.
 *
 * ## A ordem dos blocos, e por quê
 *
 * 1. **Teto** — o número que serve para decidir, primeiro.
 * 2. **Projeção do fechamento** — onde o mês termina se nada mudar, que é
 *    exatamente o horizonte que interessa ("no fim do mês não desperdiçar
 *    sacolas e vender a meta ou mais por sacola").
 * 3. **Consumo × entrada** — separa **desperdício** de **reposição de estoque**.
 *    Sem isso, um mês que recebeu mais do que usou seria lido como desperdício.
 * 4. **Dias que entrou sacola** — o extrato que sustenta o denominador.
 * 5. **Série do mês** — venda, estimativa e consumo dia a dia.
 *
 * Tela própria (e não o `IndicadorDetalheScreen`) porque aquele é acoplado ao
 * catálogo de arrecadação e ramifica em `base === 'FIXA' | 'VENDAS'` — e Sacolas
 * está deliberadamente fora daquele catálogo.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { insumosService } from '../../api/services';
import { DetalheSacolas, EntradaSacolaDia } from '../../api/types';
import {
  Cartao,
  Carregando,
  EstadoVazio,
  GraficoBarrasVerticais,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import {
  formatarMoeda,
  formatarNumero,
  isoParaDiaMes,
} from '../../utils/formato';
import {
  MESES_HISTORICO_INDICADORES,
  deslocarMes,
  mesAtual,
  mesesAtras,
  rotuloMes,
} from '../../utils/periodoMensal';

/** Rótulo da origem da entrada, em linguagem de loja. */
function rotuloOrigem(origem: string | null): string {
  switch (origem) {
    case 'ENTRADA':
      return 'entrada manual';
    case 'REQUISICAO':
      return 'requisição aprovada';
    case 'PEDIDO_RECORRENTE':
      return 'pedido recorrente';
    default:
      return 'entrada';
  }
}

/** De onde veio a venda esperada, dito de forma simples. */
function rotuloFonte(fonte: DetalheSacolas['vendaEsperada']['fonte']): string {
  switch (fonte) {
    case 'ESTIMATIVA':
      return 'realizado + estimativas dos dias que faltam';
    case 'RUN_RATE':
      return 'projeção pelo ritmo do mês (sem estimativas cadastradas)';
    default:
      return 'venda realizada';
  }
}

/** Uma linha rótulo → valor, o formato de leitura desta tela. */
function Linha({
  rotulo,
  valor,
  cor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  cor?: string;
  destaque?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text
        style={[
          destaque ? styles.linhaValorDestaque : styles.linhaValor,
          cor ? { color: cor } : null,
        ]}
      >
        {valor}
      </Text>
    </View>
  );
}

/** Uma entrada do extrato de sacolas. */
function LinhaEntrada({ item }: { item: EntradaSacolaDia }): React.ReactElement {
  return (
    <View style={styles.entradaLinha}>
      <View style={styles.entradaData}>
        <Text style={styles.entradaDia}>{isoParaDiaMes(item.data)}</Text>
      </View>
      <View style={styles.flex1}>
        <Text style={styles.entradaFardos}>
          {formatarNumero(item.fardos)} fardos
          <Text style={styles.entradaSacolas}>
            {'  '}({formatarNumero(item.sacolas)} sacolas)
          </Text>
        </Text>
        <Text style={styles.entradaMeta}>
          {rotuloOrigem(item.origem)}
          {item.responsavelNome ? ` · ${item.responsavelNome}` : ''}
        </Text>
      </View>
    </View>
  );
}

export function SacolasDetalheScreen(): React.ReactElement {
  const [anoMes, setAnoMes] = useState(mesAtual());
  const ehMesCorrente = anoMes === mesAtual();

  const req = useRequisicao<DetalheSacolas>(
    () => insumosService.detalheSacolas(anoMes),
    [anoMes],
  );

  const podeVoltar =
    mesesAtras(anoMes, mesAtual()) < MESES_HISTORICO_INDICADORES - 1;
  const trocarMes = (delta: number): void => {
    setAnoMes((atual) => {
      const alvo = deslocarMes(atual, delta);
      if (mesesAtras(alvo, mesAtual()) < 0) return atual;
      if (mesesAtras(alvo, mesAtual()) > MESES_HISTORICO_INDICADORES - 1) {
        return atual;
      }
      return alvo;
    });
  };

  const d = req.dados;
  const meta = d?.indicador.meta ?? 0;

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      {/* Seletor de mês, igual ao painel de Indicadores. */}
      <View style={styles.seletor}>
        <Text
          onPress={() => podeVoltar && trocarMes(-1)}
          style={[styles.seta, !podeVoltar && styles.setaInativa]}
          accessibilityLabel="Mês anterior"
        >
          ‹
        </Text>
        <View style={styles.seletorCentro}>
          <Text style={styles.seletorTexto}>{rotuloMes(anoMes)}</Text>
          <Text style={styles.seletorSub}>
            {ehMesCorrente ? 'Mês em andamento' : 'Mês fechado'}
          </Text>
        </View>
        <Text
          onPress={() => !ehMesCorrente && trocarMes(1)}
          style={[styles.seta, ehMesCorrente && styles.setaInativa]}
          accessibilityLabel="Próximo mês"
        >
          ›
        </Text>
      </View>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : !d ? (
        <EstadoVazio
          icone="bag-handle-outline"
          titulo="Sem dados"
          descricao="Não há informação de sacolas para este mês."
        />
      ) : (
        <>
          {/* ===== 1. O indicador do mês ===== */}
          <Cartao>
            <View style={styles.topo}>
              <View style={styles.iconeBox}>
                <Ionicons name="bag-handle" size={22} color={cores.primaria} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.titulo}>Venda por sacola</Text>
                <Text style={styles.subtitulo}>
                  meta: {formatarMoeda(meta)} por sacola (piso)
                </Text>
              </View>
              {d.indicador.valor != null && (
                <Text
                  style={[
                    styles.valorGrande,
                    {
                      color:
                        d.indicador.desvio?.noPiso === false
                          ? cores.vermelho
                          : cores.verde,
                    },
                  ]}
                >
                  {formatarMoeda(d.indicador.valor)}
                </Text>
              )}
            </View>
            <Text style={styles.resumo}>{d.indicador.resumo}</Text>
            {d.indicador.avisoEntregas && (
              <Text style={styles.aviso}>{d.indicador.avisoEntregas}</Text>
            )}
          </Cartao>

          {/* ===== 2. O TETO: quantas sacolas ainda cabem ===== */}
          {d.teto ? (
            <Cartao titulo="Quantas sacolas ainda cabem">
              {d.teto.tetoEstourado ? (
                <>
                  <Text style={styles.tetoEstourado}>
                    O mês já recebeu mais sacolas do que a venda esperada
                    sustenta. Não cabe mais nenhum fardo sem ficar abaixo da meta.
                  </Text>
                  <Linha
                    rotulo="Para as sacolas já recebidas ficarem na meta"
                    valor={formatarMoeda(d.teto.vendaNecessaria)}
                    destaque
                  />
                  <Linha
                    rotulo="Falta de venda para chegar lá"
                    valor={formatarMoeda(d.teto.vendaFaltante)}
                    cor={cores.vermelho}
                  />
                </>
              ) : (
                <>
                  <View style={styles.tetoDestaque}>
                    <Text style={styles.tetoNumero}>
                      {formatarNumero(d.teto.podemEntrarFardos)}
                    </Text>
                    <Text style={styles.tetoLabel}>
                      fardos ainda cabem neste mês
                    </Text>
                    <Text style={styles.tetoSub}>
                      ({formatarNumero(d.teto.podemEntrarSacolas)} sacolas)
                    </Text>
                  </View>
                  <Linha
                    rotulo="Teto do mês"
                    valor={`${formatarNumero(d.teto.tetoFardos)} fardos`}
                  />
                  <Linha
                    rotulo="Já recebido"
                    valor={`${formatarNumero(d.indicador.fardosRecebidos)} fardos`}
                  />
                </>
              )}
              <View style={styles.divisor} />
              <Linha
                rotulo="Venda esperada do mês"
                valor={formatarMoeda(d.vendaEsperada.valor)}
              />
              <Text style={styles.nota}>
                Base: {rotuloFonte(d.vendaEsperada.fonte)}.{' '}
                {Math.round(d.vendaEsperada.fracaoRealizada * 100)}% já é venda
                realizada.
              </Text>
              {/* A direção é contraintuitiva e precisa estar escrita. */}
              <Text style={styles.nota}>
                Receber menos sacolas melhora o indicador — mas a loja precisa de
                sacolas. Passar do teto significa que, com a venda esperada, o mês
                fecha abaixo da meta: a saída também pode ser vender mais.
              </Text>
            </Cartao>
          ) : null}

          {/* ===== 3. Projeção do fechamento ===== */}
          {d.projecao.valor != null && (
            <Cartao titulo="Onde o mês fecha, se nada mudar">
              <View style={styles.topo}>
                <View style={styles.flex1}>
                  <Text
                    style={[
                      styles.valorGrande,
                      {
                        color: d.projecao.cumprira
                          ? cores.verde
                          : cores.vermelho,
                      },
                    ]}
                  >
                    {formatarMoeda(d.projecao.valor)}
                  </Text>
                  <Text style={styles.subtitulo}>por sacola no fechamento</Text>
                </View>
                <Selo
                  texto={d.projecao.cumprira ? 'Dentro da meta' : 'Abaixo da meta'}
                  cor={d.projecao.cumprira ? cores.verde : cores.vermelho}
                  fundo={
                    d.projecao.cumprira ? cores.verdeFundo : cores.vermelhoFundo
                  }
                />
              </View>
              <Linha
                rotulo="Sacolas no fechamento"
                valor={formatarNumero(d.projecao.sacolasNoFechamento)}
              />
              {d.projecao.sacolasPrevistas > 0 && (
                <Linha
                  rotulo="Das quais ainda vão chegar"
                  valor={formatarNumero(d.projecao.sacolasPrevistas)}
                />
              )}
              <Text style={styles.nota}>{d.projecao.baseDaPrevisao}</Text>
            </Cartao>
          )}

          {/* ===== 4. Consumo × entrada: desperdício ou reposição? ===== */}
          <Cartao titulo="Recebido × usado no mês">
            <Linha
              rotulo="Sacolas recebidas"
              valor={formatarNumero(d.consumoVsEntrada.sacolasRecebidas)}
            />
            <Linha
              rotulo="Sacolas usadas (saídas registradas)"
              valor={formatarNumero(d.consumoVsEntrada.sacolasConsumidas)}
            />
            <Linha
              rotulo={
                d.consumoVsEntrada.variacaoEstoque >= 0
                  ? 'O estoque subiu'
                  : 'O estoque caiu'
              }
              valor={formatarNumero(
                Math.abs(d.consumoVsEntrada.variacaoEstoque),
              )}
              cor={
                d.consumoVsEntrada.variacaoEstoque >= 0
                  ? cores.textoSecundario
                  : cores.amarelo
              }
            />
            <View style={styles.divisor} />
            <Linha
              rotulo="Indicador oficial (pela entrada)"
              valor={
                d.consumoVsEntrada.porEntrada != null
                  ? formatarMoeda(d.consumoVsEntrada.porEntrada)
                  : '—'
              }
              destaque
            />
            <Linha
              rotulo="Referência de uso real (pelo consumo)"
              valor={
                d.consumoVsEntrada.porConsumo != null
                  ? formatarMoeda(d.consumoVsEntrada.porConsumo)
                  : '—'
              }
            />
            {d.consumoVsEntrada.leitura && (
              <Text style={styles.nota}>{d.consumoVsEntrada.leitura}</Text>
            )}
          </Cartao>

          {/* ===== 5. Os dias em que entrou sacola ===== */}
          <Cartao titulo="Dias em que entrou sacola">
            {d.entradas.length === 0 ? (
              <Text style={styles.nota}>
                Nenhuma entrada de sacola neste mês.
              </Text>
            ) : (
              <>
                {/*
                  O total de fardos e o número de entregas ficavam na card do
                  painel. Saíram de lá para deixá-la limpa, então precisam estar
                  escritos aqui: são o denominador do indicador, e sem eles o
                  extrato abaixo não se soma a nada.
                */}
                <Linha
                  rotulo="Recebido no mês"
                  valor={`${formatarNumero(d.indicador.fardosRecebidos)} fardos em ${formatarNumero(d.indicador.entregas)} entrega${d.indicador.entregas === 1 ? '' : 's'}`}
                  destaque
                />
                <View style={styles.divisor} />
                {d.entradas.map((e) => (
                  <LinhaEntrada key={e.dataHora} item={e} />
                ))}
              </>
            )}
          </Cartao>

          {/* ===== 6. A série do mês ===== */}
          {d.serie.some((x) => x.venda > 0) && (
            <Cartao titulo="Venda por dia (R$)">
              <GraficoBarrasVerticais
                dados={d.serie
                  .filter((x) => x.venda > 0)
                  .map((x) => ({
                    rotulo: isoParaDiaMes(x.data).slice(0, 2),
                    valor: x.venda,
                  }))}
              />
            </Cartao>
          )}
          {d.serie.some((x) => x.consumo > 0) && (
            <Cartao titulo="Sacolas usadas por dia">
              <GraficoBarrasVerticais
                dados={d.serie
                  .filter((x) => x.consumo > 0)
                  .map((x) => ({
                    rotulo: isoParaDiaMes(x.data).slice(0, 2),
                    valor: x.consumo,
                  }))}
              />
            </Cartao>
          )}
        </>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  seletor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: cores.superficie,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.lg,
    marginBottom: espacamento.md,
    borderWidth: 1,
    borderColor: cores.divisor,
  },
  seta: { ...tipografia.titulo, color: cores.primaria, paddingHorizontal: 8 },
  setaInativa: { color: cores.divisor },
  seletorCentro: { alignItems: 'center' },
  seletorTexto: { ...tipografia.secao, color: cores.texto },
  seletorSub: { ...tipografia.legenda, color: cores.textoSecundario },

  topo: { flexDirection: 'row', alignItems: 'center', gap: espacamento.md },
  iconeBox: {
    width: 40,
    height: 40,
    borderRadius: raio.sm,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: { ...tipografia.secao, color: cores.texto },
  subtitulo: { ...tipografia.legenda, color: cores.textoSecundario },
  valorGrande: { ...tipografia.titulo },
  resumo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    lineHeight: 17,
  },
  aviso: {
    ...tipografia.legenda,
    color: cores.laranja,
    marginTop: espacamento.xs,
    lineHeight: 17,
  },

  // O teto em destaque: é o número que serve para decidir.
  tetoDestaque: {
    alignItems: 'center',
    backgroundColor: cores.verdeFundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.lg,
    marginBottom: espacamento.md,
  },
  tetoNumero: { ...tipografia.titulo, fontSize: 40, color: cores.verde },
  tetoLabel: { ...tipografia.rotulo, color: cores.texto },
  tetoSub: { ...tipografia.legenda, color: cores.textoSecundario },
  tetoEstourado: {
    ...tipografia.corpo,
    color: cores.vermelho,
    marginBottom: espacamento.md,
    lineHeight: 21,
  },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacamento.md,
    paddingVertical: espacamento.xs,
  },
  linhaRotulo: { ...tipografia.legenda, color: cores.textoSecundario, flex: 1 },
  linhaValor: { ...tipografia.rotulo, color: cores.texto },
  linhaValorDestaque: { ...tipografia.secao, color: cores.texto },
  divisor: {
    height: 1,
    backgroundColor: cores.divisor,
    marginVertical: espacamento.sm,
  },
  nota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    lineHeight: 17,
  },

  entradaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.md,
    paddingVertical: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
  },
  entradaData: {
    width: 48,
    alignItems: 'center',
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.sm,
    paddingVertical: espacamento.xs,
  },
  entradaDia: { ...tipografia.rotulo, color: cores.primaria },
  entradaFardos: { ...tipografia.rotulo, color: cores.texto },
  entradaSacolas: { ...tipografia.legenda, color: cores.textoSecundario },
  entradaMeta: { ...tipografia.legenda, color: cores.textoSecundario },
});

export default SacolasDetalheScreen;
