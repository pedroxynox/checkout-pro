/**
 * Marcações do dia — lista informativa de quem bateu ponto HOJE, por ordem de
 * batida, com os horários do dia: entrada, saída de intervalo, volta do
 * intervalo e encerramento. Somente leitura, sempre o dia em curso.
 *
 * Fica em tela própria (aberta pela card do Relógio Ponto) para não
 * sobrecarregar aquela tela.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fiscaisService } from '../../api/services';
import { ItemJornadaFiscal, TipoBatida } from '../../api/types';
import { Cartao, Carregando, EstadoVazio, MensagemErro, Tela } from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';

/** Ordem e rótulos curtos das 4 marcações exibidas. */
const MARCACOES_ORDEM: { tipo: TipoBatida; rotulo: string }[] = [
  { tipo: 'ENTRADA', rotulo: 'Entrada' },
  { tipo: 'SAIDA_INTERVALO', rotulo: 'Saída' },
  { tipo: 'RETORNO_INTERVALO', rotulo: 'Volta' },
  { tipo: 'ENCERRAMENTO', rotulo: 'Encerramento' },
];

/** "HH:mm" a partir do ISO gravado (hora de parede, sem fuso). */
function horaLabel(iso: string): string {
  return iso.slice(11, 16);
}

/** Menor hora (ISO) entre as marcações — para ordenar pela 1ª batida. */
function primeiraMarcacaoMs(item: ItemJornadaFiscal): number {
  const horas = (item.marcacoes ?? []).map((m) => Date.parse(m.hora));
  return horas.length ? Math.min(...horas) : Number.MAX_SAFE_INTEGER;
}

export function MarcacoesDoDiaScreen(): React.ReactElement {
  const jornada = useRequisicao<ItemJornadaFiscal[]>(
    () => fiscaisService.jornada(),
    [],
  );

  const lista = [...(jornada.dados ?? [])]
    .filter((p) => (p.marcacoes ?? []).length > 0)
    .sort((a, b) => primeiraMarcacaoMs(a) - primeiraMarcacaoMs(b));

  return (
    <Tela aoAtualizar={jornada.recarregar} atualizando={jornada.carregando}>
      {jornada.carregando && !jornada.dados ? (
        <Carregando />
      ) : jornada.erro ? (
        <MensagemErro
          mensagem={jornada.erro}
          aoTentarNovamente={jornada.recarregar}
        />
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone="time-outline"
          titulo="Sem marcações"
          descricao="Ninguém bateu ponto ainda hoje."
        />
      ) : (
        <Cartao>
          <Text style={styles.titulo}>Marcações do dia</Text>
          <Text style={styles.sub}>Por ordem de batida · dia de hoje</Text>
          {lista.map((p) => (
            <View key={p.pessoaId} style={styles.pessoa}>
              <Text style={styles.nome} numberOfLines={1}>
                {p.primeiroNome}
              </Text>
              <View style={styles.horas}>
                {MARCACOES_ORDEM.map(({ tipo, rotulo }) => {
                  const m = (p.marcacoes ?? []).find((x) => x.tipo === tipo);
                  return (
                    <View key={tipo} style={styles.slot}>
                      <Text style={styles.rotulo}>{rotulo}</Text>
                      <Text style={styles.hora}>
                        {m ? horaLabel(m.hora) : '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </Cartao>
      )}
    </Tela>
  );
}

export default MarcacoesDoDiaScreen;

const styles = StyleSheet.create({
  titulo: {
    ...tipografia.subtitulo,
    fontWeight: '700',
    color: cores.texto,
  },
  sub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  pessoa: {
    paddingVertical: espacamento.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.divisor,
  },
  nome: {
    ...tipografia.corpo,
    fontWeight: '700',
    color: cores.texto,
    marginBottom: espacamento.xs,
  },
  horas: {
    flexDirection: 'row',
  },
  slot: {
    flex: 1,
    alignItems: 'center',
  },
  rotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  hora: {
    ...tipografia.subtitulo,
    fontWeight: '700',
    color: cores.texto,
  },
});
