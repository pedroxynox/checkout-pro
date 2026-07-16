/**
 * Detalhe de um check-out: reportar avaria (equipamento + descrição + foto
 * opcional) e ver as avarias abertas/resolvidas. A gestão (CHECKOUTS_GERENCIAR)
 * pode marcar como resolvido.
 */
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { API_BASE_URL } from '../../api/config';
import { checkoutsService, FotoAvaria } from '../../api/services';
import { ReporteCheckout } from '../../api/types';
import {
  Aviso,
  Botao,
  CampoTexto,
  Cartao,
  Carregando,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useAuth } from '../../auth/AuthContext';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { notificar } from '../../utils/dialogos';
import { formatarDataHora } from '../../utils/formato';

const EQUIPAMENTOS: string[] = [
  'CPU',
  'TECLADO',
  'SCANNER',
  'PINPAD',
  'MONITOR',
  'IMPRESSORA',
  'GAVETA',
  'BALANCA',
  'OUTRO',
];

const ROTULO_EQUIPAMENTO: Record<string, string> = {
  CPU: 'CPU',
  TECLADO: 'Teclado',
  SCANNER: 'Scanner',
  PINPAD: 'Pinpad',
  MONITOR: 'Monitor',
  IMPRESSORA: 'Impressora',
  GAVETA: 'Gaveta',
  BALANCA: 'Balança',
  OUTRO: 'Outro',
};

function urlImagem(caminho: string): string {
  return `${API_BASE_URL.replace(/\/$/, '')}${caminho}`;
}

export function CheckOutDetalheScreen({
  route,
}: PropsTela<'CheckOutDetalhe'>): React.ReactElement {
  const { numero } = route.params;
  const { podeAcessar } = useAuth();
  const podeResolver = podeAcessar('CHECKOUTS_GERENCIAR');
  const reportes = useRequisicao(
    () => checkoutsService.doCheckout(numero),
    [numero],
  );

  const [equipamento, setEquipamento] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [foto, setFoto] = useState<FotoAvaria | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ampliada, setAmpliada] = useState<string | null>(null);

  const escolherFoto = async () => {
    try {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Permissão necessária', 'Conceda o acesso à galeria.');
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      setFoto({
        uri: a.uri,
        name: a.fileName ?? `avaria-${numero}.jpg`,
        mimeType: a.mimeType ?? 'image/jpeg',
      });
    } catch {
      Alert.alert('Erro', 'Não foi possível selecionar a foto.');
    }
  };

  const enviar = async () => {
    if (!equipamento) {
      notificar('Escolha o equipamento', 'Selecione qual equipamento está com defeito.');
      return;
    }
    if (descricao.trim().length === 0) {
      notificar('Descreva a avaria', 'Escreva uma breve descrição do problema.');
      return;
    }
    setEnviando(true);
    try {
      await checkoutsService.reportar(
        numero,
        { equipamento, descricao: descricao.trim() },
        foto ?? undefined,
      );
      setEquipamento(null);
      setDescricao('');
      setFoto(null);
      notificar('Avaria reportada', 'A gestão foi avisada. Obrigado!');
      reportes.recarregar();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Avaria já aberta deste equipamento nesta caixa: aviso amigável.
        notificar('Já reportada', e.message);
        reportes.recarregar();
      } else {
        notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao reportar.');
      }
    } finally {
      setEnviando(false);
    }
  };

  const resolver = async (id: string) => {
    try {
      await checkoutsService.resolver(id);
      notificar('Resolvido', 'A avaria foi marcada como resolvida.');
      reportes.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao resolver.');
    }
  };

  const lista = reportes.dados ?? [];
  const abertos = lista.filter((r) => r.status === 'ABERTO');
  const resolvidos = lista.filter((r) => r.status === 'RESOLVIDO');

  const renderReporte = (r: ReporteCheckout) => (
    <Cartao key={r.id}>
      <View style={styles.reporteTopo}>
        <Text style={styles.equip}>{ROTULO_EQUIPAMENTO[r.equipamento] ?? r.equipamento}</Text>
        <Selo
          texto={r.status === 'ABERTO' ? 'Aberto' : 'Resolvido'}
          cor={r.status === 'ABERTO' ? cores.vermelho : cores.verde}
          fundo={r.status === 'ABERTO' ? cores.vermelhoFundo : cores.verdeFundo}
        />
      </View>
      <Text style={styles.descricao}>{r.descricao}</Text>
      {r.fotoUrl ? (
        <Pressable onPress={() => setAmpliada(urlImagem(r.fotoUrl as string))}>
          <Image source={{ uri: urlImagem(r.fotoUrl) }} style={styles.thumb} />
        </Pressable>
      ) : null}
      <Text style={styles.meta}>
        {r.reportadoPorNome ?? 'Fiscal'} · {formatarDataHora(r.reportadoEm)}
      </Text>
      {r.status === 'RESOLVIDO' && r.resolvidoEm ? (
        <Text style={styles.meta}>
          Resolvido por {r.resolvidoPorNome ?? 'gestão'} · {formatarDataHora(r.resolvidoEm)}
        </Text>
      ) : null}
      {r.status === 'ABERTO' && podeResolver ? (
        <Botao
          titulo="Marcar como resolvido"
          variante="secundario"
          aoPressionar={() => void resolver(r.id)}
          estilo={styles.botaoResolver}
        />
      ) : null}
    </Cartao>
  );

  return (
    <Tela aoAtualizar={reportes.recarregar} atualizando={reportes.atualizando}>
      <Text style={styles.titulo}>Check-out {numero}</Text>

      {/* Formulário de reporte */}
      <Cartao>
        <Text style={styles.secao}>Reportar avaria</Text>
        <Text style={styles.rotulo}>Equipamento</Text>
        <View style={styles.chips}>
          {EQUIPAMENTOS.map((e) => {
            const sel = equipamento === e;
            return (
              <Pressable
                key={e}
                onPress={() => setEquipamento(e)}
                style={[styles.chip, sel && styles.chipSel]}
              >
                <Text style={[styles.chipTexto, sel && styles.chipTextoSel]}>
                  {ROTULO_EQUIPAMENTO[e]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <CampoTexto
          rotulo="Descrição"
          value={descricao}
          onChangeText={setDescricao}
          placeholder="O que está com defeito?"
          multiline
        />
        <View style={styles.fotoLinha}>
          <Botao
            titulo={foto ? 'Trocar foto' : 'Anexar foto (opcional)'}
            variante="texto"
            aoPressionar={() => void escolherFoto()}
          />
          {foto ? (
            <View style={styles.fotoPreviaLinha}>
              <Image source={{ uri: foto.uri }} style={styles.thumbPequena} />
              <Ionicons
                name="close-circle"
                size={22}
                color={cores.vermelho}
                onPress={() => setFoto(null)}
              />
            </View>
          ) : null}
        </View>
        <Botao
          titulo="Reportar avaria"
          aoPressionar={() => void enviar()}
          desabilitado={enviando}
        />
      </Cartao>

      {/* Avarias */}
      {reportes.carregando ? (
        <Carregando />
      ) : reportes.erro ? (
        <MensagemErro mensagem={reportes.erro} aoTentarNovamente={reportes.recarregar} />
      ) : (
        <>
          <Text style={styles.secaoLista}>Abertas ({abertos.length})</Text>
          {abertos.length === 0 ? (
            <Aviso texto="Sem avarias abertas neste check-out." tom="sucesso" />
          ) : (
            abertos.map(renderReporte)
          )}
          {resolvidos.length > 0 ? (
            <>
              <Text style={styles.secaoLista}>Resolvidas ({resolvidos.length})</Text>
              {resolvidos.map(renderReporte)}
            </>
          ) : null}
        </>
      )}

      {/* Foto ampliada */}
      {ampliada ? (
        <Pressable style={styles.overlay} onPress={() => setAmpliada(null)}>
          <Image source={{ uri: ampliada }} style={styles.fotoAmpliada} resizeMode="contain" />
        </Pressable>
      ) : null}
    </Tela>
  );
}

const styles = StyleSheet.create({
  titulo: { ...tipografia.secao, color: cores.texto, marginBottom: espacamento.sm },
  secao: { ...tipografia.subtitulo, color: cores.texto, marginBottom: espacamento.sm },
  secaoLista: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.md,
    marginBottom: espacamento.sm,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.xs,
    marginBottom: espacamento.md,
  },
  chip: {
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.xs,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: cores.divisor,
    backgroundColor: cores.superficie,
  },
  chipSel: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { ...tipografia.legenda, color: cores.texto },
  chipTextoSel: { color: cores.textoInverso, fontWeight: '700' },
  fotoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.sm,
  },
  fotoPreviaLinha: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  thumbPequena: { width: 40, height: 40, borderRadius: raio.sm },
  reporteTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: espacamento.xs,
  },
  equip: { ...tipografia.corpo, fontWeight: '700', color: cores.texto },
  descricao: { ...tipografia.corpo, color: cores.texto },
  thumb: {
    width: '100%',
    height: 160,
    borderRadius: raio.md,
    marginTop: espacamento.sm,
    backgroundColor: cores.divisor,
  },
  meta: { ...tipografia.legenda, color: cores.textoSecundario, marginTop: 4 },
  botaoResolver: { marginTop: espacamento.sm },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacamento.md,
  },
  fotoAmpliada: { width: '100%', height: '80%' },
});

export default CheckOutDetalheScreen;
