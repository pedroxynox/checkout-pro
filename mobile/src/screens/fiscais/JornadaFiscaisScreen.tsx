/**
 * Log de jornada da equipe de fiscais (uso gerencial — funcionalidade
 * FISCAIS_JORNADA). Mostra, por fiscal, o tempo trabalhando, o tempo de
 * intervalo e a carga horária do dia. Os fiscais veem apenas as próprias horas
 * (na tela de Fiscais); aqui é a visão de todos.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fiscaisService } from '../../api/services';
import { ItemJornadaFiscal } from '../../api/types';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { formatarDuracao } from '../../utils/formato';
import { ROTULO_STATUS_FISCAL } from '../../utils/rotulos';
import { cores, espacamento, raio, tipografia } from '../../theme';

export function JornadaFiscaisScreen(): React.ReactElement {
  const jornada = useRequisicao<ItemJornadaFiscal[]>(
    () => fiscaisService.jornada(),
    [],
  );

  return (
    <Tela aoAtualizar={jornada.recarregar} atualizando={jornada.atualizando}>
      <Text style={styles.titulo}>Jornada de hoje</Text>
      {jornada.carregando ? (
        <Carregando />
      ) : jornada.erro ? (
        <MensagemErro
          mensagem={jornada.erro}
          aoTentarNovamente={jornada.recarregar}
        />
      ) : !jornada.dados || jornada.dados.length === 0 ? (
        <EstadoVazio
          icone="time-outline"
          titulo="Sem registros"
          descricao="Ainda não há ponto registrado hoje."
        />
      ) : (
        jornada.dados.map((f) => (
          <Cartao key={f.fiscalId}>
            <View style={styles.topo}>
              <Text style={styles.nome}>{f.primeiroNome}</Text>
              <Text style={styles.status}>{ROTULO_STATUS_FISCAL[f.status]}</Text>
            </View>
            <View style={styles.tempos}>
              <Item rotulo="Trabalhando" valor={formatarDuracao(f.tempoTrabalhandoMs)} />
              <Item rotulo="Intervalo" valor={formatarDuracao(f.tempoIntervaloMs)} />
              <Item rotulo="Carga" valor={formatarDuracao(f.cargaHorariaMs)} />
            </View>
          </Cartao>
        ))
      )}
    </Tela>
  );
}

function Item({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: string;
}): React.ReactElement {
  return (
    <View style={styles.item}>
      <Text style={styles.itemValor}>{valor}</Text>
      <Text style={styles.itemRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginBottom: espacamento.sm,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nome: {
    ...tipografia.rotulo,
    color: cores.texto,
  },
  status: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    fontWeight: '700',
  },
  tempos: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.md,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
  },
  itemValor: {
    ...tipografia.rotulo,
    color: cores.texto,
  },
  itemRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
});

export default JornadaFiscaisScreen;
