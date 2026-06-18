/**
 * Tela do Lote de Sacolas APAE (Req 2.6).
 *
 * Permite registrar o lote inicial, atualizar o saldo restante (com cálculo de
 * quantidade vendida e percentual), reiniciar o ciclo e consultar o histórico
 * de lotes encerrados. Como o backend expõe ações sobre um lote por id (sem um
 * endpoint de "lote ativo"), o lote em andamento é mantido localmente
 * (AsyncStorage) entre sessões.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { ApiError } from '../../api/client';
import { loteApaeService } from '../../api/services';
import { LoteApae } from '../../api/types';
import {
  Aviso,
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  LinhaInfo,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, tipografia } from '../../theme';
import { formatarData, formatarPercentual } from '../../utils/formato';

const CHAVE_LOTE_ATIVO = 'stokcenter.loteApae.ativo';

function percentualVendido(lote: LoteApae): number {
  if (lote.quantidadeInicial <= 0) {
    return 0;
  }
  return (lote.quantidadeVendida / lote.quantidadeInicial) * 100;
}

export function LoteApaeScreen(): React.ReactElement {
  const [lote, setLote] = useState<LoteApae | null>(null);
  const [carregandoAtivo, setCarregandoAtivo] = useState(true);
  const [quantidadeInicial, setQuantidadeInicial] = useState('');
  const [novoSaldo, setNovoSaldo] = useState('');
  const [reinicioQtd, setReinicioQtd] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const historico = useRequisicao(() => loteApaeService.historico(), []);

  useEffect(() => {
    (async () => {
      const salvo = await AsyncStorage.getItem(CHAVE_LOTE_ATIVO);
      if (salvo) {
        try {
          setLote(JSON.parse(salvo) as LoteApae);
        } catch {
          await AsyncStorage.removeItem(CHAVE_LOTE_ATIVO);
        }
      }
      setCarregandoAtivo(false);
    })();
  }, []);

  const persistir = async (novo: LoteApae | null) => {
    setLote(novo);
    if (novo) {
      await AsyncStorage.setItem(CHAVE_LOTE_ATIVO, JSON.stringify(novo));
    } else {
      await AsyncStorage.removeItem(CHAVE_LOTE_ATIVO);
    }
  };

  const registrar = async () => {
    const q = Number(quantidadeInicial);
    if (!Number.isInteger(q) || q < 0) {
      Alert.alert('Quantidade inválida', 'Informe um número inteiro maior ou igual a zero.');
      return;
    }
    setOcupado(true);
    try {
      const criado = await loteApaeService.registrarLote(q);
      await persistir(criado);
      setQuantidadeInicial('');
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar lote.');
    } finally {
      setOcupado(false);
    }
  };

  const atualizar = async () => {
    if (!lote) return;
    const s = Number(novoSaldo);
    if (!Number.isInteger(s) || s < 0) {
      Alert.alert('Saldo inválido', 'Informe um número inteiro maior ou igual a zero.');
      return;
    }
    setOcupado(true);
    try {
      const atualizado = await loteApaeService.atualizarSaldo(lote.id, s);
      await persistir(atualizado);
      setNovoSaldo('');
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao atualizar saldo.');
    } finally {
      setOcupado(false);
    }
  };

  const reiniciar = async () => {
    if (!lote) return;
    const q = Number(reinicioQtd);
    if (!Number.isInteger(q) || q < 0) {
      Alert.alert('Quantidade inválida', 'Informe um número inteiro válido para o novo lote.');
      return;
    }
    setOcupado(true);
    try {
      const { novo } = await loteApaeService.reiniciar(lote.id, q);
      await persistir(novo);
      setReinicioQtd('');
      historico.recarregar();
      Alert.alert('Pronto', 'Lote reiniciado. O lote anterior foi para o histórico.');
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao reiniciar.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Tela aoAtualizar={historico.recarregar} atualizando={historico.atualizando}>
      {carregandoAtivo ? (
        <Carregando />
      ) : lote ? (
        <Cartao titulo="Lote atual">
          <LinhaInfo rotulo="Quantidade inicial" valor={lote.quantidadeInicial} />
          <LinhaInfo rotulo="Saldo atual" valor={lote.saldoAtual} />
          <LinhaInfo rotulo="Quantidade vendida" valor={lote.quantidadeVendida} />
          <LinhaInfo
            rotulo="Percentual vendido"
            valor={formatarPercentual(percentualVendido(lote))}
          />
          <CampoTexto
            rotulo="Atualizar saldo restante"
            keyboardType="number-pad"
            value={novoSaldo}
            onChangeText={setNovoSaldo}
            placeholder={String(lote.saldoAtual)}
            style={{ marginTop: espacamento.md }}
          />
          <Botao titulo="Atualizar saldo" aoPressionar={atualizar} carregando={ocupado} />
          <CampoTexto
            rotulo="Quantidade inicial do novo lote (ao reiniciar)"
            keyboardType="number-pad"
            value={reinicioQtd}
            onChangeText={setReinicioQtd}
            placeholder="0"
            style={{ marginTop: espacamento.md }}
          />
          <Botao
            titulo="Reiniciar lote"
            variante="secundario"
            aoPressionar={reiniciar}
            carregando={ocupado}
          />
        </Cartao>
      ) : (
        <Cartao titulo="Registrar lote inicial">
          <Aviso texto="Nenhum lote ativo. Registre a quantidade inicial de sacolas APAE." />
          <CampoTexto
            rotulo="Quantidade inicial"
            keyboardType="number-pad"
            value={quantidadeInicial}
            onChangeText={setQuantidadeInicial}
            placeholder="0"
          />
          <Botao titulo="Registrar" aoPressionar={registrar} carregando={ocupado} />
        </Cartao>
      )}

      <Text style={styles.tituloSecao}>Histórico de lotes</Text>
      {historico.carregando ? (
        <Carregando />
      ) : historico.erro ? (
        <MensagemErro mensagem={historico.erro} aoTentarNovamente={historico.recarregar} />
      ) : !historico.dados || historico.dados.length === 0 ? (
        <EstadoVazio
          icone="bag-handle-outline"
          titulo="Sem lotes encerrados"
          descricao="Os lotes reiniciados aparecerão aqui."
        />
      ) : (
        historico.dados.map((l) => (
          <Cartao key={l.id}>
            <LinhaInfo rotulo="Quantidade inicial" valor={l.quantidadeInicial} />
            <LinhaInfo rotulo="Total vendido" valor={l.quantidadeVendida} />
            <LinhaInfo rotulo="Início" valor={formatarData(l.dataInicio)} />
            <LinhaInfo
              rotulo="Encerramento"
              valor={l.dataEncerramento ? formatarData(l.dataEncerramento) : '--'}
            />
          </Cartao>
        ))
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  tituloSecao: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.md,
  },
});

export default LoteApaeScreen;
