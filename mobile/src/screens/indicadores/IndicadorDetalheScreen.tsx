/**
 * Detalhe de um indicador de arrecadação (ex.: Troco Solidário).
 *
 * Mostra, para a data e o período selecionados: o status (verde/amarelo/
 * vermelho) frente à meta, o progresso da meta, um gráfico comparativo por
 * período (dia/semana/mês), o ranking por operador (ou fiscal) em barras e,
 * quando aplicável (cupom), a lista de cancelamentos com autorização e motivo.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { arrecadacaoService } from '../../api/services';
import {
  DetalheArrecadacao,
  ItemRankingArrecadacao,
  Periodo,
  ResumoArrecadacao,
} from '../../api/types';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Segmentado,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarMoeda, formatarPercentual, hojeISO } from '../../utils/formato';
import { ARRECADACAO, DefinicaoArrecadacao } from '../../utils/rotulos';

const OPCOES_PERIODO: { valor: Periodo; rotulo: string }[] = [
  { valor: 'DIA', rotulo: 'Dia' },
  { valor: 'SEMANA', rotulo: 'Semana' },
  { valor: 'MES', rotulo: 'Mês' },
];

const ROTULO_PERIODO: Record<Periodo, string> = {
  DIA: 'no dia',
  SEMANA: 'na semana',
  MES: 'no mês',
};

function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function intervaloDoPeriodo(
  periodo: Periodo,
  dataISO: string,
): { inicio: string; fim: string } {
  const d = new Date(`${dataISO}T00:00:00.000Z`);
  if (periodo === 'DIA') {
    return { inicio: dataISO, fim: dataISO };
  }
  if (periodo === 'SEMANA') {
    const dow = d.getUTCDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const ini = new Date(d);
    ini.setUTCDate(d.getUTCDate() + diff);
    const fim = new Date(ini);
    fim.setUTCDate(ini.getUTCDate() + 6);
    return { inicio: iso(ini), fim: iso(fim) };
  }
  const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { inicio: iso(ini), fim: iso(fim) };
}

function totalDoPeriodo(resumo: ResumoArrecadacao, periodo: Periodo): number {
  if (periodo === 'DIA') return resumo.totalDia;
  if (periodo === 'SEMANA') return resumo.totalSemana;
  return resumo.totalMes;
}

function percentualDoPeriodo(
  resumo: ResumoArrecadacao,
  periodo: Periodo,
): number | undefined {
  if (periodo === 'DIA') return resumo.percentualDia;
  if (periodo === 'SEMANA') return resumo.percentualSemana;
  return resumo.percentualMes;
}

function vendasDoPeriodo(
  resumo: ResumoArrecadacao,
  periodo: Periodo,
): number | undefined {
  if (periodo === 'DIA') return resumo.vendasDia;
  if (periodo === 'SEMANA') return resumo.vendasSemana;
  return resumo.vendasMes;
}

function rotuloItens(q: number): string {
  return `${q} ${q === 1 ? 'item' : 'itens'}`;
}

interface CorStatus {
  cor: string;
  fundo: string;
  rotulo: string;
}

function avaliarCor(
  def: DefinicaoArrecadacao,
  resumo: ResumoArrecadacao,
  periodo: Periodo,
): CorStatus {
  if (def.base === 'FIXA') {
    const total = totalDoPeriodo(resumo, periodo);
    if (total >= def.meta) {
      return { cor: cores.verde, fundo: cores.verdeFundo, rotulo: 'Meta batida' };
    }
    if (total >= def.meta * 0.75) {
      return { cor: cores.amarelo, fundo: cores.amareloFundo, rotulo: 'Quase lá' };
    }
    return { cor: cores.vermelho, fundo: cores.vermelhoFundo, rotulo: 'Abaixo' };
  }
  const vendas = vendasDoPeriodo(resumo, periodo) ?? 0;
  if (vendas <= 0) {
    return {
      cor: cores.textoSecundario,
      fundo: cores.divisor,
      rotulo: 'Sem vendas',
    };
  }
  const pct = percentualDoPeriodo(resumo, periodo) ?? 0;
  if (pct <= def.meta) {
    return { cor: cores.verde, fundo: cores.verdeFundo, rotulo: 'Dentro da meta' };
  }
  if (pct <= def.meta * 1.5) {
    return { cor: cores.amarelo, fundo: cores.amareloFundo, rotulo: 'Atenção' };
  }
  return { cor: cores.vermelho, fundo: cores.vermelhoFundo, rotulo: 'Acima da meta' };
}

/** Barra horizontal simples (gráfico) com rótulo à esquerda e valor à direita. */
function Barra({
  rotulo,
  textoValor,
  fracao,
  cor,
}: {
  rotulo: string;
  textoValor: string;
  fracao: number;
  cor: string;
}): React.ReactElement {
  const pct = Math.max(0, Math.min(1, fracao)) * 100;
  return (
    <View style={styles.barraLinha}>
      <Text style={styles.barraRotulo} numberOfLines={1}>
        {rotulo}
      </Text>
      <View style={styles.barraTrilho}>
        <View
          style={[
            styles.barraPreenchida,
            { width: `${Math.max(pct, 2)}%`, backgroundColor: cor },
          ]}
        />
      </View>
      <Text style={styles.barraValor} numberOfLines={1}>
        {textoValor}
      </Text>
    </View>
  );
}

/** Gráfico comparativo dos totais por período (dia/semana/mês). */
function GraficoPeriodos({
  resumo,
  base,
}: {
  resumo: ResumoArrecadacao;
  base: 'FIXA' | 'VENDAS';
}): React.ReactElement {
  const periodos: { rotulo: string; periodo: Periodo }[] = [
    { rotulo: 'Dia', periodo: 'DIA' },
    { rotulo: 'Semana', periodo: 'SEMANA' },
    { rotulo: 'Mês', periodo: 'MES' },
  ];
  const valores = periodos.map((p) => totalDoPeriodo(resumo, p.periodo));
  const max = Math.max(...valores, 0);
  return (
    <Cartao titulo="Comparativo por período">
      {periodos.map((p) => {
        const total = totalDoPeriodo(resumo, p.periodo);
        const texto =
          base === 'VENDAS'
            ? `${formatarMoeda(total)} · ${formatarPercentual(
                percentualDoPeriodo(resumo, p.periodo) ?? 0,
              )}`
            : formatarMoeda(total);
        return (
          <Barra
            key={p.periodo}
            rotulo={p.rotulo}
            textoValor={texto}
            fracao={max > 0 ? total / max : 0}
            cor={cores.primaria}
          />
        );
      })}
    </Cartao>
  );
}

/** Gráfico/medidor de progresso frente à meta, no período selecionado. */
function GraficoMeta({
  def,
  resumo,
  periodo,
}: {
  def: DefinicaoArrecadacao;
  resumo: ResumoArrecadacao;
  periodo: Periodo;
}): React.ReactElement {
  const cor = avaliarCor(def, resumo, periodo);
  let fracao = 0;
  let texto = '';
  if (def.base === 'FIXA') {
    const total = totalDoPeriodo(resumo, periodo);
    fracao = def.meta > 0 ? total / def.meta : 0;
    texto = `${formatarMoeda(total)} de ${formatarMoeda(def.meta)} (${formatarPercentual(
      def.meta > 0 ? (total / def.meta) * 100 : 0,
      0,
    )})`;
  } else {
    const pct = percentualDoPeriodo(resumo, periodo) ?? 0;
    // Escala: meta no meio da barra (fracao=0,5 quando pct==meta).
    fracao = def.meta > 0 ? pct / (def.meta * 2) : 0;
    texto = `${formatarPercentual(pct)} (meta até ${formatarPercentual(def.meta)})`;
  }
  return (
    <Cartao titulo="Meta">
      <Barra
        rotulo={ROTULO_PERIODO[periodo]}
        textoValor={texto}
        fracao={fracao}
        cor={cor.cor}
      />
    </Cartao>
  );
}

/** Paleta de cores para as fatias do gráfico pizza. */
const CORES_PIZZA = [
  '#C8102E',
  '#1E9E5A',
  '#C99700',
  '#2E6FD2',
  '#8E44AD',
  '#E67E22',
  '#16A085',
  '#7F8C8D',
];

interface FatiaPizza {
  rotulo: string;
  valor: number;
  cor: string;
}

/**
 * Monta as fatias do gráfico a partir do ranking: mostra os maiores e agrupa
 * o restante em "Outros", para o gráfico não ficar poluído.
 */
function montarFatias(
  ranking: ItemRankingArrecadacao[],
  maximoFatias = 6,
): FatiaPizza[] {
  const positivos = ranking.filter((r) => r.total > 0);
  const principais = positivos.slice(0, maximoFatias);
  const fatias: FatiaPizza[] = principais.map((r, i) => ({
    rotulo: r.nome,
    valor: r.total,
    cor: CORES_PIZZA[i % CORES_PIZZA.length],
  }));
  const resto = positivos.slice(maximoFatias);
  if (resto.length > 0) {
    fatias.push({
      rotulo: `Outros (${resto.length})`,
      valor: resto.reduce((s, r) => s + r.total, 0),
      cor: CORES_PIZZA[CORES_PIZZA.length - 1],
    });
  }
  return fatias;
}

/** Gráfico pizza (rosca) com legenda de participação por pessoa. */
function GraficoPizza({
  fatias,
}: {
  fatias: FatiaPizza[];
}): React.ReactElement {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const tamanho = 180;
  const espessura = 34;
  const raio = (tamanho - espessura) / 2;
  const circunferencia = 2 * Math.PI * raio;
  let acumulado = 0;

  return (
    <View style={styles.pizzaContainer}>
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
                  strokeWidth={espessura}
                  fill="none"
                  strokeDasharray={`${comprimento} ${circunferencia - comprimento}`}
                  strokeDashoffset={-acumulado}
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
      <View style={styles.legenda}>
        {fatias.map((f, i) => {
          const pct = total > 0 ? (f.valor / total) * 100 : 0;
          return (
            <View key={`${f.rotulo}-leg-${i}`} style={styles.legendaLinha}>
              <View style={[styles.legendaPonto, { backgroundColor: f.cor }]} />
              <Text style={styles.legendaNome} numberOfLines={1}>
                {f.rotulo}
              </Text>
              <Text style={styles.legendaValor}>
                {formatarPercentual(pct, 0)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function IndicadorDetalheScreen({
  route,
}: PropsTela<'IndicadorDetalhe'>): React.ReactElement {
  const { tipo } = route.params;
  const def =
    ARRECADACAO.find((d) => d.tipo === tipo) ?? ARRECADACAO[0];

  const [data, setData] = useState(hojeISO());
  const [periodo, setPeriodo] = useState<Periodo>('DIA');

  const req = useRequisicao(async () => {
    const { inicio, fim } = intervaloDoPeriodo(periodo, data);
    const [resumo, ranking, detalhes] = await Promise.all([
      arrecadacaoService.resumo(def.tipo, data),
      arrecadacaoService.ranking(def.tipo, inicio, fim),
      def.mostraDetalhe
        ? arrecadacaoService.detalhes(def.tipo, inicio, fim)
        : Promise.resolve([] as DetalheArrecadacao[]),
    ]);
    return { resumo, ranking, detalhes };
  }, [def.tipo, data, periodo]);

  const resumo = req.dados?.resumo;
  const ranking: ItemRankingArrecadacao[] = req.dados?.ranking ?? [];
  const detalhes: DetalheArrecadacao[] = req.dados?.detalhes ?? [];
  const maxRanking = ranking.length > 0 ? ranking[0].total : 0;

  const metaTexto =
    def.base === 'FIXA'
      ? `Meta: ${formatarMoeda(def.meta)} (fixa)`
      : `Meta: até ${formatarPercentual(def.meta)} das vendas`;

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <Cartao>
        <View style={styles.cabecalho}>
          <View style={styles.cabecalhoTitulo}>
            <Ionicons
              name={def.icone as keyof typeof Ionicons.glyphMap}
              size={22}
              color={cores.primaria}
            />
            <Text style={styles.titulo}>{def.titulo}</Text>
          </View>
          {resumo
            ? (() => {
                const c = avaliarCor(def, resumo, periodo);
                return <Selo texto={c.rotulo} cor={c.cor} fundo={c.fundo} />;
              })()
            : null}
        </View>
        <Text style={styles.descricao}>{def.descricao}</Text>
        <Text style={styles.meta}>{metaTexto}</Text>
        <SeletorData valor={data} aoMudar={setData} rotulo="Data de referência" />
        <Text style={styles.periodoRotulo}>Período</Text>
        <Segmentado
          opcoes={OPCOES_PERIODO}
          selecionado={periodo}
          aoSelecionar={setPeriodo}
        />
      </Cartao>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : resumo ? (
        <>
          <GraficoMeta def={def} resumo={resumo} periodo={periodo} />
          <GraficoPeriodos resumo={resumo} base={def.base} />

          <Cartao
            titulo={`Ranking de ${def.rankingDe ?? 'operadores'} ${ROTULO_PERIODO[periodo]}`}
          >
            {ranking.length > 0 ? (
              ranking.map((item, idx) => (
                <Barra
                  key={`${item.nome}-${idx}`}
                  rotulo={`${idx + 1}º ${item.nome}`}
                  textoValor={
                    item.quantidade != null
                      ? `${formatarMoeda(item.total)} · ${rotuloItens(item.quantidade)}`
                      : formatarMoeda(item.total)
                  }
                  fracao={maxRanking > 0 ? item.total / maxRanking : 0}
                  cor={cores.primaria}
                />
              ))
            ) : (
              <EstadoVazio
                icone="trophy-outline"
                titulo="Sem dados"
                descricao="Nenhum arquivo importado neste período."
              />
            )}
          </Cartao>

          {ranking.some((r) => r.total > 0) ? (
            <Cartao
              titulo={`Participação por ${def.rankingDe ?? 'operadores'}`}
            >
              <GraficoPizza fatias={montarFatias(ranking)} />
            </Cartao>
          ) : null}

          {def.mostraDetalhe ? (
            <Cartao titulo={`Cancelamentos ${ROTULO_PERIODO[periodo]}`}>
              {detalhes.length > 0 ? (
                detalhes.map((d, idx) => (
                  <View key={`${d.nome}-${idx}`} style={styles.detalheItem}>
                    <View style={styles.detalheTopo}>
                      <Text style={styles.detalheNome} numberOfLines={1}>
                        {d.nome}
                      </Text>
                      <Text style={styles.detalheValor}>
                        {formatarMoeda(d.valor)}
                      </Text>
                    </View>
                    {d.autorizadoPor ? (
                      <Text style={styles.detalheLinha}>
                        Autorizado por: {d.autorizadoPor}
                      </Text>
                    ) : null}
                    {d.motivo ? (
                      <Text style={styles.detalheLinha}>Motivo: {d.motivo}</Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={styles.semDetalhe}>
                  Nenhum cancelamento no período.
                </Text>
              )}
            </Cartao>
          ) : null}
        </>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: espacamento.xs,
  },
  cabecalhoTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    flex: 1,
  },
  titulo: {
    ...tipografia.secao,
    color: cores.texto,
    flexShrink: 1,
  },
  descricao: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  meta: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: espacamento.sm,
  },
  periodoRotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  barraLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
  },
  barraRotulo: {
    ...tipografia.legenda,
    color: cores.texto,
    width: 96,
  },
  barraTrilho: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
  },
  barraPreenchida: {
    height: '100%',
    borderRadius: 6,
  },
  barraValor: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '700',
    width: 132,
    textAlign: 'right',
  },
  detalheItem: {
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  detalheTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacamento.sm,
  },
  detalheNome: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
    flex: 1,
  },
  detalheValor: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.primaria,
  },
  detalheLinha: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  semDetalhe: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: espacamento.sm,
  },
  pizzaContainer: {
    alignItems: 'center',
    gap: espacamento.md,
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
  legendaPonto: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendaNome: {
    ...tipografia.legenda,
    color: cores.texto,
    flex: 1,
  },
  legendaValor: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '700',
  },
});

export default IndicadorDetalheScreen;
