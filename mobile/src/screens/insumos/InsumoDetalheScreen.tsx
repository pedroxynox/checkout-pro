/**
 * Detalhe de um insumo (Req 3.1.4, 3.1.6, 3.2.4).
 *
 * Mostra o saldo atual em tempo real, se está com estoque baixo, e o histórico
 * de movimentos de estoque (deltas) do insumo selecionado.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { insumosService } from '../../api/services';
import {
  Carregando,
  Cartao,
  EstadoVazio,
  LinhaInfo,
  MensagemErro,
  Selo,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarDataHora } from '../../utils/formato';

export function InsumoDetalheScreen({
  route,
}: PropsTela<'InsumoDetalhe'>): React.ReactElement {
  const { insumoId } = route.params;

  const resumo = useRequisicao(
    async () => {
      const [{ saldo }, { estoqueBaixo }] = await Promise.all([
        insumosService.saldo(insumoId),
        insumosService.estoqueBaixo(insumoId),
      ]);
      return { saldo, estoqueBaixo };
    },
    [insumoId],
  );
  const historico = useRequisicao(
    () => insumosService.historico(insumoId),
    [insumoId],
  );

  const recarregar = () => {
    resumo.recarregar();
    historico.recarregar();
  };

  return (
    <Tela aoAtualizar={recarregar} atualizando={resumo.atualizando}>
      <Cartao titulo="Saldo atual">
        {resumo.carregando ? (
          <Carregando />
        ) : resumo.erro ? (
          <MensagemErro mensagem={resumo.erro} aoTentarNovamente={resumo.recarregar} />
        ) : (
          <View style={styles.saldoLinha}>
            <Text style={styles.saldo}>{resumo.dados?.saldo ?? '--'}</Text>
            {resumo.dados?.estoqueBaixo ? (
              <Selo texto="Estoque baixo" cor={cores.vermelho} fundo={cores.vermelhoFundo} />
            ) : (
              <Selo texto="Estoque ok" cor={cores.verde} fundo={cores.verdeFundo} />
            )}
          </View>
        )}
      </Cartao>

      <Text style={styles.tituloSecao}>Movimentos</Text>
      {historico.carregando ? (
        <Carregando />
      ) : historico.erro ? (
        <MensagemErro mensagem={historico.erro} aoTentarNovamente={historico.recarregar} />
      ) : !historico.dados || historico.dados.length === 0 ? (
        <EstadoVazio
          icone="swap-vertical-outline"
          titulo="Sem movimentos"
          descricao="Retiradas e consumos aparecerão aqui."
        />
      ) : (
        historico.dados.map((m) => (
          <Cartao key={m.id}>
            <View style={styles.movTopo}>
              <Ionicons
                name={m.delta < 0 ? 'arrow-down-circle' : 'arrow-up-circle'}
                size={20}
                color={m.delta < 0 ? cores.vermelho : cores.verde}
              />
              <Text style={[styles.movDelta, { color: m.delta < 0 ? cores.vermelho : cores.verde }]}>
                {m.delta > 0 ? `+${m.delta}` : m.delta}
              </Text>
            </View>
            <LinhaInfo rotulo="Data/hora" valor={formatarDataHora(m.dataHora)} />
            {m.destino ? <LinhaInfo rotulo="Destino" valor={m.destino} /> : null}
            {m.pdvId ? <LinhaInfo rotulo="PDV" valor={m.pdvId} /> : null}
          </Cartao>
        ))
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  saldoLinha: {
    alignItems: 'center',
    gap: espacamento.sm,
  },
  saldo: {
    ...tipografia.titulo,
    fontSize: 40,
    color: cores.primaria,
  },
  tituloSecao: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.md,
  },
  movTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginBottom: espacamento.xs,
  },
  movDelta: {
    ...tipografia.subtitulo,
  },
});

export default InsumoDetalheScreen;
