/**
 * Painel de Vendas.
 *
 * As vendas por hora são enviadas diariamente por arquivo .txt (qualquer
 * pessoa pode enviar; não há ajuste manual). A tela mostra o status do dia, os
 * totais do dia/semana/mês, e gráficos por hora (barras verticais e pizza) do
 * período escolhido (dia, semana, mês ou um intervalo personalizado).
 */
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { vendasService } from '../../api/services';
import {
  ResumoVendas,
  StatusVendas,
  VendasPorHora,
} from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Botao,
  Carregando,
  Cartao,
  EstadoVazio,
  GraficoBarrasVerticais,
  GraficoPizza,
  MensagemErro,
  montarFatias,
  Segmentado,
  Selo,
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
    // Garante início <= fim.
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

interface Aviso {
  tom: 'ok' | 'erro';
  texto: string;
}

export function PainelVendasScreen(): React.ReactElement {
  const { perfil } = useAuth();
  const ehGerente = perfil === 'GERENTE';
  const [data, setData] = useState(hojeISO());
  const [periodo, setPeriodo] = useState<PeriodoGrafico>('DIA');
  const [inicioPers, setInicioPers] = useState(hojeISO());
  const [fimPers, setFimPers] = useState(hojeISO());
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const { inicio, fim } = intervaloDoPeriodo(periodo, data, inicioPers, fimPers);

  const req = useRequisicao(async () => {
    const [status, resumo, porHora] = await Promise.all([
      vendasService.status(data),
      vendasService.resumo(data),
      vendasService.porHora(inicio, fim),
    ]);
    return { status, resumo, porHora };
  }, [data, periodo, inicio, fim]);

  const status: StatusVendas | undefined = req.dados?.status;
  const resumo: ResumoVendas | undefined = req.dados?.resumo;
  const porHora: VendasPorHora | undefined = req.dados?.porHora;
  const enviado = status?.enviado === true;

  const horas = porHora?.horas ?? [];
  const dadosBarras = horas.map((h) => ({
    rotulo: `${h.hora}h`,
    valor: h.valor,
  }));
  // Pizza completa: todas as horas (sem agrupar em "Outros").
  const fatiasPizza = montarFatias(
    horas.map((h) => ({ rotulo: `${h.hora}h às ${h.hora + 1}h`, valor: h.valor })),
    24,
  );
  // No "Dia" mostra o valor de cada hora; em semana/mês, o percentual.
  const pizzaMostraValor = periodo === 'DIA';

  const enviarArquivo = async () => {
    setAviso(null);
    try {
      const escolha = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/*', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
      if (escolha.canceled || !escolha.assets?.[0]) {
        return;
      }
      const arquivo = escolha.assets[0];
      setEnviando(true);
      const resultado = await vendasService.upload(
        {
          uri: arquivo.uri,
          name: arquivo.name,
          mimeType: arquivo.mimeType,
        },
        data,
      );
      const msg = `${resultado.horas} hora(s), total ${formatarMoeda(resultado.total)}.`;
      setAviso({ tom: 'ok', texto: `Vendas enviadas. ${msg}` });
      Alert.alert('Vendas enviadas', msg);
      req.recarregar();
    } catch (e) {
      const texto =
        e instanceof ApiError ? e.message : 'Falha ao enviar o arquivo.';
      setAviso({ tom: 'erro', texto });
      Alert.alert('Erro no envio', texto);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tela aoAtualizar={req.recarregar} atualizando={req.atualizando}>
      <SeletorData valor={data} aoMudar={setData} rotulo="Dia de referência" />

      <Cartao titulo="Enviar vendas do dia">
        {aviso ? (
          <View
            style={[
              styles.aviso,
              {
                backgroundColor:
                  aviso.tom === 'ok' ? cores.verdeFundo : cores.vermelhoFundo,
              },
            ]}
          >
            <Text
              style={[
                styles.avisoTexto,
                { color: aviso.tom === 'ok' ? cores.verde : cores.vermelho },
              ]}
            >
              {aviso.texto}
            </Text>
          </View>
        ) : null}
        <View style={styles.envioLinha}>
          {req.carregando ? (
            <Carregando />
          ) : (
            <Selo
              texto={enviado ? 'Enviado' : 'Pendente'}
              cor={enviado ? cores.verde : cores.amarelo}
              fundo={enviado ? cores.verdeFundo : cores.amareloFundo}
            />
          )}
          {!enviado || ehGerente ? (
            <Botao
              titulo={enviado ? 'Reenviar' : 'Enviar'}
              variante="secundario"
              carregando={enviando}
              aoPressionar={() => void enviarArquivo()}
              estilo={styles.botaoEnviar}
            />
          ) : null}
        </View>
        {enviado && !ehGerente ? (
          <Text style={styles.notaBloqueio}>
            As vendas deste dia já foram enviadas. Apenas o gerente pode
            reenviar.
          </Text>
        ) : null}
      </Cartao>

      <Cartao titulo="Totais de vendas">
        {req.carregando ? (
          <Carregando />
        ) : req.erro ? (
          <MensagemErro mensagem={req.erro} aoTentarNovamente={req.recarregar} />
        ) : (
          <View style={styles.totais}>
            {[
              { rotulo: 'Dia', valor: resumo?.totalDia ?? 0 },
              { rotulo: 'Semana', valor: resumo?.totalSemana ?? 0 },
              { rotulo: 'Mês', valor: resumo?.totalMes ?? 0 },
            ].map((t) => (
              <View key={t.rotulo} style={styles.totalBloco}>
                <Text style={styles.totalRotulo}>{t.rotulo}</Text>
                <Text style={styles.totalValor}>{formatarMoeda(t.valor)}</Text>
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
            descricao="Envie o arquivo de vendas por hora para ver os gráficos."
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
  ajuda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  notaBloqueio: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    fontStyle: 'italic',
  },
  aviso: {
    borderRadius: 8,
    padding: espacamento.sm,
    marginBottom: espacamento.sm,
  },
  avisoTexto: {
    ...tipografia.legenda,
    fontWeight: '600',
  },
  envioLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacamento.sm,
  },
  botaoEnviar: {
    minHeight: 40,
    paddingHorizontal: espacamento.lg,
  },
  totais: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: espacamento.sm,
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
