/**
 * Tela de Checklist (Req 5.1–5.3) — auditoria e cumprimento.
 *
 * Para o dia selecionado, mostra os checklists de abertura e fechamento com
 * status rico (feito no prazo / atrasado / pendente / não feito), a janela de
 * execução, quem enviou e quando, e o print enviado (na prática, o print do
 * checklist feito no "Checklist Fácil"). Em cima, as métricas de cumprimento
 * do mês; embaixo, o histórico dos últimos dias. Sinaliza foto repetida
 * (anti-fraude).
 */
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { API_BASE_URL } from '../../api/config';
import { checklistService } from '../../api/services';
import {
  ChecklistEstado,
  ChecklistHistoricoDia,
  ChecklistMetricas,
  EstadoChecklists,
  StatusVisualChecklist,
  TipoChecklist,
} from '../../api/types';
import {
  Aviso,
  Botao,
  Carregando,
  Cartao,
  MensagemErro,
  SeletorData,
  Tela,
} from '../../components';
import { useConfigSistema } from '../../config/ConfigSistemaContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarHora, hojeISO } from '../../utils/formato';

const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function urlImagem(caminho: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${caminho}`;
}

/** Cor do ponto de status no calendário (🟢/🟡/🔴/⚪). */
function corStatus(t?: StatusVisualChecklist): string {
  if (!t) return cores.divisor;
  if (t === 'FEITO_NO_PRAZO') return cores.verde;
  if (t === 'NAO_FEITO') return cores.vermelho;
  return cores.amarelo; // ATRASADO / PENDENTE
}

function visual(status: StatusVisualChecklist): { rotulo: string; cor: string; fundo: string } {
  switch (status) {
    case 'FEITO_NO_PRAZO':
      return { rotulo: 'Feito no prazo', cor: cores.verde, fundo: cores.verdeFundo };
    case 'ATRASADO':
      return { rotulo: 'Atrasado', cor: cores.amarelo, fundo: cores.amareloFundo };
    case 'NAO_FEITO':
      return { rotulo: 'Não feito', cor: cores.vermelho, fundo: cores.vermelhoFundo };
    default:
      return { rotulo: 'Pendente', cor: cores.amarelo, fundo: cores.amareloFundo };
  }
}

function ChecklistCard({
  tipo,
  titulo,
  estado,
  data,
  aoEnviar,
  aoAbrirFoto,
}: {
  tipo: TipoChecklist;
  titulo: string;
  estado: ChecklistEstado;
  data: string;
  aoEnviar: () => void;
  aoAbrirFoto: (url: string) => void;
}): React.ReactElement {
  const [enviando, setEnviando] = useState(false);
  const v = visual(estado.statusVisual);

  const enviar = async (origem: 'galeria' | 'camera') => {
    try {
      const permissao =
        origem === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Permissão necessária', 'Conceda o acesso para enviar a imagem.');
        return;
      }
      const resultado =
        origem === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
            });
      if (resultado.canceled || !resultado.assets?.[0]) return;
      const asset = resultado.assets[0];
      setEnviando(true);
      await checklistService.enviarImagem(
        tipo,
        {
          uri: asset.uri,
          name: asset.fileName ?? `checklist-${tipo.toLowerCase()}.jpg`,
          mimeType: asset.mimeType ?? 'image/jpeg',
        },
        data,
      );
      Alert.alert('Enviado', `Checklist de ${titulo.toLowerCase()} registrado.`);
      aoEnviar();
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao enviar a imagem.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Cartao>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>{titulo}</Text>
        <View style={[styles.selo, { backgroundColor: v.fundo }]}>
          <Text style={[styles.seloTexto, { color: v.cor }]}>{v.rotulo}</Text>
        </View>
      </View>

      <View style={styles.janela}>
        <Ionicons name="time-outline" size={16} color={cores.textoSecundario} />
        <Text style={styles.janelaTexto}>
          Janela: {estado.janela.inicio} às {estado.janela.fim}
        </Text>
      </View>

      {/* Auditoria: quem enviou, quando, e o print */}
      {estado.status === 'FEITO' ? (
        <>
          <View style={styles.auditoria}>
            <Ionicons name="person-circle-outline" size={16} color={cores.textoSecundario} />
            <Text style={styles.auditoriaTexto}>
              {estado.enviadoPor ?? 'Desconhecido'}
              {estado.enviadoEm ? ` · ${formatarHora(estado.enviadoEm)}` : ''}
            </Text>
          </View>
          {estado.imagemUrl ? (
            <Pressable
              style={styles.thumbnailWrap}
              onPress={() => aoAbrirFoto(urlImagem(estado.imagemUrl as string))}
              accessibilityRole="imagebutton"
              accessibilityLabel="Ampliar a foto do checklist"
            >
              <Image
                source={{ uri: urlImagem(estado.imagemUrl) }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.ampliarSelo}>
                <Ionicons name="expand-outline" size={13} color={cores.textoInverso} />
                <Text style={styles.ampliarSeloTexto}>Toque para ampliar</Text>
              </View>
            </Pressable>
          ) : null}
          {estado.duplicado ? (
            <Aviso texto="Atenção: este print é idêntico a outro já enviado. Verifique se é do dia." />
          ) : null}
        </>
      ) : null}

      <View style={styles.botoes}>
        <Botao
          titulo={estado.status === 'FEITO' ? 'Reenviar (foto)' : 'Tirar foto'}
          aoPressionar={() => void enviar('camera')}
          carregando={enviando}
          estilo={styles.botaoFlex}
        />
        <Botao
          titulo="Da galeria"
          variante="secundario"
          aoPressionar={() => void enviar('galeria')}
          carregando={enviando}
          estilo={styles.botaoFlex}
        />
      </View>
    </Cartao>
  );
}

export function ChecklistScreen(): React.ReactElement {
  const { dataInicial } = useConfigSistema();
  const [data, setData] = useState(hojeISO());

  const estadoReq = useRequisicao<EstadoChecklists>(
    () => checklistService.estado(data),
    [data],
  );
  const metricas = useRequisicao<ChecklistMetricas>(
    () => checklistService.metricas(data),
    [data],
  );
  // Calendário: histórico do MÊS da data selecionada (recarrega ao trocar de mês).
  const calendarioReq = useRequisicao<ChecklistHistoricoDia[]>(
    () => checklistService.historicoMes(data),
    [data.slice(0, 7)],
  );

  const recarregar = () => {
    estadoReq.recarregar();
    metricas.recarregar();
    calendarioReq.recarregar();
  };

  const est = estadoReq.dados;
  // Foto aberta em tela cheia (visualizador). null = fechado.
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const hoje = hojeISO();

  /** Navega para o mês anterior/seguinte, sem sair dos limites permitidos. */
  const mudarMes = (delta: number) => {
    const [a, m] = data.split('-').map(Number);
    const primeiro = new Date(Date.UTC(a, m - 1 + delta, 1))
      .toISOString()
      .slice(0, 10);
    // Mantém dentro de [Data_Inicial_Sistema, hoje].
    const iso = primeiro < dataInicial ? dataInicial : primeiro > hoje ? hoje : primeiro;
    setData(iso);
  };

  return (
    <Tela
      aoAtualizar={recarregar}
      atualizando={estadoReq.atualizando || metricas.atualizando}
    >
      {/* Métricas de cumprimento do mês */}
      {metricas.dados ? (
        <Cartao titulo="Cumprimento do mês">
          <View style={styles.metricasLinha}>
            <View style={styles.metricaBox}>
              <Text style={[styles.metricaValor, { color: cores.verde }]}>
                {metricas.dados.percentualNoPrazo}%
              </Text>
              <Text style={styles.metricaRotulo}>no prazo</Text>
            </View>
            <View style={styles.metricaBox}>
              <Text style={styles.metricaValor}>{metricas.dados.rachaDias}</Text>
              <Text style={styles.metricaRotulo}>dias seguidos</Text>
            </View>
            <View style={styles.metricaBox}>
              <Text style={styles.metricaValor}>
                {metricas.dados.noPrazo}/{metricas.dados.totalEsperado}
              </Text>
              <Text style={styles.metricaRotulo}>no prazo/esperado</Text>
            </View>
          </View>
        </Cartao>
      ) : null}

      <SeletorData
        valor={data}
        aoMudar={setData}
        rotulo="Dia"
        dataMinima={dataInicial}
      />

      {estadoReq.carregando ? (
        <Carregando />
      ) : estadoReq.erro ? (
        <MensagemErro mensagem={estadoReq.erro} aoTentarNovamente={estadoReq.recarregar} />
      ) : est ? (
        <>
          <ChecklistCard
            tipo="ABERTURA"
            titulo="Abertura"
            estado={est.abertura}
            data={data}
            aoEnviar={recarregar}
            aoAbrirFoto={setFotoAmpliada}
          />
          <ChecklistCard
            tipo="FECHAMENTO"
            titulo="Fechamento"
            estado={est.fechamento}
            data={data}
            aoEnviar={recarregar}
            aoAbrirFoto={setFotoAmpliada}
          />
        </>
      ) : null}

      {/* Calendário do mês: abertura + fechamento por dia (toque num dia para vê-lo) */}
      {calendarioReq.carregando ? (
        <Carregando />
      ) : calendarioReq.erro ? (
        <MensagemErro
          mensagem={calendarioReq.erro}
          aoTentarNovamente={calendarioReq.recarregar}
        />
      ) : calendarioReq.dados && calendarioReq.dados.length > 0 ? (
        <CalendarioMes
          dias={calendarioReq.dados}
          selecionado={data}
          dataInicial={dataInicial}
          hoje={hoje}
          aoSelecionarDia={setData}
          aoMudarMes={mudarMes}
        />
      ) : null}

      {/* Visualizador de foto em tela cheia (toque na miniatura) */}
      <Modal
        visible={!!fotoAmpliada}
        transparent
        animationType="fade"
        onRequestClose={() => setFotoAmpliada(null)}
      >
        <Pressable
          style={styles.fotoBackdrop}
          onPress={() => setFotoAmpliada(null)}
        >
          <Pressable
            style={styles.fotoFechar}
            onPress={() => setFotoAmpliada(null)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          >
            <Ionicons name="close" size={28} color={cores.textoInverso} />
          </Pressable>
          {fotoAmpliada ? (
            <Image
              source={{ uri: fotoAmpliada }}
              style={styles.fotoAmpliada}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </Tela>
  );
}

/** Calendário mensal com o status de abertura e fechamento por dia. */
function CalendarioMes({
  dias,
  selecionado,
  dataInicial,
  hoje,
  aoSelecionarDia,
  aoMudarMes,
}: {
  dias: ChecklistHistoricoDia[];
  selecionado: string;
  dataInicial: string;
  hoje: string;
  aoSelecionarDia: (iso: string) => void;
  aoMudarMes: (delta: number) => void;
}): React.ReactElement {
  const primeiro = dias[0];
  const [ano, mes] = primeiro.dataISO.split('-');
  const rotulo = `${NOMES_MES[Number(mes) - 1]} ${ano}`;
  // Células vazias antes do dia 1, para alinhar ao dia da semana.
  const vazias = Array.from({ length: primeiro.diaSemana }, (_, i) => i);
  const primeiroDoMes = `${ano}-${mes}-01`;
  const podeVoltar = primeiroDoMes > dataInicial;
  const podeAvancar = primeiroDoMes < `${hoje.slice(0, 7)}-01`;

  return (
    <Cartao>
      <View style={styles.calCabecalho}>
        <Pressable
          onPress={() => aoMudarMes(-1)}
          disabled={!podeVoltar}
          hitSlop={10}
          style={styles.calSeta}
          accessibilityLabel="Mês anterior"
        >
          <Ionicons
            name="chevron-back"
            size={22}
            color={podeVoltar ? cores.primaria : cores.divisor}
          />
        </Pressable>
        <Text style={styles.calTitulo}>{rotulo}</Text>
        <Pressable
          onPress={() => aoMudarMes(1)}
          disabled={!podeAvancar}
          hitSlop={10}
          style={styles.calSeta}
          accessibilityLabel="Mês seguinte"
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={podeAvancar ? cores.primaria : cores.divisor}
          />
        </Pressable>
      </View>

      <View style={styles.calSemana}>
        {NOMES_DIA.map((n) => (
          <Text key={n} style={styles.calSemanaTxt}>
            {n}
          </Text>
        ))}
      </View>

      <View style={styles.calGrade}>
        {vazias.map((v) => (
          <View key={`v${v}`} style={styles.calCelula} />
        ))}
        {dias.map((d) => {
          const numero = Number(d.dataISO.slice(8, 10));
          const selecionavel = d.dataISO >= dataInicial && d.dataISO <= hoje;
          const sel = d.dataISO === selecionado;
          const conteudo = (
            <>
              <Text
                style={[
                  styles.calDiaNum,
                  sel && styles.calDiaNumSel,
                  !selecionavel && styles.calDiaNumInativo,
                ]}
              >
                {numero}
              </Text>
              <View style={styles.calPontos}>
                <View
                  style={[styles.calPonto, { backgroundColor: corStatus(d.abertura?.statusVisual) }]}
                />
                <View
                  style={[styles.calPonto, { backgroundColor: corStatus(d.fechamento?.statusVisual) }]}
                />
              </View>
            </>
          );
          return selecionavel ? (
            <Pressable
              key={d.dataISO}
              onPress={() => aoSelecionarDia(d.dataISO)}
              style={[styles.calCelula, sel && styles.calCelulaSel]}
            >
              {conteudo}
            </Pressable>
          ) : (
            <View key={d.dataISO} style={styles.calCelula}>
              {conteudo}
            </View>
          );
        })}
      </View>

      <Text style={styles.histLegenda}>
        🟢 no prazo · 🟡 atrasado/pendente · 🔴 não feito · ⚪ sem dado
      </Text>
      <Text style={styles.calLegendaTipos}>
        Em cada dia: 1º ponto = abertura · 2º ponto = fechamento
      </Text>
    </Cartao>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.sm,
  },
  titulo: {
    ...tipografia.secao,
    color: cores.texto,
  },
  selo: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 3,
    borderRadius: raio.pill,
  },
  seloTexto: {
    fontSize: 12,
    fontWeight: '700',
  },
  janela: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  janelaTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  auditoria: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  auditoriaTexto: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '600',
  },
  thumbnailWrap: {
    position: 'relative',
    marginBottom: espacamento.sm,
  },
  thumbnail: {
    width: '100%',
    height: 180,
    borderRadius: raio.md,
    backgroundColor: cores.superficieAlternativa,
  },
  ampliarSelo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: raio.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ampliarSeloTexto: {
    color: cores.textoInverso,
    fontSize: 11,
    fontWeight: '700',
  },
  fotoBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fotoAmpliada: {
    width: '100%',
    height: '82%',
  },
  fotoFechar: {
    position: 'absolute',
    top: 44,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  botoes: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.xs,
  },
  botaoFlex: {
    flex: 1,
  },
  // Métricas
  metricasLinha: {
    flexDirection: 'row',
    gap: espacamento.sm,
  },
  metricaBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
  },
  metricaValor: {
    ...tipografia.titulo,
    fontWeight: '700',
    color: cores.texto,
  },
  metricaRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
  },
  // Calendário mensal
  calCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.sm,
  },
  calSeta: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calTitulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
    fontWeight: '700',
  },
  calSemana: {
    flexDirection: 'row',
    marginBottom: espacamento.xs,
  },
  calSemanaTxt: {
    width: '14.2857%',
    textAlign: 'center',
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontWeight: '700',
  },
  calGrade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCelula: {
    width: '14.2857%',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: espacamento.xs,
    borderRadius: raio.md,
  },
  calCelulaSel: {
    backgroundColor: cores.primariaClara,
  },
  calDiaNum: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '600',
  },
  calDiaNumSel: {
    color: cores.primaria,
    fontWeight: '800',
  },
  calDiaNumInativo: {
    color: cores.textoSecundario,
    opacity: 0.5,
  },
  calPontos: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 3,
  },
  calPonto: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  histLegenda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    textAlign: 'center',
  },
  calLegendaTipos: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: 2,
  },
});

export default ChecklistScreen;
