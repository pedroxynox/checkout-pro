/**
 * Tela de Sacolas APAE (Req 2.6).
 *
 * O lote em andamento vem do backend (`GET /lote-apae/ativo`), compartilhado
 * entre dispositivos. Fluxo:
 *  - O **gerente** adiciona um lote (as sacolas entram em estoque) e pode
 *    reiniciar/substituir o lote. O **fiscal** NÃO adiciona nem reinicia.
 *  - Ao atualizar o saldo restante, atualizam-se: sacolas em estoque, valor
 *    arrecadado (R$) para a APAE e o percentual vendido do lote ativo.
 *  - Ao **zerar** o saldo, o lote é salvo automaticamente como "lote vendido"
 *    no histórico.
 *
 * Visual: rosca (vendidas × estoque), barra de progresso horizontal do
 * percentual vendido e barras de arrecadação por lote no histórico.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { loteApaeService } from '../../api/services';
import { LoteApae } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Aviso,
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  GraficoBarrasVerticais,
  GraficoPizza,
  LinhaInfo,
  MensagemErro,
  Tela,
} from '../../components';
import { useRequisicao } from '../../hooks/useRequisicao';
import { cores, espacamento, raio, tipografia } from '../../theme';
import {
  formatarData,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
} from '../../utils/formato';

/** Preço unitário (R$) de cada sacola APAE — espelha o backend. */
const PRECO_SACOLA_APAE = 0.49;

/** Cor das sacolas ainda em estoque na rosca. */
const COR_ESTOQUE = '#2E6FD2';

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
  const largura = `${Math.max(0, Math.min(100, percentual))}%` as `${number}%`;
  return (
    <View style={styles.barraTrilha}>
      <View style={[styles.barraPreenchida, { width: largura }]} />
    </View>
  );
}

export function LoteApaeScreen(): React.ReactElement {
  const { podeAcessar } = useAuth();
  const podeGerenciar = podeAcessar('LOTE_APAE_GERENCIAR');

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

  // Total arrecadado para a APAE (lotes vendidos + lote ativo).
  const totalArrecadado = useMemo(() => {
    const doHistorico = (historico.dados ?? []).reduce(
      (soma, l) => soma + valorArrecadado(l.quantidadeVendida),
      0,
    );
    const doAtivo = lote ? valorArrecadado(lote.quantidadeVendida) : 0;
    return doHistorico + doAtivo;
  }, [historico.dados, lote]);

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
      setNovoSaldo('');
      if (atualizado.status === 'ENCERRADO') {
        // Saldo zerado: o lote foi salvo automaticamente como vendido.
        setLote(null);
        historico.recarregar();
        Alert.alert(
          'Lote concluído! 🎉',
          `Todas as sacolas foram vendidas. Lote salvo no histórico — ${formatarMoeda(
            valorArrecadado(atualizado.quantidadeVendida),
          )} arrecadados para a APAE.`,
        );
      } else {
        setLote(atualizado);
      }
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
      Alert.alert('Pronto', 'Lote substituído. O lote anterior foi para o histórico.');
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao reiniciar.');
    } finally {
      setOcupado(false);
    }
  };

  const confirmarLimparHistorico = () => {
    Alert.alert(
      'Limpar histórico',
      'Remover todos os lotes vendidos do histórico? Esta ação não pode ser desfeita. O lote ativo não é afetado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Limpar', style: 'destructive', onPress: limparHistorico },
      ],
    );
  };

  const limparHistorico = async () => {
    setOcupado(true);
    try {
      const { removidos } = await loteApaeService.limparHistorico();
      historico.recarregar();
      Alert.alert('Histórico limpo', `${removidos} lote(s) removido(s) do histórico.`);
    } catch (e) {
      Alert.alert('Erro', e instanceof ApiError ? e.message : 'Falha ao limpar histórico.');
    } finally {
      setOcupado(false);
    }
  };

  const pct = lote ? percentualVendido(lote) : 0;
  const fatias = lote
    ? [
        { rotulo: 'Vendidas', valor: lote.quantidadeVendida, cor: cores.verde },
        { rotulo: 'Em estoque', valor: lote.saldoAtual, cor: COR_ESTOQUE },
      ]
    : [];

  const lotesVendidos = historico.dados ?? [];
  const barrasHistorico = [...lotesVendidos]
    .reverse()
    .slice(-8)
    .map((l) => ({
      rotulo: l.dataEncerramento ? formatarData(l.dataEncerramento).slice(0, 5) : '--',
      valor: valorArrecadado(l.quantidadeVendida),
    }));

  return (
    <Tela aoAtualizar={aoAtualizar} atualizando={historico.atualizando}>
      {/* Banner de arrecadação total para a APAE */}
      <View style={styles.banner}>
        <Text style={styles.bannerRotulo}>Total arrecadado para a APAE</Text>
        <Text style={styles.bannerValor}>{formatarMoeda(totalArrecadado)}</Text>
        <Text style={styles.bannerLegenda}>
          {formatarMoeda(PRECO_SACOLA_APAE)} por sacola · lotes vendidos + lote atual
        </Text>
      </View>

      {carregandoAtivo ? (
        <Carregando />
      ) : lote ? (
        <Cartao titulo="Lote atual">
          {/* Rosca: vendidas × em estoque */}
          <GraficoPizza
            fatias={fatias}
            mostrarValor
            formatarValor={(v) => formatarNumero(v)}
          />

          {/* Destaques: estoque e arrecadado */}
          <View style={styles.destaques}>
            <View style={styles.destaqueBox}>
              <Text style={styles.destaqueValor}>{formatarNumero(lote.saldoAtual)}</Text>
              <Text style={styles.destaqueRotulo}>Sacolas em estoque</Text>
            </View>
            <View style={styles.destaqueDivisor} />
            <View style={styles.destaqueBox}>
              <Text style={[styles.destaqueValor, { color: cores.verde }]}>
                {formatarMoeda(valorArrecadado(lote.quantidadeVendida))}
              </Text>
              <Text style={styles.destaqueRotulo}>Arrecadado (lote)</Text>
            </View>
          </View>

          {/* Progresso horizontal do percentual vendido */}
          <View style={styles.progressoCabecalho}>
            <Text style={styles.progressoRotulo}>Vendido do lote</Text>
            <Text style={styles.progressoPct}>{formatarPercentual(pct)}</Text>
          </View>
          <BarraProgresso percentual={pct} />

          <View style={{ marginTop: espacamento.md }}>
            <LinhaInfo rotulo="Quantidade inicial" valor={lote.quantidadeInicial} />
            <LinhaInfo rotulo="Quantidade vendida" valor={lote.quantidadeVendida} />
            <LinhaInfo rotulo="Preço por sacola" valor={formatarMoeda(PRECO_SACOLA_APAE)} />
          </View>

          <CampoTexto
            rotulo="Atualizar saldo restante"
            keyboardType="number-pad"
            value={novoSaldo}
            onChangeText={setNovoSaldo}
            placeholder={String(lote.saldoAtual)}
            style={{ marginTop: espacamento.md }}
          />
          <Aviso texto="Ao informar 0, o lote é concluído e salvo como vendido." />
          <Botao titulo="Atualizar saldo" aoPressionar={atualizar} carregando={ocupado} />

          {podeGerenciar && (
            <>
              <CampoTexto
                rotulo="Substituir por novo lote (quantidade inicial)"
                keyboardType="number-pad"
                value={reinicioQtd}
                onChangeText={setReinicioQtd}
                placeholder="0"
                style={{ marginTop: espacamento.lg }}
              />
              <Botao
                titulo="Substituir lote"
                variante="secundario"
                aoPressionar={reiniciar}
                carregando={ocupado}
              />
            </>
          )}
        </Cartao>
      ) : podeGerenciar ? (
        <Cartao titulo="Adicionar lote">
          <Aviso texto="Nenhum lote ativo. Informe a quantidade de sacolas APAE recebidas — elas entram em estoque." />
          <CampoTexto
            rotulo="Quantidade de sacolas do lote"
            keyboardType="number-pad"
            value={quantidadeInicial}
            onChangeText={setQuantidadeInicial}
            placeholder="0"
          />
          <Botao titulo="Adicionar lote" aoPressionar={registrar} carregando={ocupado} />
        </Cartao>
      ) : (
        <Cartao titulo="Sem lote ativo">
          <Aviso texto="Nenhum lote de sacolas APAE ativo no momento. Peça ao gerente para adicionar um lote." />
        </Cartao>
      )}

      <Text style={styles.tituloSecao}>Histórico de lotes vendidos</Text>
      {historico.carregando ? (
        <Carregando />
      ) : historico.erro ? (
        <MensagemErro mensagem={historico.erro} aoTentarNovamente={historico.recarregar} />
      ) : lotesVendidos.length === 0 ? (
        <EstadoVazio
          icone="bag-handle-outline"
          titulo="Sem lotes vendidos"
          descricao="Os lotes concluídos aparecerão aqui."
        />
      ) : (
        <>
          {barrasHistorico.length > 0 && (
            <Cartao titulo="Arrecadação por lote (R$)">
              <GraficoBarrasVerticais dados={barrasHistorico} />
            </Cartao>
          )}
          {lotesVendidos.map((l) => {
            const pctLote = percentualVendido(l);
            return (
              <Cartao key={l.id}>
                <View style={styles.progressoCabecalho}>
                  <Text style={styles.progressoRotulo}>Vendido do lote</Text>
                  <Text style={styles.progressoPct}>{formatarPercentual(pctLote)}</Text>
                </View>
                <BarraProgresso percentual={pctLote} />
                <View style={{ marginTop: espacamento.sm }}>
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
                </View>
              </Cartao>
            );
          })}
          {podeGerenciar && (
            <Botao
              titulo="Limpar histórico"
              variante="perigo"
              aoPressionar={confirmarLimparHistorico}
              carregando={ocupado}
            />
          )}
        </>
      )}
    </Tela>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: cores.verdeFundo,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    alignItems: 'center',
    marginBottom: espacamento.md,
  },
  bannerRotulo: {
    ...tipografia.rotulo,
    color: cores.verde,
  },
  bannerValor: {
    fontSize: 30,
    fontWeight: '700',
    color: cores.verde,
    marginTop: 2,
  },
  bannerLegenda: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
    textAlign: 'center',
  },
  tituloSecao: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.sm,
    marginBottom: espacamento.md,
  },
  destaques: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: espacamento.md,
    marginBottom: espacamento.md,
  },
  destaqueBox: {
    flex: 1,
    alignItems: 'center',
  },
  destaqueDivisor: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: cores.divisor,
  },
  destaqueValor: {
    ...tipografia.titulo,
    color: cores.texto,
  },
  destaqueRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  progressoCabecalho: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: espacamento.xs,
  },
  progressoRotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
  },
  progressoPct: {
    ...tipografia.rotulo,
    color: cores.verde,
    fontWeight: '700',
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
});

export default LoteApaeScreen;
