/**
 * Resumo de evolução no topo da seção Feedforward: rodadas, % de pontos
 * atingidos, nota atual (com tendência e média), pendências, última conversa
 * e o próximo acompanhamento. O cálculo é puro (`utils/resumoFeedforward`).
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RodadaFeedforward } from '../../api/types';
import { cores, espacamento, raio, tipografia } from '../../theme';
import { formatarData, hojeISO } from '../../utils/formato';
import {
  TendenciaNota,
  evolucaoFeedforward,
  textoPrazo,
} from '../../utils/resumoFeedforward';

const ICONE_TENDENCIA: Record<
  TendenciaNota,
  { nome: React.ComponentProps<typeof Ionicons>['name']; cor: string; rotulo: string }
> = {
  SUBIU: { nome: 'arrow-up', cor: cores.verde, rotulo: 'Nota subiu' },
  CAIU: { nome: 'arrow-down', cor: cores.vermelho, rotulo: 'Nota caiu' },
  ESTAVEL: { nome: 'remove', cor: cores.textoSecundario, rotulo: 'Nota estável' },
};

function Metrica({
  valor,
  rotulo,
  detalhe,
  corValor,
  extra,
}: {
  valor: string;
  rotulo: string;
  detalhe?: string;
  corValor?: string;
  extra?: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.metrica}>
      <View style={styles.valorLinha}>
        <Text style={[styles.valor, corValor ? { color: corValor } : null]}>
          {valor}
        </Text>
        {extra}
      </View>
      <Text style={styles.rotulo}>{rotulo}</Text>
      {detalhe ? <Text style={styles.detalhe}>{detalhe}</Text> : null}
    </View>
  );
}

export function ResumoFeedforward({
  rodadas,
}: {
  rodadas: RodadaFeedforward[];
}): React.ReactElement | null {
  if (rodadas.length === 0) return null;
  const e = evolucaoFeedforward(rodadas, hojeISO());
  const revisados = e.atingidos + e.naoAtingidos;
  const tendencia = e.tendenciaNota ? ICONE_TENDENCIA[e.tendenciaNota] : null;
  const prox = e.proximoPrazo;
  const corProx =
    prox == null
      ? cores.texto
      : prox.dias <= 0
        ? cores.vermelho
        : prox.situacao === 'PROXIMO'
          ? cores.amarelo
          : cores.verde;

  return (
    <View style={styles.container} testID="resumo-feedforward">
      <View style={styles.grade}>
        <Metrica valor={String(e.rodadas)} rotulo="Rodadas" />
        <Metrica
          valor={e.taxaAtingimento == null ? '—' : `${e.taxaAtingimento}%`}
          rotulo="Atingimento"
          detalhe={
            revisados ? `${e.atingidos} de ${revisados} revisados` : 'Nenhum revisado'
          }
        />
        <Metrica
          valor={e.notaAtual == null ? '—' : `${e.notaAtual}/5`}
          rotulo="Última nota"
          detalhe={e.mediaNota == null ? undefined : `Média ${e.mediaNota.toFixed(1)}`}
          extra={
            tendencia ? (
              <Ionicons
                name={tendencia.nome}
                size={16}
                color={tendencia.cor}
                accessibilityLabel={tendencia.rotulo}
              />
            ) : null
          }
        />
        <Metrica
          valor={String(e.pendentes)}
          rotulo="Pendentes"
          detalhe={e.vencidos ? `${e.vencidos} vencido(s)` : undefined}
          corValor={e.vencidos ? cores.vermelho : undefined}
        />
      </View>

      {e.notas.length > 1 ? (
        <Text style={styles.linha}>Evolução da nota: {e.notas.join(' → ')}</Text>
      ) : null}
      {e.ultimaConversa ? (
        <Text style={styles.linha}>
          Última conversa: {formatarData(e.ultimaConversa)}
          {e.diasDesdeUltima != null && e.diasDesdeUltima > 0
            ? ` (há ${e.diasDesdeUltima} dia${e.diasDesdeUltima === 1 ? '' : 's'})`
            : ''}
        </Text>
      ) : null}
      {prox ? (
        <Text style={styles.linha}>
          Próximo acompanhamento:{' '}
          <Text style={{ color: corProx, fontWeight: '700' }}>
            {formatarData(prox.prazo)} · {textoPrazo(prox.dias)}
          </Text>{' '}
          — {prox.descricao}
        </Text>
      ) : (
        <Text style={styles.linha}>Nenhum ponto pendente de acompanhamento.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    padding: espacamento.sm,
    marginBottom: espacamento.md,
    gap: espacamento.xs,
  },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espacamento.sm },
  metrica: { flexGrow: 1, flexBasis: '45%', minWidth: 120 },
  valorLinha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  valor: { ...tipografia.subtitulo, color: cores.primaria, fontWeight: '700' },
  rotulo: { ...tipografia.legenda, color: cores.texto, fontWeight: '600' },
  detalhe: { ...tipografia.legenda, color: cores.textoSecundario },
  linha: { ...tipografia.legenda, color: cores.texto },
});
