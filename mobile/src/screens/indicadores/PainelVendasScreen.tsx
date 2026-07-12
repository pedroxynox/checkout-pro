/**
 * Painel de Vendas inteligente.
 *
 * As vendas por hora são carregadas na seção Importações (pelo usuário de
 * carga). Aqui consolidamos a inteligência do faturamento:
 *  - Panorama: meta mensal + progresso, projeção de fechamento (run-rate) e
 *    comparativos automáticos por data (dia/semana/mês vs período anterior).
 *  - Tendência dos últimos 30 dias.
 *  - Análise: curva horária típica, heatmap hora x dia da semana e padrão por
 *    dia da semana.
 *  - Gestão: edição da meta mensal (perfis com PAINEL_VENDAS_EDITAR).
 *
 * O detalhe livre por hora/período (valor líquido de cada hora) fica embaixo.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { vendasService } from '../../api/services';
import { PainelVendas, VendasPorHora } from '../../api/types';
import {
  Aviso,
  Carregando,
  Cartao,
  EstadoVazio,
  GraficoBarrasVerticais,
  GraficoPizza,
  MensagemErro,
  Segmentado,
  SeletorData,
  Tela,
  montarFatias,
} from '../../components';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import {
  formatarData,
  formatarMoeda,
  formatarPercentual,
  hojeISO,
} from '../../utils/formato';

type PeriodoGrafico = 'DIA' | 'SEMANA' | 'MES' | 'PERSONALIZADO';

const OPCOES_PERIODO: { valor: PeriodoGrafico; rotulo: string }[] = [
  { valor: 'DIA', rotulo: 'Dia' },
  { valor: 'SEMANA', rotulo: 'Semana' },
  { valor: 'MES', rotulo: 'Mês' },
  { valor: 'PERSONALIZADO', rotulo: 'Período' },
];

/** Ordem de exibição dos dias da semana (Seg..Sáb, Dom no fim). */
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const NOMES_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function intervaloDoPeriodo(
  periodo: PeriodoGrafico,
  dataISO: string,
  inicioPers: string,
  fimPers: string,
): { inicio: string; fim: string } {
  if (periodo === 'PERSONALIZADO') {
    return inicioPers <= fimPers
      ? { inicio: inicioPers, fim: fimPers }
      : { inicio: fimPers, fim: inicioPers };
  }
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

/** Barra de progresso horizontal (0–100%). */
function BarraProgresso({
  percentual,
  cor = cores.verde,
}: {
  percentual: number;
  cor?: string;
}): React.ReactElement {
  const largura = `${Math.max(0, Math.min(100, percentual))}%` as `${number}%`;
  return (
    <View style={styles.barraTrilha}>
      <View style={[styles.barraPreenchida, { width: largura, backgroundColor: cor }]} />
    </View>
  );
}

/** Linha de comparativo (atual vs anterior + variação). */
function LinhaComparativo({
  rotulo,
  atual,
  anterior,
  variacao,
}: {
  rotulo: string;
  atual: number;
  anterior: number;
  variacao: number | null;
}): React.ReactElement {
  const cor =
    variacao == null ? cores.textoSecundario : variacao >= 0 ? cores.verde : cores.vermelho;
  return (
    <View style={styles.compLinha}>
      <Text style={styles.compRotulo}>{rotulo}</Text>
      <View style={styles.compValores}>
        <Text style={styles.compAtual}>{formatarMoeda(atual)}</Text>
        <Text style={styles.compAnterior}>antes {formatarMoeda(anterior)}</Text>
      </View>
      <Text style={[styles.compVariacao, { color: cor }]}>
        {variacao == null
          ? '—'
          : `${variacao >= 0 ? '↑' : '↓'} ${formatarPercentual(Math.abs(variacao), 0)}`}
      </Text>
    </View>
  );
}

/** Heatmap hora x dia da semana (intensidade pela média de venda). */
function Heatmap({
  matriz,
  horas,
}: {
  matriz: number[][];
  horas: number[];
}): React.ReactElement {
  const max = Math.max(
    1,
    ...matriz.flatMap((linha) => horas.map((h) => linha[h] ?? 0)),
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Cabeçalho de horas */}
        <View style={styles.heatLinha}>
          <View style={styles.heatRotuloDia} />
          {horas.map((h) => (
            <Text key={h} style={styles.heatRotuloHora}>
              {h}
            </Text>
          ))}
        </View>
        {ORDEM_SEMANA.map((dow) => (
          <View key={dow} style={styles.heatLinha}>
            <Text style={styles.heatRotuloDia}>{NOMES_SEMANA[dow]}</Text>
            {horas.map((h) => {
              const v = matriz[dow]?.[h] ?? 0;
              const intensidade = v > 0 ? 0.15 + 0.85 * (v / max) : 0;
              return (
                <View
                  key={h}
                  style={[
                    styles.heatCelula,
                    {
                      backgroundColor:
                        v > 0 ? `rgba(30,158,90,${intensidade})` : cores.divisor,
                    },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function PainelVendasScreen(): React.ReactElement {
  const { dataInicial } = useConfigSistema();
  const [data, setData] = useState(hojeISO());
  const [periodo, setPeriodo] = useState<PeriodoGrafico>('DIA');
  const [inicioPers, setInicioPers] = useState(hojeISO());
  const [fimPers, setFimPers] = useState(hojeISO());

  const { inicio, fim } = intervaloDoPeriodo(periodo, data, inicioPers, fimPers);

  const painelReq = useRequisicao(() => vendasService.painel(data), [data]);
  const painel: PainelVendas | null = painelReq.dados ?? null;

  const detalheReq = useRequisicao(
    () => vendasService.porHora(inicio, fim),
    [periodo, inicio, fim],
  );
  const porHora: VendasPorHora | undefined = detalheReq.dados ?? undefined;

  // Vendas por hora do dia de referência (valor líquido de cada hora).
  const diaReq = useRequisicao(
    () => vendasService.porHora(data, data),
    [data],
  );
  const porHoraDia: VendasPorHora | undefined = diaReq.dados ?? undefined;

  // Horas operacionais (com venda na curva típica) para gráficos e heatmap.
  const horasOperacionais = (painel?.curvaHoraria ?? [])
    .filter((c) => c.valor > 0)
    .map((c) => c.hora);

  const metaPct = painel ? painel.metaProgresso * 100 : 0;
  const corMeta = metaPct >= 100 ? cores.verde : metaPct >= 60 ? cores.amarelo : cores.vermelho;
  const projVar = painel?.projecaoVsMeta ?? null;

  // Venda do dia (destaque no topo) + comparação com o mesmo dia do mês anterior.
  const varDia = painel?.comparativos.dia.variacao ?? null;
  const corDia =
    varDia == null ? cores.textoSecundario : varDia >= 0 ? cores.verde : cores.vermelho;

  const dadosCurva = (painel?.curvaHoraria ?? [])
    .filter((c) => c.valor > 0)
    .map((c) => ({ rotulo: `${c.hora}h`, valor: c.valor }));

  const dadosPadrao = painel
    ? ORDEM_SEMANA.map((dow) => {
        const p = painel.padraoDiaSemana.find((x) => x.diaSemana === dow);
        return { rotulo: NOMES_SEMANA[dow], valor: p?.media ?? 0 };
      }).filter((d) => d.valor > 0)
    : [];

  const horas = porHora?.horas ?? [];
  const dadosBarras = horas.map((h) => ({ rotulo: `${h.hora}h`, valor: h.valor }));

  const horasDia = porHoraDia?.horas ?? [];
  // Fatias do gráfico de pizza, ordenadas da hora que MAIS vendeu para a que
  // MENOS vendeu (montarFatias preserva a ordem dos itens recebidos).
  const fatiasDia = montarFatias(
    [...horasDia]
      .filter((h) => h.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .map((h) => ({ rotulo: `${h.hora}h às ${h.hora + 1}h`, valor: h.valor })),
    24,
  );

  return (
    <Tela
      aoAtualizar={() => {
        painelReq.recarregar();
        detalheReq.recarregar();
        diaReq.recarregar();
      }}
      atualizando={painelReq.atualizando || detalheReq.atualizando}
    >
      <SeletorData
        valor={data}
        aoMudar={setData}
        rotulo="Data de referência"
        dataMinima={dataInicial}
      />

      {painelReq.carregando ? (
        <Carregando />
      ) : painelReq.erro ? (
        <MensagemErro mensagem={painelReq.erro} aoTentarNovamente={painelReq.recarregar} />
      ) : painel ? (
        <>
          {/* ----- Venda do dia (destaque, primeiro) ----- */}
          <Cartao titulo="Venda do dia">
            <Text style={styles.vendaDiaValor}>
              {formatarMoeda(painel.comparativos.dia.atual)}
            </Text>
            <Text style={styles.vendaDiaData}>{formatarData(data)}</Text>
            <View style={styles.vendaDiaComp}>
              <Text style={styles.vendaDiaAntes}>
                antes {formatarMoeda(painel.comparativos.dia.anterior)}
              </Text>
              <Text style={[styles.vendaDiaVar, { color: corDia }]}>
                {varDia == null
                  ? '—'
                  : `${varDia >= 0 ? '↑' : '↓'} ${formatarPercentual(Math.abs(varDia), 0)}`}
              </Text>
            </View>
          </Cartao>

          {/* ----- Panorama: meta + projeção ----- */}
          <Cartao titulo="Meta do mês">
            {painel.metaMensal > 0 ? (
              <>
                <View style={styles.metaTopo}>
                  <Text style={styles.metaArrecadado}>{formatarMoeda(painel.arrecadadoMes)}</Text>
                  <Text style={styles.metaAlvo}>de {formatarMoeda(painel.metaMensal)}</Text>
                </View>
                <BarraProgresso percentual={metaPct} cor={corMeta} />
                <View style={styles.metaRodape}>
                  <Text style={[styles.metaPct, { color: corMeta }]}>
                    {formatarPercentual(metaPct, 0)} da meta
                  </Text>
                  <Text style={styles.metaProj}>
                    Projeção: {formatarMoeda(painel.projecaoFechamento)}
                    {projVar != null && (
                      <Text style={{ color: projVar >= 0 ? cores.verde : cores.vermelho }}>
                        {'  '}
                        {projVar >= 0 ? '↑' : '↓'} {formatarPercentual(Math.abs(projVar), 0)}
                      </Text>
                    )}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.metaArrecadado}>{formatarMoeda(painel.arrecadadoMes)}</Text>
                <Text style={styles.metaSub}>faturamento do mês</Text>
                <Text style={styles.metaProj}>
                  Projeção de fechamento: {formatarMoeda(painel.projecaoFechamento)}
                </Text>
                <Aviso texto="A meta do mês ainda não foi definida. O gestor pode defini-la em Centro de Controle ▸ Metas." />
              </>
            )}
            <Text style={styles.metaNota}>
              {painel.diasComVenda} de {painel.diasNoMes} dias com venda · média{' '}
              {formatarMoeda(painel.mediaDiaria)}/dia
            </Text>
          </Cartao>

          {/* ----- Horas que mais venderam (do dia, da maior para a menor) ----- */}
          <Cartao titulo="Horas que mais venderam">
            <Text style={styles.periodoTexto}>{formatarData(data)}</Text>
            {diaReq.carregando ? (
              <Carregando />
            ) : diaReq.erro ? (
              <MensagemErro mensagem={diaReq.erro} aoTentarNovamente={diaReq.recarregar} />
            ) : fatiasDia.length > 0 ? (
              <>
                <Text style={styles.totalPeriodo}>
                  Total do dia: {formatarMoeda(porHoraDia?.total ?? 0)}
                </Text>
                <GraficoPizza
                  fatias={fatiasDia}
                  mostrarValor
                  formatarValor={formatarMoeda}
                />
                <Text style={styles.metaNota}>
                  Da hora que mais vendeu para a que menos vendeu.
                </Text>
              </>
            ) : (
              <EstadoVazio
                icone="bar-chart-outline"
                titulo="Sem vendas no dia"
                descricao="As vendas são carregadas na seção Importações."
              />
            )}
          </Cartao>

          {/* ----- Comparativos por data ----- */}
          <Cartao titulo="Comparativos">
            <LinhaComparativo
              rotulo="Dia"
              atual={painel.comparativos.dia.atual}
              anterior={painel.comparativos.dia.anterior}
              variacao={painel.comparativos.dia.variacao}
            />
            <LinhaComparativo
              rotulo="Semana"
              atual={painel.comparativos.semana.atual}
              anterior={painel.comparativos.semana.anterior}
              variacao={painel.comparativos.semana.variacao}
            />
            <LinhaComparativo
              rotulo="Mês"
              atual={painel.comparativos.mes.atual}
              anterior={painel.comparativos.mes.anterior}
              variacao={painel.comparativos.mes.variacao}
            />
            <Text style={styles.metaNota}>
              Dia e mês comparam com o mesmo período do mês anterior; semana, com os 7 dias
              anteriores.
            </Text>
          </Cartao>

          {/* ----- Curva horária típica ----- */}
          {dadosCurva.length > 0 && (
            <Cartao titulo="Curva horária típica">
              {painel.horaPico != null && (
                <Text style={styles.destaqueTexto}>
                  Hora de pico: {painel.horaPico}h às {painel.horaPico + 1}h
                </Text>
              )}
              <GraficoBarrasVerticais dados={dadosCurva} />
            </Cartao>
          )}

          {/* ----- Heatmap hora x dia da semana ----- */}
          {horasOperacionais.length > 0 && (
            <Cartao titulo="Mapa de calor (dia × hora)">
              <Heatmap matriz={painel.heatmap} horas={horasOperacionais} />
              <Text style={styles.metaNota}>
                Mais escuro = mais vendas, em média, naquele dia e hora.
              </Text>
            </Cartao>
          )}

          {/* ----- Padrão por dia da semana ----- */}
          {dadosPadrao.length > 0 && (
            <Cartao titulo="Padrão por dia da semana">
              <GraficoBarrasVerticais dados={dadosPadrao} />
              <Text style={styles.metaNota}>Média do faturamento por dia da semana.</Text>
            </Cartao>
          )}

        </>
      ) : null}

      {/* ----- Detalhe livre por hora/período ----- */}
      <Cartao titulo="Vendas por hora (detalhe)">
        <Segmentado opcoes={OPCOES_PERIODO} selecionado={periodo} aoSelecionar={setPeriodo} />
        {periodo === 'PERSONALIZADO' ? (
          <>
            <SeletorData
              valor={inicioPers}
              aoMudar={setInicioPers}
              rotulo="Início"
              dataMinima={dataInicial}
            />
            <SeletorData
              valor={fimPers}
              aoMudar={setFimPers}
              rotulo="Fim"
              dataMinima={dataInicial}
            />
          </>
        ) : null}

        <Text style={styles.periodoTexto}>
          {inicio === fim
            ? `Período: ${formatarData(inicio)}`
            : `Período: ${formatarData(inicio)} a ${formatarData(fim)}`}
        </Text>

        {detalheReq.carregando ? (
          <Carregando />
        ) : detalheReq.erro ? (
          <MensagemErro mensagem={detalheReq.erro} aoTentarNovamente={detalheReq.recarregar} />
        ) : horas.length > 0 ? (
          <>
            <Text style={styles.totalPeriodo}>
              Total do período: {formatarMoeda(porHora?.total ?? 0)}
            </Text>
            <GraficoBarrasVerticais dados={dadosBarras} />
          </>
        ) : (
          <EstadoVazio
            icone="bar-chart-outline"
            titulo="Sem vendas no período"
            descricao="As vendas são carregadas na seção Importações."
          />
        )}
      </Cartao>
    </Tela>
  );
}

const styles = StyleSheet.create({
  // Venda do dia (destaque)
  vendaDiaValor: {
    fontSize: 30,
    fontWeight: '800',
    color: cores.primaria,
  },
  vendaDiaData: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  vendaDiaComp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  vendaDiaAntes: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  vendaDiaVar: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  metaTopo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  metaArrecadado: {
    fontSize: 24,
    fontWeight: '700',
    color: cores.texto,
  },
  metaAlvo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
  },
  metaSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  metaRodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: espacamento.xs,
    flexWrap: 'wrap',
  },
  metaPct: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  metaProj: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontWeight: '600',
    marginTop: espacamento.xs,
  },
  metaNota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    fontStyle: 'italic',
  },
  destaqueTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
    marginBottom: espacamento.sm,
  },
  // Comparativos
  compLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  compRotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    width: 64,
  },
  compValores: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: espacamento.sm,
  },
  compAtual: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
  },
  compAnterior: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  compVariacao: {
    ...tipografia.rotulo,
    fontWeight: '700',
    width: 72,
    textAlign: 'right',
  },
  // Heatmap
  heatLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  heatRotuloDia: {
    width: 34,
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  heatRotuloHora: {
    width: 18,
    textAlign: 'center',
    fontSize: 9,
    color: cores.textoSecundario,
  },
  heatCelula: {
    width: 16,
    height: 16,
    marginHorizontal: 1,
    borderRadius: 3,
  },
  // Detalhe
  totalPeriodo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.primaria,
    marginBottom: espacamento.sm,
  },
  periodoTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginVertical: espacamento.sm,
  },
  barraTrilha: {
    width: '100%',
    height: 12,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
  },
  barraPreenchida: {
    height: '100%',
    borderRadius: raio.pill,
  },
});

export default PainelVendasScreen;
