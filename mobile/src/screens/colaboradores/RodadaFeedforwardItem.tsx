/**
 * Uma rodada no histórico da seção Feedforward: cabeçalho (data, nota e
 * ações), líder e cargo, foto do formulário, textos e os pontos a melhorar
 * com semáforo, revisão e prorrogação. Só exibe — as ações são repassadas
 * para a seção por callbacks.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { PontoFeedforward, RodadaFeedforward } from '../../api/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarData, formatarDataHora } from '../../utils/formato';
import {
  ROTULO_SITUACAO_FEEDFORWARD,
  rotuloCargo,
} from '../../utils/relatorioFeedforward';
import { Estrelas } from './EstrelasFeedforward';
import { COR_SITUACAO, urlFoto } from './feedforwardApoio';

function Bloco({
  titulo,
  texto,
}: {
  titulo: string;
  texto: string | null;
}): React.ReactElement | null {
  if (!texto) return null;
  return (
    <View style={styles.bloco}>
      <Text style={styles.blocoTitulo}>{titulo}</Text>
      <Text style={styles.blocoTexto}>{texto}</Text>
    </View>
  );
}

function PontoItem({
  ponto: p,
  podeGerir,
  aoTocar,
}: {
  ponto: PontoFeedforward;
  podeGerir: boolean;
  aoTocar: (p: PontoFeedforward) => void;
}): React.ReactElement {
  const pendente = p.status === 'PENDENTE';
  return (
    <Pressable
      style={styles.ponto}
      disabled={!podeGerir || !pendente}
      onPress={() => aoTocar(p)}
    >
      <View
        style={[styles.pontoBolinha, { backgroundColor: COR_SITUACAO[p.situacao] }]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.pontoDescricao}>{p.descricao}</Text>
        <Text style={styles.pontoMeta}>
          Prazo {formatarData(p.prazo)} ·{' '}
          <Text style={{ color: COR_SITUACAO[p.situacao] }}>
            {ROTULO_SITUACAO_FEEDFORWARD[p.situacao]}
          </Text>
        </Text>
        {!pendente && (p.revisadoPorNome || p.revisadoEm) ? (
          <Text style={styles.pontoRevisao}>
            Revisado
            {p.revisadoPorNome ? ` por ${p.revisadoPorNome}` : ''}
            {p.revisadoEm ? ` em ${formatarDataHora(p.revisadoEm)}` : ''}
          </Text>
        ) : null}
        {p.prorrogacoes ? (
          <Text style={styles.pontoRevisao}>
            Prorrogado {p.prorrogacoes}x
            {p.prazoOriginal ? ` · prazo original ${formatarData(p.prazoOriginal)}` : ''}
            {p.prorrogadoPorNome ? ` · por ${p.prorrogadoPorNome}` : ''}
          </Text>
        ) : null}
        {p.motivoProrrogacao ? (
          <Text style={styles.pontoObservacao}>Motivo: {p.motivoProrrogacao}</Text>
        ) : null}
        {p.observacaoRevisao ? (
          <Text style={styles.pontoObservacao}>“{p.observacaoRevisao}”</Text>
        ) : null}
      </View>
      {podeGerir && pendente ? (
        <Ionicons name="ellipsis-vertical" size={16} color={cores.textoSecundario} />
      ) : null}
    </Pressable>
  );
}

export function RodadaFeedforwardItem({
  rodada: r,
  podeGerir,
  ocupado,
  aoEditar,
  aoImprimir,
  aoRemover,
  aoEnviarFoto,
  aoAmpliarFoto,
  aoTocarPonto,
}: {
  rodada: RodadaFeedforward;
  podeGerir: boolean;
  /** Ação em andamento nesta rodada (envio de foto ou remoção). */
  ocupado: boolean;
  aoEditar: () => void;
  aoImprimir: () => void;
  aoRemover: () => void;
  aoEnviarFoto: (origem: 'camera' | 'galeria') => void;
  aoAmpliarFoto: (url: string) => void;
  aoTocarPonto: (p: PontoFeedforward) => void;
}): React.ReactElement {
  return (
    <View style={styles.rodada}>
      <View style={styles.topo}>
        <Text style={styles.data}>{formatarData(r.data)}</Text>
        <View style={styles.topoDireita}>
          {r.evolucaoNota != null && <Estrelas nota={r.evolucaoNota} />}
          {podeGerir ? (
            <Pressable
              onPress={aoEditar}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Editar esta rodada de feedforward"
            >
              <Ionicons name="create-outline" size={18} color={cores.primaria} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={aoImprimir}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Imprimir esta rodada de feedforward"
          >
            <Ionicons name="print-outline" size={18} color={cores.primaria} />
          </Pressable>
          {podeGerir ? (
            <Pressable
              onPress={aoRemover}
              disabled={ocupado}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remover esta rodada de feedforward"
            >
              <Ionicons name="trash-outline" size={18} color={cores.vermelho} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {r.liderNome ? <Text style={styles.meta}>Líder: {r.liderNome}</Text> : null}
      {r.cargo ? (
        <Text style={styles.meta}>Cargo na data: {rotuloCargo(r.cargo)}</Text>
      ) : null}

      {r.fotoUrl ? (
        <Pressable
          style={styles.fotoWrap}
          onPress={() => aoAmpliarFoto(urlFoto(r.fotoUrl as string))}
          accessibilityRole="imagebutton"
          accessibilityLabel="Ampliar a foto do formulário"
        >
          <Image
            source={{ uri: urlFoto(r.fotoUrl) }}
            style={styles.foto}
            resizeMode="cover"
          />
          <View style={styles.ampliarSelo}>
            <Ionicons name="expand-outline" size={13} color={cores.textoInverso} />
            <Text style={styles.ampliarSeloTexto}>Toque para ampliar</Text>
          </View>
        </Pressable>
      ) : null}

      {/* Enviar (ou trocar) a foto de uma rodada já salva */}
      {podeGerir ? (
        <View style={styles.fotoAcoes}>
          <Ionicons name="camera-outline" size={15} color={cores.primaria} />
          <Text style={styles.fotoAcoesRotulo}>
            {ocupado
              ? 'Aguarde…'
              : r.fotoUrl
                ? 'Trocar foto:'
                : 'Sem foto do formulário:'}
          </Text>
          {!ocupado ? (
            <>
              <Pressable
                onPress={() => aoEnviarFoto('camera')}
                hitSlop={6}
                accessibilityRole="button"
              >
                <Text style={styles.fotoAcoesLink}>Tirar foto</Text>
              </Pressable>
              <Pressable
                onPress={() => aoEnviarFoto('galeria')}
                hitSlop={6}
                accessibilityRole="button"
              >
                <Text style={styles.fotoAcoesLink}>Da galeria</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}

      <Bloco titulo="Pontos fortes" texto={r.pontosFortes} />
      <Bloco titulo="Oportunidades de desenvolvimento" texto={r.oportunidades} />

      {r.pontos.length > 0 && (
        <View style={styles.bloco}>
          <Text style={styles.blocoTitulo}>Pontos a melhorar (com prazo)</Text>
          {r.pontos.map((p) => (
            <PontoItem
              key={p.id}
              ponto={p}
              podeGerir={podeGerir}
              aoTocar={aoTocarPonto}
            />
          ))}
        </View>
      )}

      <Bloco titulo="Compromisso final" texto={r.compromissoFinal} />
    </View>
  );
}

const styles = StyleSheet.create({
  rodada: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
    paddingTop: espacamento.md,
    marginTop: espacamento.md,
    gap: espacamento.xs,
  },
  topo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topoDireita: { flexDirection: 'row', alignItems: 'center', gap: espacamento.sm },
  data: { ...tipografia.rotulo, fontWeight: '700', color: cores.texto },
  meta: { ...tipografia.legenda, color: cores.textoSecundario },
  fotoWrap: { marginTop: espacamento.sm, borderRadius: raio.md, overflow: 'hidden' },
  foto: { width: '100%', height: 180, backgroundColor: cores.divisor },
  ampliarSelo: {
    position: 'absolute',
    right: espacamento.sm,
    bottom: espacamento.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: espacamento.sm,
    paddingVertical: 2,
    borderRadius: raio.pill,
  },
  ampliarSeloTexto: { ...tipografia.legenda, color: cores.textoInverso },
  fotoAcoes: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: espacamento.sm,
    marginTop: espacamento.xs,
  },
  fotoAcoesRotulo: { ...tipografia.legenda, color: cores.textoSecundario },
  fotoAcoesLink: { ...tipografia.legenda, color: cores.primaria, fontWeight: '700' },
  bloco: { marginTop: espacamento.sm },
  blocoTitulo: {
    ...tipografia.legenda,
    fontWeight: '700',
    color: cores.textoSecundario,
    marginBottom: 2,
  },
  blocoTexto: { ...tipografia.corpo, color: cores.texto },
  ponto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
  },
  pontoBolinha: { width: 10, height: 10, borderRadius: 5 },
  pontoDescricao: { ...tipografia.corpo, color: cores.texto },
  pontoMeta: { ...tipografia.legenda, color: cores.textoSecundario },
  pontoRevisao: { ...tipografia.legenda, color: cores.textoSecundario },
  pontoObservacao: { ...tipografia.legenda, color: cores.texto, fontStyle: 'italic' },
});
