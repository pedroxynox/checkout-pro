/**
 * Tela de Sacolas APAE (Req 2.6) — versão inteligente.
 *
 * O lote em andamento vem do backend (`GET /lote-apae/ativo`), compartilhado
 * entre dispositivos, e o painel consolidado vem de `GET /lote-apae/painel`
 * (arrecadação do mês, comparativo com o mês anterior, total histórico,
 * velocidade de venda, previsão de fim do lote, progresso da meta e
 * tendência dos últimos 30 dias). Fluxo:
 *  - O **gerente** adiciona um lote (as sacolas entram em estoque), pode
 *    reiniciar/substituir o lote e configurar o preço da sacola e a meta
 *    mensal. O **fiscal** apenas visualiza e atualiza o saldo.
 *  - Ao atualizar o saldo restante, o backend registra quantas foram vendidas
 *    desde a última contagem (mesmo sem controle de vendas em tempo real) e
 *    atualiza estoque, arrecadação e percentual vendido do lote ativo.
 *  - Ao **zerar** o saldo, o lote é salvo automaticamente no histórico.
 *
 * O preço da sacola não é mais fixo no código: vem da configuração do backend.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { loteApaeService } from '../../api/services';
import { LoteApae, PainelApae } from '../../api/types';
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
import { confirmar, notificar } from '../../utils/dialogos';
import {
  formatarData,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
} from '../../utils/formato';

/** Cor das sacolas ainda em estoque na rosca. */
const COR_ESTOQUE = '#2E6FD2';

/** Preço de fallback (R$) caso o painel ainda não tenha carregado. */
const PRECO_FALLBACK = 0.49;

/** Percentual vendido do lote em [0, 100]. */
function percentualVendido(lote: LoteApae): number {
  if (lote.quantidadeInicial <= 0) {
    return 0;
  }
  const p = (lote.quantidadeVendida / lote.quantidadeInicial) * 100;
  return Math.max(0, Math.min(100, p));
}

/** Valor arrecadado (R$) em benefício da APAE para uma quantidade vendida. */
function valorArrecadado(quantidadeVendida: number, preco: number): number {
  return Math.max(0, quantidadeVendida) * preco;
}

/** Barra de progresso horizontal (0–100%). */
function BarraProgresso({
  percentual,
  cor = cores.verde,
}: {
  percentual: number;
  cor?: string;
}): React.ReactElement {
  const largura = `${Math.max(0, Math.min(100, percentual))}%` as `${number}%`;
  return (
    <View style={styles.barraTrilha}>
      <View style={[styles.barraPreenchida, { width: largura, backgroundColor: cor }]} />
    </View>
  );
}

/** Mini-gráfico de tendência (sparkline) dos últimos dias, em barras finas. */
function Sparkline({
  valores,
}: {
  valores: number[];
}): React.ReactElement | null {
  if (valores.length === 0) {
    return null;
  }
  const max = Math.max(1, ...valores);
  return (
    <View style={styles.sparkline}>
      {valores.map((v, i) => {
        const altura = `${Math.max(4, (v / max) * 100)}%` as `${number}%`;
        return (
          <View key={i} style={styles.sparkColuna}>
            <View
              style={[
                styles.sparkBarra,
                { height: altura, backgroundColor: v > 0 ? cores.verde : cores.divisor },
              ]}
            />
          </View>
        );
      })}
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

  // Configuração editável (preço/meta) — apenas gestor.
  const [precoInput, setPrecoInput] = useState('');
  const [metaInput, setMetaInput] = useState('');
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const historico = useRequisicao(() => loteApaeService.historico(), []);
  const painelReq = useRequisicao(() => loteApaeService.painel(), []);
  const painel: PainelApae | null = painelReq.dados ?? null;

  // Preço efetivo da sacola (config do backend, com fallback).
  const preco = painel?.precoSacola ?? PRECO_FALLBACK;

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

  // Preenche os campos de configuração quando o painel carrega (uma vez).
  useEffect(() => {
    if (painel) {
      setPrecoInput(String(painel.precoSacola).replace('.', ','));
      setMetaInput(String(painel.metaMensal).replace('.', ','));
    }
  }, [painel]);

  const aoAtualizar = useCallback(() => {
    carregarAtivo();
    historico.recarregar();
    painelReq.recarregar();
  }, [carregarAtivo, historico, painelReq]);

  const registrar = async () => {
    const q = Number(quantidadeInicial);
    if (!Number.isInteger(q) || q < 0) {
      notificar('Quantidade inválida', 'Informe um número inteiro maior ou igual a zero.');
      return;
    }
    setOcupado(true);
    try {
      const criado = await loteApaeService.registrarLote(q);
      setLote(criado);
      setQuantidadeInicial('');
      painelReq.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar lote.');
    } finally {
      setOcupado(false);
    }
  };

  const atualizar = async () => {
    if (!lote) return;
    const s = Number(novoSaldo);
    if (!Number.isInteger(s) || s < 0) {
      notificar('Saldo inválido', 'Informe um número inteiro maior ou igual a zero.');
      return;
    }
    setOcupado(true);
    try {
      const atualizado = await loteApaeService.atualizarSaldo(lote.id, s);
      setNovoSaldo('');
      if (atualizado.status === 'ENCERRADO') {
        // Saldo zerado: o lote foi salvo automaticamente como vendido.
        setLote(null);
        notificar(
          'Lote concluído! 🎉',
          `Todas as sacolas foram vendidas. Lote salvo no histórico — ${formatarMoeda(
            valorArrecadado(atualizado.quantidadeVendida, preco),
          )} arrecadados para a APAE.`,
        );
      } else {
        setLote(atualizado);
      }
      historico.recarregar();
      painelReq.recarregar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao atualizar saldo.');
    } finally {
      setOcupado(false);
    }
  };

  const reiniciar = async () => {
    if (!lote) return;
    const q = Number(reinicioQtd);
    if (!Number.isInteger(q) || q < 0) {
      notificar('Quantidade inválida', 'Informe um número inteiro válido para o novo lote.');
      return;
    }
    setOcupado(true);
    try {
      const { novo } = await loteApaeService.reiniciar(lote.id, q);
      setLote(novo);
      setReinicioQtd('');
      historico.recarregar();
      painelReq.recarregar();
      notificar('Pronto', 'Lote substituído. O lote anterior foi para o histórico.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao reiniciar.');
    } finally {
      setOcupado(false);
    }
  };

  const salvarConfig = async () => {
    const precoNum = Number(precoInput.replace(',', '.'));
    const metaNum = Number(metaInput.replace(',', '.'));
    if (!Number.isFinite(precoNum) || precoNum < 0) {
      notificar('Preço inválido', 'Informe um valor em reais maior ou igual a zero.');
      return;
    }
    if (!Number.isFinite(metaNum) || metaNum < 0) {
      notificar('Meta inválida', 'Informe um valor em reais maior ou igual a zero.');
      return;
    }
    setSalvandoConfig(true);
    try {
      await loteApaeService.definirConfig({ precoSacola: precoNum, metaMensal: metaNum });
      painelReq.recarregar();
      notificar('Configuração salva', 'Preço da sacola e meta mensal atualizados.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao salvar configuração.');
    } finally {
      setSalvandoConfig(false);
    }
  };

  const confirmarLimparHistorico = async () => {
    const ok = await confirmar(
      'Limpar histórico',
      'Remover todos os lotes vendidos do histórico? Esta ação não pode ser desfeita. O lote ativo não é afetado.',
      'Limpar',
    );
    if (!ok) {
      return;
    }
    setOcupado(true);
    try {
      const { removidos } = await loteApaeService.limparHistorico();
      historico.recarregar();
      painelReq.recarregar();
      notificar('Histórico limpo', `${removidos} lote(s) removido(s) do histórico.`);
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao limpar histórico.');
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
      valor: valorArrecadado(l.quantidadeVendida, preco),
    }));

  // Progresso da meta em %, e variação vs mês anterior.
  const metaPct = painel ? painel.metaProgresso * 100 : 0;
  const corMeta = metaPct >= 100 ? cores.verde : metaPct >= 60 ? cores.amarelo : cores.vermelho;
  const variacao = painel?.variacaoMes ?? null;

  return (
    <Tela aoAtualizar={aoAtualizar} atualizando={historico.atualizando || painelReq.atualizando}>
      {/* Termômetro histórico: total arrecadado para a APAE de todos os tempos */}
      <View style={styles.banner}>
        <Text style={styles.bannerRotulo}>Total arrecadado para a APAE</Text>
        <Text style={styles.bannerValor}>
          {formatarMoeda(painel?.totalHistorico ?? 0)}
        </Text>
        <Text style={styles.bannerLegenda}>
          {formatarMoeda(preco)} por sacola · histórico de todos os lotes
        </Text>
      </View>

      {/* Card da meta mensal + comparativo com o mês anterior */}
      {painel && (
        <Cartao titulo="Meta do mês">
          <View style={styles.metaTopo}>
            <Text style={styles.metaArrecadado}>{formatarMoeda(painel.arrecadadoMes)}</Text>
            <Text style={styles.metaAlvo}>de {formatarMoeda(painel.metaMensal)}</Text>
          </View>
          <BarraProgresso percentual={metaPct} cor={corMeta} />
          <View style={styles.metaRodape}>
            <Text style={[styles.metaPct, { color: corMeta }]}>
              {formatarPercentual(metaPct, 0)} da meta
            </Text>
            {variacao != null && (
              <Text
                style={[
                  styles.metaVariacao,
                  { color: variacao >= 0 ? cores.verde : cores.vermelho },
                ]}
              >
                {variacao >= 0 ? '↑' : '↓'} {formatarPercentual(Math.abs(variacao), 0)} vs mês anterior
              </Text>
            )}
          </View>
          {variacao == null && (
            <Text style={styles.metaNota}>
              Mês anterior: {formatarMoeda(painel.arrecadadoMesAnterior)} — sem base para
              comparar ainda.
            </Text>
          )}
        </Cartao>
      )}

      {/* Velocidade de venda, previsão de fim de lote e tendência (30 dias) */}
      {painel && (
        <Cartao titulo="Ritmo de vendas">
          <View style={styles.destaques}>
            <View style={styles.destaqueBox}>
              <Text style={styles.destaqueValor}>
                {formatarNumero(Math.round(painel.velocidadeDia * 10) / 10)}
              </Text>
              <Text style={styles.destaqueRotulo}>Sacolas/dia (média)</Text>
            </View>
            <View style={styles.destaqueDivisor} />
            <View style={styles.destaqueBox}>
              <Text style={[styles.destaqueValor, { color: cores.primaria }]}>
                {formatarNumero(painel.sacolasVendidasMes)}
              </Text>
              <Text style={styles.destaqueRotulo}>Vendidas no mês</Text>
            </View>
          </View>

          {painel.previsaoDiasFimLote != null && painel.saldoLoteAtivo != null && (
            <Aviso
              texto={`No ritmo atual, o lote ativo (${formatarNumero(
                painel.saldoLoteAtivo,
              )} sacolas) acaba em ~${painel.previsaoDiasFimLote} dia(s).`}
            />
          )}

          {painel.tendencia.some((p) => p.vendidas > 0) ? (
            <>
              <Text style={styles.sparkTitulo}>Tendência (últimos 30 dias)</Text>
              <Sparkline valores={painel.tendencia.map((p) => p.vendidas)} />
            </>
          ) : (
            <Text style={styles.metaNota}>
              Ainda sem vendas registradas nos últimos 30 dias para mostrar a tendência.
            </Text>
          )}
        </Cartao>
      )}

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
                {formatarMoeda(valorArrecadado(lote.quantidadeVendida, preco))}
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
            <LinhaInfo rotulo="Preço por sacola" valor={formatarMoeda(preco)} />
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

      {/* Configuração (preço da sacola e meta mensal) — apenas gestor */}
      {podeGerenciar && (
        <Cartao titulo="Configuração">
          <Aviso texto="Defina o preço de cada sacola e a meta de arrecadação do mês." />
          <CampoTexto
            rotulo="Preço por sacola (R$)"
            keyboardType="decimal-pad"
            value={precoInput}
            onChangeText={setPrecoInput}
            placeholder="0,49"
          />
          <CampoTexto
            rotulo="Meta mensal (R$)"
            keyboardType="decimal-pad"
            value={metaInput}
            onChangeText={setMetaInput}
            placeholder="500"
            style={{ marginTop: espacamento.sm }}
          />
          <Botao
            titulo="Salvar configuração"
            variante="secundario"
            aoPressionar={salvarConfig}
            carregando={salvandoConfig}
          />
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
                    valor={formatarMoeda(valorArrecadado(l.quantidadeVendida, preco))}
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
  metaTopo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: espacamento.xs,
    marginBottom: espacamento.sm,
  },
  metaArrecadado: {
    fontSize: 24,
    fontWeight: '700',
    color: cores.texto,
  },
  metaAlvo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
  },
  metaRodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: espacamento.xs,
  },
  metaPct: {
    ...tipografia.rotulo,
    fontWeight: '700',
  },
  metaVariacao: {
    ...tipografia.legenda,
    fontWeight: '700',
  },
  metaNota: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    fontStyle: 'italic',
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
    textAlign: 'center',
  },
  sparkTitulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginTop: espacamento.sm,
    marginBottom: espacamento.xs,
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 48,
    gap: 2,
  },
  sparkColuna: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  sparkBarra: {
    width: '100%',
    borderRadius: 2,
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
