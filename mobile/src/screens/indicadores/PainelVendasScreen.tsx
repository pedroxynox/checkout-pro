/**
 * Painel de Vendas (somente informativo).
 *
 * As vendas por hora são carregadas na seção Importações (pelo usuário de
 * carga) e o status do dia é visto no Fechamento. Aqui mostramos apenas os
 * informativos: totais do dia/semana/mês e gráficos por hora (barras e pizza)
 * do período escolhido (dia, semana, mês ou intervalo personalizado).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { vendasService } from '../../api/services';
import { ResumoVendas, VendasPorHora } from '../../api/types';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  GraficoBarrasVerticais,
  GraficoPizza,
  MensagemErro,
  montarFatias,
  Segmentado,
  SeletorData,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarData, formatarMoeda, hojeISO } from '../../utils/formato';

type PeriodoGrafico = 'DIA' | 'SEMANA' | 'MES' | 'PERSONALIZADO';

const OPCOES_PERIODO: { valor: PeriodoGrafico; rotulo: string }[] = [
  { valor: 'DIA', rotulo: 'Dia' },
  { valor: 'SEMANA', rotulo: 'Semana' },
  { valor: 'MES', rotulo: 'Mês' },
  { valor: 'PERSONALIZADO', rotulo: 'Período' },
];

function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Intervalo [início, fim] (ISO) do período relativo à data de referência. */
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

export function PainelVendasScreen(): React.ReactElement {
  const [data, setData] = useState(hojeISO());
  const [periodo, setPeriodo] = useState<PeriodoGrafico>('DIA');
  const [inicioPers, setInicioPers] = useState(hojeISO());
  const [fimPers, setFimPers] = useState(hojeISO());

  const { inicio, fim } = intervaloDoPeriodo(periodo, data, inicioPers, fimPers);

  const req = useRequisicao(async () => {
    const [resumo, porHora] = await Promise.all([
      vendasService.resumo(data),
      vendasService.porHora(inicio, fim),
    ]);
    return { resumo, porHora };
  }, [data, periodo, inicio, fim]);

  const resumo: ResumoVendas | undefined = req.dados?.resumo;
  const porHora: VendasPorHora | undefined = req.dados?.porHora;

  const horas = porHora?.horas ?? [];
  const dadosBarras = horas.map((h) => ({ rotulo: `${h.hora}h`, valor: h.valor }));
  const fatiasPizza = montarFatias(
    horas.map((h) => ({ rotulo: `${h.hora}h às ${h.hora + 1}h`, valor: h.valor })),
    24,
  );
  const pizzaMostraValor = periodo === 'DIA';

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <SeletorData valor={data} aoMudar={setData} rotulo="Dia de referência" />

      <Cartao titulo="Totais de vendas">
        {req.carregando ? (
          <Carregando />
        ) : req.erro ? (
          <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
        ) : (
          <View>
            {[
              { rotulo: 'Dia', valor: resumo?.totalDia ?? 0 },
              { rotulo: 'Semana', valor: resumo?.totalSemana ?? 0 },
              { rotulo: 'Mês', valor: resumo?.totalMes ?? 0 },
            ].map((t) => (
              <View key={t.rotulo} style={styles.totalLinha}>
                <Text style={styles.totalLinhaRotulo}>{t.rotulo}</Text>
                <Text
                  style={styles.totalLinhaValor}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatarMoeda(t.valor)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Cartao>

      <Cartao titulo="Vendas por hora">
        <Segmentado
          opcoes={OPCOES_PERIODO}
          selecionado={periodo}
          aoSelecionar={setPeriodo}
        />
        {periodo === 'PERSONALIZADO' ? (
          <>
            <SeletorData valor={inicioPers} aoMudar={setInicioPers} rotulo="Início" />
            <SeletorData valor={fimPers} aoMudar={setFimPers} rotulo="Fim" />
          </>
        ) : null}

        <Text style={styles.periodoTexto}>
          {inicio === fim
            ? `Período: ${formatarData(inicio)}`
            : `Período: ${formatarData(inicio)} a ${formatarData(fim)}`}
        </Text>

        {req.carregando ? (
          <Carregando />
        ) : req.erro ? (
          <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
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

      {horas.length > 0 ? (
        <Cartao titulo="Horas que mais venderam">
          <GraficoPizza
            fatias={fatiasPizza}
            mostrarValor={pizzaMostraValor}
            formatarValor={formatarMoeda}
          />
        </Cartao>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  totalLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  totalLinhaRotulo: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
  },
  totalLinhaValor: {
    ...tipografia.subtitulo,
    fontWeight: '700',
    color: cores.texto,
    maxWidth: '65%',
    textAlign: 'right',
  },
  totalPeriodo: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.primaria,
    marginBottom: espacamento.sm,
  },
  periodoTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
});

export default PainelVendasScreen;
