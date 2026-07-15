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
import { arrecadacaoService } from '../../api/services';
import {
  ComparativoIndicador,
  DetalheArrecadacao,
  ItemRankingArrecadacao,
  Periodo,
  PontoTendencia,
  ProjecaoMes,
  ResumoArrecadacao,
  ResumoNaoReconhecido,
} from '../../api/types';
import {
  Botao,
  Carregando,
  Cartao,
  EstadoVazio,
  GraficoPizza,
  MensagemErro,
  montarFatias,
  Segmentado,
  Selo,
  SeletorData,
  Tela,
} from '../../components';
import { useAuth } from '../../auth/AuthContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';
import {
  formatarData,
  formatarMoeda,
  formatarPercentual,
  hojeISO,
} from '../../utils/formato';
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

/** Card de projeção de fechamento de mês + meta diária. */
function CardProjecao({
  def,
  projecao,
}: {
  def: DefinicaoArrecadacao;
  projecao: ProjecaoMes;
}): React.ReactElement {
  const cor = projecao.vaiCumprir ? cores.verde : cores.vermelho;
  const fundo = projecao.vaiCumprir ? cores.verdeFundo : cores.vermelhoFundo;
  return (
    <Cartao titulo="Projeção do mês">
      <View style={styles.projLinha}>
        <Text style={styles.projRotulo}>
          {def.base === 'FIXA' ? 'Projeção ao ritmo atual' : '% acumulado do mês'}
        </Text>
        <View style={[styles.projBadge, { backgroundColor: fundo }]}>
          <Text style={[styles.projBadgeTexto, { color: cor }]}>
            {def.base === 'FIXA'
              ? formatarMoeda(projecao.projecao)
              : formatarPercentual(projecao.projecao)}
          </Text>
        </View>
      </View>
      <Text style={[styles.projStatus, { color: cor }]}>
        {projecao.vaiCumprir
          ? def.base === 'FIXA'
            ? '✅ No ritmo de bater a meta'
            : '✅ Dentro da meta'
          : def.base === 'FIXA'
            ? `⚠️ Faltam ${formatarMoeda(Math.max(0, projecao.meta - projecao.acumuladoMes))} para a meta`
            : '⚠️ Acima da meta de %'}
      </Text>
      {def.base === 'FIXA' && (
        <View style={styles.projDetalhes}>
          <Text style={styles.projDetalheItem}>
            Meta diária: {formatarMoeda(projecao.metaDiaria)}
          </Text>
          <Text style={styles.projDetalheItem}>
            Ritmo ideal até hoje: {formatarMoeda(projecao.metaAcumuladaHoje)} · Real:{' '}
            {formatarMoeda(projecao.acumuladoMes)}
          </Text>
        </View>
      )}
    </Cartao>
  );
}

/** Card comparativo: mês e semana atual vs período anterior. */
function CardComparativo({
  comparativo,
}: {
  comparativo: ComparativoIndicador;
}): React.ReactElement {
  const linha = (rotulo: string, atual: number, variacao: number | null) => {
    const subiu = variacao != null && variacao >= 0;
    const corVar = variacao == null ? cores.textoSecundario : subiu ? cores.verde : cores.vermelho;
    const seta = variacao == null ? '–' : subiu ? '↑' : '↓';
    return (
      <View style={styles.compLinha}>
        <Text style={styles.compRotulo}>{rotulo}</Text>
        <Text style={styles.compValor}>{formatarMoeda(atual)}</Text>
        <Text style={[styles.compVar, { color: corVar }]}>
          {seta} {variacao == null ? '—' : `${Math.abs(variacao)}%`}
        </Text>
      </View>
    );
  };
  return (
    <Cartao titulo="Comparativo com período anterior">
      <View style={styles.compCabecalho}>
        <Text style={[styles.compRotulo, styles.compCab]}>Período</Text>
        <Text style={[styles.compValor, styles.compCab]}>Atual</Text>
        <Text style={[styles.compVar, styles.compCab]}>vs anterior</Text>
      </View>
      {linha('Este mês', comparativo.mes.atual, comparativo.mes.variacao)}
      {linha(
        'Esta semana',
        comparativo.semana.atual,
        comparativo.semana.variacao,
      )}
    </Cartao>
  );
}

/** Mini gráfico de barras verticais da tendência (últimos dias). */
function CardTendencia({
  def,
  pontos,
}: {
  def: DefinicaoArrecadacao;
  pontos: PontoTendencia[];
}): React.ReactElement {
  const valores = pontos.map((p) =>
    def.base === 'VENDAS' ? p.percentual ?? 0 : p.total,
  );
  const max = Math.max(...valores, 0.0001);
  return (
    <Cartao titulo="Tendência (últimos 14 dias)">
      <View style={styles.sparkRow}>
        {pontos.map((p, i) => {
          const v = valores[i];
          const altura = Math.max(2, (v / max) * 60);
          const dia = p.data.slice(8, 10);
          return (
            <View key={p.data} style={styles.sparkCol}>
              <View style={[styles.sparkBar, { height: altura, backgroundColor: cores.primaria }]} />
              <Text style={styles.sparkDia}>{dia}</Text>
            </View>
          );
        })}
      </View>
      {pontos.length === 0 && (
        <Text style={styles.semDetalhe}>Sem dados no período.</Text>
      )}
    </Cartao>
  );
}

export function IndicadorDetalheScreen({
  route,
  navigation,
}: PropsTela<'IndicadorDetalhe'>): React.ReactElement {
  const { tipo, operadorNome, alertaMensagem } = route.params;
  const { podeAcessar } = useAuth();
  const def =
    ARRECADACAO.find((d) => d.tipo === tipo) ?? ARRECADACAO[0];
  // Chegou de um "ponto de atenção": foca o detalhe na causa (escopo do mês).
  const foco = !!alertaMensagem || !!operadorNome;

  const [data, setData] = useState(hojeISO());
  const [periodo, setPeriodo] = useState<Periodo>(foco ? 'MES' : 'DIA');

  const req = useRequisicao(async () => {
    const { inicio, fim } = intervaloDoPeriodo(periodo, data);
    const [resumo, ranking, detalhes, tendencia, comparativo, projecao, naoReconhecidos] =
      await Promise.all([
        arrecadacaoService.resumo(def.tipo, data),
        arrecadacaoService.ranking(def.tipo, inicio, fim),
        def.mostraDetalhe || foco
          ? arrecadacaoService.detalhes(def.tipo, inicio, fim)
          : Promise.resolve([] as DetalheArrecadacao[]),
        arrecadacaoService.tendencia(def.tipo, data, 14).catch(() => [] as PontoTendencia[]),
        arrecadacaoService.comparativo(def.tipo, data).catch(() => null),
        arrecadacaoService.projecao(def.tipo, data).catch(() => null),
        arrecadacaoService
          .naoReconhecidosResumo(def.tipo, inicio, fim)
          .catch(() => null),
      ]);
    return { resumo, ranking, detalhes, tendencia, comparativo, projecao, naoReconhecidos };
  }, [def.tipo, data, periodo]);

  const resumo = req.dados?.resumo;
  const ranking: ItemRankingArrecadacao[] = req.dados?.ranking ?? [];
  const detalhes: DetalheArrecadacao[] = req.dados?.detalhes ?? [];
  const tendencia: PontoTendencia[] = req.dados?.tendencia ?? [];
  const comparativo: ComparativoIndicador | null = req.dados?.comparativo ?? null;
  const projecao: ProjecaoMes | null = req.dados?.projecao ?? null;
  const naoReconhecidos: ResumoNaoReconhecido | null =
    req.dados?.naoReconhecidos ?? null;
  const maxRanking = ranking.length > 0 ? ranking[0].total : 0;

  // Lançamentos que disparam a atenção: já vêm por maior valor (backend). Se a
  // alerta é de um operador, filtra só os dele; senão, os maiores do período.
  const focoLista = React.useMemo(() => {
    if (!foco) return [] as DetalheArrecadacao[];
    const lista = req.dados?.detalhes ?? [];
    const alvo = (operadorNome ?? '').trim().toLowerCase();
    const filtrada = alvo
      ? lista.filter((d) => d.nome.trim().toLowerCase() === alvo)
      : lista;
    return filtrada.slice(0, 20);
  }, [foco, operadorNome, req.dados]);

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
          {/* Chegou de um "ponto de atenção": mostra a CAUSA em primeiro lugar. */}
          {foco ? (
            <Cartao titulo="O que disparou a atenção">
              {alertaMensagem ? (
                <Text style={styles.focoMensagem}>{alertaMensagem}</Text>
              ) : null}
              <Text style={styles.focoSub}>
                {operadorNome
                  ? `Lançamentos de ${operadorNome} no mês (maiores primeiro)`
                  : 'Maiores lançamentos do mês'}
              </Text>
              {focoLista.length > 0 ? (
                focoLista.map((d, idx) => (
                  <View key={`foco-${idx}`} style={styles.detalheItem}>
                    <View style={styles.detalheTopo}>
                      <Text style={styles.detalheNome} numberOfLines={1}>
                        {formatarData(d.data)}
                        {operadorNome ? '' : ` · ${d.nome}`}
                      </Text>
                      <Text style={styles.detalheValor}>
                        {formatarMoeda(d.valor)}
                      </Text>
                    </View>
                    {d.quantidade != null && d.quantidade > 0 ? (
                      <Text style={styles.detalheLinha}>
                        {rotuloItens(d.quantidade)}
                      </Text>
                    ) : null}
                    {d.motivo ? (
                      <Text style={styles.detalheLinha}>Motivo: {d.motivo}</Text>
                    ) : null}
                    {d.autorizadoPor ? (
                      <Text style={styles.detalheLinha}>
                        Autorizado por: {d.autorizadoPor}
                      </Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={styles.semDetalhe}>
                  Sem lançamentos individuais no período.
                </Text>
              )}
            </Cartao>
          ) : null}

          <GraficoMeta def={def} resumo={resumo} periodo={periodo} />
          {projecao ? <CardProjecao def={def} projecao={projecao} /> : null}
          {comparativo ? <CardComparativo comparativo={comparativo} /> : null}
          <CardTendencia def={def} pontos={tendencia} />
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

          {naoReconhecidos && naoReconhecidos.lancamentos > 0 ? (
            <Cartao titulo="Não reconhecidos">
              <Text style={styles.naoRecLinha}>
                {formatarMoeda(naoReconhecidos.total)} ·{' '}
                {naoReconhecidos.lancamentos} lançamento(s) sem cadastro
              </Text>
              <Text style={styles.naoRecAjuda}>
                Já incluído no total acima. São códigos do arquivo que não casam
                com nenhum cadastro (ex.: pessoas de fora).
              </Text>
              {podeAcessar('OPERADORES_CRUD') ? (
                <Botao
                  titulo="Ver e associar"
                  variante="secundario"
                  aoPressionar={() => navigation.navigate('NaoReconhecidos')}
                />
              ) : null}
            </Cartao>
          ) : null}

          {ranking.some((r) => r.total > 0) ? (
            <Cartao
              titulo={`Participação por ${def.rankingDe ?? 'operadores'}`}
            >
              <GraficoPizza
                fatias={montarFatias(
                  ranking.map((r) => ({ rotulo: r.nome, valor: r.total })),
                )}
              />
            </Cartao>
          ) : (
            <Cartao
              titulo={`Participação por ${def.rankingDe ?? 'operadores'}`}
            >
              <GraficoPizza fatias={[]} />
              <Text style={styles.semDetalhe}>
                Sem dados no período. Envie o arquivo em Importações.
              </Text>
            </Cartao>
          )}

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
  focoMensagem: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
  },
  focoSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    marginBottom: espacamento.sm,
  },
  naoRecLinha: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '700',
  },
  naoRecAjuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    marginBottom: espacamento.sm,
  },
  projLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  projRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    flex: 1,
  },
  projBadge: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  projBadgeTexto: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  projStatus: {
    ...tipografia.legenda,
    fontWeight: '600',
    marginTop: espacamento.sm,
  },
  projDetalhes: {
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  projDetalheItem: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    paddingVertical: 1,
  },
  compCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  compCab: {
    color: cores.textoSecundario,
    fontWeight: '700',
  },
  compLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
  },
  compRotulo: {
    ...tipografia.legenda,
    color: cores.texto,
    flex: 1,
  },
  compValor: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '700',
    width: 100,
    textAlign: 'right',
  },
  compVar: {
    ...tipografia.legenda,
    fontWeight: '700',
    width: 80,
    textAlign: 'right',
  },
  sparkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 80,
    gap: 2,
  },
  sparkCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  sparkBar: {
    width: '70%',
    borderRadius: 2,
  },
  sparkDia: {
    fontSize: 9,
    color: cores.textoSecundario,
  },
});

export default IndicadorDetalheScreen;
