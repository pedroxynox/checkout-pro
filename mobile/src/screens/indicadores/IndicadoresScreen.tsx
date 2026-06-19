/**
 * Tela de Indicadores (arrecadação por operador).
 *
 * Divide-se em cinco mini-seções, uma por indicador: Troco Solidário, Recargas
 * de Celular, Cancelamento de Itens, Cancelamento de Cupom e Devoluções. Os
 * dados vêm dos arquivos .txt que o fiscal envia em Importações.
 *
 * Para cada indicador exibe o total do dia/semana/mês, a meta (fixa em R$ para
 * troco/recargas; % sobre as vendas para cancelamentos/devoluções) e o ranking
 * de operadores no período selecionado (dia, semana ou mês).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { arrecadacaoService } from '../../api/services';
import {
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
import { cores, espacamento, tipografia } from '../../theme';
import {
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

/** Intervalo [início, fim] (ISO) do período que contém a data informada. */
function intervaloDoPeriodo(
  periodo: Periodo,
  dataISO: string,
): { inicio: string; fim: string } {
  const d = new Date(`${dataISO}T00:00:00.000Z`);
  if (periodo === 'DIA') {
    return { inicio: dataISO, fim: dataISO };
  }
  if (periodo === 'SEMANA') {
    const dow = d.getUTCDay(); // 0=domingo
    const diff = dow === 0 ? -6 : 1 - dow;
    const ini = new Date(d);
    ini.setUTCDate(d.getUTCDate() + diff);
    const fim = new Date(ini);
    fim.setUTCDate(ini.getUTCDate() + 6);
    return { inicio: iso(ini), fim: iso(fim) };
  }
  // MES
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

function itensDoPeriodo(resumo: ResumoArrecadacao, periodo: Periodo): number {
  if (periodo === 'DIA') return resumo.itensDia;
  if (periodo === 'SEMANA') return resumo.itensSemana;
  return resumo.itensMes;
}

/** Texto "N item(ns)" para a quantidade (ex.: itens cancelados). */
function rotuloItens(q: number): string {
  return `${q} ${q === 1 ? 'item' : 'itens'}`;
}

interface CorStatus {
  cor: string;
  fundo: string;
  rotulo: string;
}

/** Avalia a cor (verde/amarelo/vermelho) do indicador no período. */
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
  // Base VENDAS (menor é melhor): compara o % com a meta.
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

function LinhaTotais({
  resumo,
  base,
}: {
  resumo: ResumoArrecadacao;
  base: 'FIXA' | 'VENDAS';
}): React.ReactElement {
  const itens: { rotulo: string; periodo: Periodo }[] = [
    { rotulo: 'Dia', periodo: 'DIA' },
    { rotulo: 'Semana', periodo: 'SEMANA' },
    { rotulo: 'Mês', periodo: 'MES' },
  ];
  return (
    <View style={styles.totais}>
      {itens.map((it) => (
        <View key={it.periodo} style={styles.totalBloco}>
          <Text style={styles.totalRotulo}>{it.rotulo}</Text>
          <Text style={styles.totalValor}>
            {formatarMoeda(totalDoPeriodo(resumo, it.periodo))}
          </Text>
          {base === 'VENDAS' ? (
            <Text style={styles.totalPct}>
              {formatarPercentual(percentualDoPeriodo(resumo, it.periodo) ?? 0)}
            </Text>
          ) : null}
          {itensDoPeriodo(resumo, it.periodo) > 0 ? (
            <Text style={styles.totalPct}>
              {rotuloItens(itensDoPeriodo(resumo, it.periodo))}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function SecaoIndicador({
  def,
  data,
  periodo,
}: {
  def: DefinicaoArrecadacao;
  data: string;
  periodo: Periodo;
}): React.ReactElement {
  const req = useRequisicao(async () => {
    const { inicio, fim } = intervaloDoPeriodo(periodo, data);
    const [resumo, ranking] = await Promise.all([
      arrecadacaoService.resumo(def.tipo, data),
      arrecadacaoService.ranking(def.tipo, inicio, fim),
    ]);
    return { resumo, ranking };
  }, [def.tipo, data, periodo]);

  const resumo = req.dados?.resumo;
  const ranking: ItemRankingArrecadacao[] = req.dados?.ranking ?? [];

  const metaTexto =
    def.base === 'FIXA'
      ? `Meta: ${formatarMoeda(def.meta)} (fixa)`
      : `Meta: até ${formatarPercentual(def.meta)} das vendas`;

  return (
    <Cartao>
      <View style={styles.cabecalho}>
        <View style={styles.cabecalhoTitulo}>
          <Ionicons
            name={def.icone as keyof typeof Ionicons.glyphMap}
            size={20}
            color={cores.primaria}
          />
          <Text style={styles.titulo}>{def.titulo}</Text>
        </View>
        {resumo ? (
          (() => {
            const c = avaliarCor(def, resumo, periodo);
            return <Selo texto={c.rotulo} cor={c.cor} fundo={c.fundo} />;
          })()
        ) : null}
      </View>
      <Text style={styles.descricao}>{def.descricao}</Text>
      <Text style={styles.meta}>{metaTexto}</Text>

      {req.carregando ? (
        <Carregando />
      ) : req.erro ? (
        <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
      ) : resumo ? (
        <>
          <LinhaTotais resumo={resumo} base={def.base} />

          <Text style={styles.rankingTitulo}>
            Ranking de operadores {ROTULO_PERIODO[periodo]}
          </Text>
          {ranking.length > 0 ? (
            <View>
              {ranking.map((item, idx) => (
                <View key={`${item.nome}-${idx}`} style={styles.rankingLinha}>
                  <Text style={styles.rankingPos}>{idx + 1}º</Text>
                  <Text style={styles.rankingNome} numberOfLines={1}>
                    {item.nome}
                  </Text>
                  <View style={styles.rankingDireita}>
                    <Text style={styles.rankingValor}>
                      {formatarMoeda(item.total)}
                    </Text>
                    {item.quantidade != null ? (
                      <Text style={styles.rankingQtd}>
                        {rotuloItens(item.quantidade)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EstadoVazio
              icone="trophy-outline"
              titulo="Sem dados"
              descricao="Nenhum arquivo importado neste período."
            />
          )}
        </>
      ) : null}
    </Cartao>
  );
}

export function IndicadoresScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());
  const [periodo, setPeriodo] = useState<Periodo>('DIA');

  return (
    <Tela>
      <Cartao>
        <SeletorData valor={data} aoMudar={setData} rotulo="Data de referência" />
        <Text style={styles.periodoRotulo}>Período do ranking</Text>
        <Segmentado
          opcoes={OPCOES_PERIODO}
          selecionado={periodo}
          aoSelecionar={setPeriodo}
        />
      </Cartao>

      {ARRECADACAO.map((def) => (
        <SecaoIndicador
          key={def.tipo}
          def={def}
          data={data}
          periodo={periodo}
        />
      ))}
    </Tela>
  );
}

const styles = StyleSheet.create({
  periodoRotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
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
  totais: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: espacamento.sm,
    marginBottom: espacamento.md,
  },
  totalBloco: {
    flex: 1,
    backgroundColor: cores.fundo,
    borderRadius: 10,
    paddingVertical: espacamento.sm,
    paddingHorizontal: espacamento.xs,
    alignItems: 'center',
  },
  totalRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  totalValor: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
    marginTop: 2,
    textAlign: 'center',
  },
  totalPct: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  rankingTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
    marginBottom: espacamento.xs,
  },
  rankingLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  rankingPos: {
    ...tipografia.rotulo,
    color: cores.primaria,
    width: 36,
  },
  rankingNome: {
    ...tipografia.corpo,
    color: cores.texto,
    flex: 1,
  },
  rankingDireita: {
    alignItems: 'flex-end',
  },
  rankingValor: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
  },
  rankingQtd: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
});

export default IndicadoresScreen;
