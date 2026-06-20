/**
 * Tela de Sacolas APAE (Req 2.6).
 *
 * Permite registrar o lote inicial, atualizar o saldo restante (com cálculo de
 * quantidade vendida, percentual e valor arrecadado), reiniciar o ciclo e
 * consultar o histórico de lotes encerrados. O lote em andamento é obtido do
 * backend (`GET /lote-apae/ativo`), de modo que seja compartilhado entre
 * dispositivos e sobreviva à troca de aparelho.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
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
import { cores, espacamento, raio, tipografia } from '../../theme';
import {
  formatarData,
  formatarMoeda,
  formatarPercentual,
} from '../../utils/formato';

/** Preço unitário (R$) de cada sacola APAE — espelha o backend. */
const PRECO_SACOLA_APAE = 0.49;

/** Percentual vendido do lote em [0, 100]. */
function percentualVendido(lote: LoteApae): number {
  if (lote.quantidadeInicial <= 0) {
    return 0;
  }
  const p = (lote.quantidadeVendida / lote.quantidadeInicial) * 100;
  return Math.max(0, Math.min(100, p));
}

/** Valor arrecadado (R$) em benefício da APAE. */
function valorArrecadado(quantidadeVendida: number): number {
  return Math.max(0, quantidadeVendida) * PRECO_SACOLA_APAE;
}

/** Barra de progresso horizontal (0–100%). */
function BarraProgresso({ percentual }: { percentual: number }): React.ReactElement {
  const largura = `${Math.max(0, Math.min(100, percentual))}%` as const;
  return (
    <View style={styles.barraTrilha}>
      <View style={[styles.barraPreenchida, { width: largura }]} />
    </View>
  );
}

export function LoteApaeScreen(): React.ReactElement {
  const [lote, setLote] = useState<LoteApae | null>(null);
  const [carregandoAtivo, setCarregandoAtivo] = useState(true);
  const [quantidadeInicial, setQuantidadeInicial] = useState('');
  const [novoSaldo, setNovoSaldo] = useState('');
  const [reinicioQtd, setReinicioQtd] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const historico = useRequisicao(() => loteApaeService.historico(), []);

  const carregarAtivo = useCallback(async () => {
    setCarregandoAtivo(true);
    try {
      const ativo = await loteApaeService.ativo();
      setLote(ativo);
    } catch {
      // Mantém o estado atual em caso de falha de rede; o usuário pode atualizar.
    } finally {
      setCarregandoAtivo(false);
    }
  }, []);

  useEffect(() => {
    carregarAtivo();
  }, [carregarAtivo]);

  const aoAtualizar = useCallback(() => {
    carregarAtivo();
    historico.recarregar();
  }, [carregarAtivo, historico]);

  const registrar = async () => {
    const q = Number(quantidadeInicial);
    if (!Number.isInteger(q) || q < 0) {
      Alert.alert('Quantidade inválida', 'Informe um número inteiro maior ou igual a zero.');
      return;
    }
    setOcupado(true);
    try {
      const criado = await loteApaeService.registrarLote(q);
      setLote(criado);
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
      setLote(atualizado);
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
      setLote(novo);
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
    <Tela aoAtualizar={aoAtualizar} atualizando={historico.atualizando}>
      {carregandoAtivo ? (
        <Carregando />
      ) : lote ? (
        <Cartao titulo="Lote atual">
          <View style={styles.destaque}>
            <Text style={styles.percentual}>
              {formatarPercentual(percentualVendido(lote))}
            </Text>
            <Text style={styles.percentualRotulo}>vendido do lote</Text>
            <BarraProgresso percentual={percentualVendido(lote)} />
            <View style={styles.arrecadado}>
              <Text style={styles.arrecadadoRotulo}>Arrecadado para a APAE</Text>
              <Text style={styles.arrecadadoValor}>
                {formatarMoeda(valorArrecadado(lote.quantidadeVendida))}
              </Text>
            </View>
          </View>

          <LinhaInfo rotulo="Quantidade inicial" valor={lote.quantidadeInicial} />
          <LinhaInfo rotulo="Saldo atual" valor={lote.saldoAtual} />
          <LinhaInfo rotulo="Quantidade vendida" valor={lote.quantidadeVendida} />
          <LinhaInfo
            rotulo="Preço por sacola"
            valor={formatarMoeda(PRECO_SACOLA_APAE)}
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
            <LinhaInfo
              rotulo="Arrecadado"
              valor={formatarMoeda(valorArrecadado(l.quantidadeVendida))}
            />
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
  destaque: {
    alignItems: 'center',
    paddingBottom: espacamento.md,
    marginBottom: espacamento.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cores.divisor,
  },
  percentual: {
    fontSize: 34,
    fontWeight: '700',
    color: cores.verde,
  },
  percentualRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.md,
  },
  barraTrilha: {
    width: '100%',
    height: 12,
    borderRadius: raio.pill,
    backgroundColor: cores.divisor,
    overflow: 'hidden',
  },
  barraPreenchida: {
    height: '100%',
    borderRadius: raio.pill,
    backgroundColor: cores.verde,
  },
  arrecadado: {
    marginTop: espacamento.md,
    alignItems: 'center',
  },
  arrecadadoRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  arrecadadoValor: {
    ...tipografia.titulo,
    color: cores.texto,
    marginTop: 2,
  },
});

export default LoteApaeScreen;
