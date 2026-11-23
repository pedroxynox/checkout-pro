/**
 * Cartão "Jornada 5x2" da Conferência de escala (spec `jornada-5x2`, R5.3):
 * quantas pessoas já estão na jornada nova, quem ainda está no 6x1 da ficha
 * antiga e os avisos da vigência de cada um (dia sem horário, disponibilidade
 * fora da carga, sem folga). Serve para acompanhar a carga das vigências.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ConferenciaJornada } from '../../api/types';
import { Aviso, Cartao } from '../../components';
import { cores, espacamento, tipografia } from '../../theme';
import { isoParaDataBR } from '../../utils/formato';

export function ConferenciaJornadaCartao({
  jornada,
}: {
  jornada: ConferenciaJornada;
}): React.ReactElement {
  const faltam = jornada.semVigencia.length;
  return (
    <Cartao titulo="Jornada 5x2">
      <Text style={styles.resumo}>
        {jornada.comVigencia} com a jornada nova · {faltam} ainda no 6x1
      </Text>
      {faltam > 0 ? (
        <>
          <Text style={styles.rotulo}>Ainda sem vigência</Text>
          <Text style={styles.nomes}>
            {jornada.semVigencia.map((p) => p.nome).join(', ')}
          </Text>
          <Text style={styles.nota}>
            Carregue a jornada de cada um em Centro de Controle › Colaboradores
            ("Vale a partir de").
          </Text>
        </>
      ) : (
        <Aviso tom="sucesso" texto="Toda a equipe já tem a jornada nova." />
      )}
      {jornada.avisos.length > 0 ? (
        <>
          <Text style={styles.rotulo}>Avisos da jornada</Text>
          {jornada.avisos.map((p) => (
            <View key={p.colaboradorId} style={styles.pessoa}>
              <Text style={styles.nome}>
                {p.nome}
                <Text style={styles.data}>
                  {' '}
                  · a partir de {isoParaDataBR(p.aPartirDe)}
                </Text>
              </Text>
              {p.avisos.map((a, i) => (
                <Text key={`${a.tipo}-${i}`} style={styles.aviso}>
                  • {a.mensagem}
                </Text>
              ))}
            </View>
          ))}
          <Text style={styles.nota}>
            Avisos não impedem salvar; confira se é isso mesmo.
          </Text>
        </>
      ) : null}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  resumo: {
    ...tipografia.corpo,
    color: cores.texto,
    fontWeight: '600',
    marginBottom: espacamento.xs,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  nomes: { ...tipografia.corpo, color: cores.texto },
  pessoa: { marginBottom: espacamento.sm },
  nome: { ...tipografia.corpo, color: cores.texto, fontWeight: '600' },
  data: { ...tipografia.legenda, color: cores.textoSecundario },
  aviso: { ...tipografia.legenda, color: cores.texto, marginTop: 2 },
  nota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
});

export default ConferenciaJornadaCartao;
