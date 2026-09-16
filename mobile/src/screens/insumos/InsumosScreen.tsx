/**
 * Tela de Insumos — "Almoxarifado Inteligente"
 *
 * 3 zonas:
 * 1. PAINEL VISUAL: cards com saldo, semáforo inteligente (3 níveis),
 *    predicción de ruptura e sugestão de reposição.
 * 2. AÇÕES RÁPIDAS: botões grandes para consumo rápido (1 fardo, 1 caixa,
 *    1 galão) sem formulários complexos.
 * 3. GESTÃO (gestores): entrada de estoque, requisições, histórico.
 *
 * O sistema é PROATIVO: mostra "vai acabar em X dias" e sugere quantidades.
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../../api/client';
import { insumosService, requisicoesService } from '../../api/services';
import { InsumoProativo, NivelEstoque, SugestaoPedido } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import {
  Botao,
  CampoTexto,
  Carregando,
  Cartao,
  EstadoVazio,
  MensagemErro,
  Tela,
} from '../../components';
import { PropsTela } from '../../navigation/types';
import { cores, espacamento, raio, sombra, tipografia } from '../../theme';
import { confirmar, notificar } from '../../utils/dialogos';
import { formatarNumero } from '../../utils/formato';

// ==================== Helpers ====================

function corNivel(nivel: NivelEstoque): string {
  if (nivel === 'CRITICO') return cores.vermelho;
  if (nivel === 'ATENCAO') return cores.amarelo;
  return cores.verde;
}

function fundoNivel(nivel: NivelEstoque): string {
  if (nivel === 'CRITICO') return cores.vermelhoFundo;
  if (nivel === 'ATENCAO') return cores.amareloFundo;
  return cores.verdeFundo;
}

function iconeNivel(nivel: NivelEstoque): keyof typeof Ionicons.glyphMap {
  if (nivel === 'CRITICO') return 'alert-circle';
  if (nivel === 'ATENCAO') return 'warning';
  return 'checkmark-circle';
}

/** Ícone representativo de cada categoria de insumo. */
function iconeCategoria(categoria: string): keyof typeof Ionicons.glyphMap {
  switch (categoria) {
    case 'SACOLA': return 'bag-handle';
    case 'BOBINA': return 'receipt';
    case 'PANO': return 'shirt';
    case 'ALCOOL': return 'flask';
    default: return 'cube';
  }
}

function rotuloNivel(nivel: NivelEstoque): string {
  if (nivel === 'CRITICO') return 'Crítico';
  if (nivel === 'ATENCAO') return 'Atenção';
  return 'OK';
}

function pluralEmbalagem(embalagem: string, qtd: number): string {
  if (qtd === 1) return embalagem;
  return embalagem.endsWith('ão') ? `${embalagem.slice(0, -2)}ões` : `${embalagem}s`;
}

function capitalizar(texto: string): string {
  return texto.length ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

// ==================== Component ====================

export function InsumosScreen({
  navigation,
}: PropsTela<'Insumos'>): React.ReactElement {
  const { podeAcessar } = useAuth();
  const podeGerenciar = podeAcessar('INSUMOS_GERENCIAR');

  const [insumos, setInsumos] = useState<InsumoProativo[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [sugestoes, setSugestoes] = useState<SugestaoPedido[]>([]);
  const [proximoSacolas, setProximoSacolas] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [consumindo, setConsumindo] = useState<string | null>(null);
  const [confirmandoPedido, setConfirmandoPedido] = useState(false);

  // Card flutuante de saída: insumo selecionado + quantidade (começa em 1).
  const [saidaInsumo, setSaidaInsumo] = useState<InsumoProativo | null>(null);
  const [qtdSaida, setQtdSaida] = useState(1);

  // Gestão: entrada
  const [entradaAberta, setEntradaAberta] = useState(false);
  const [insumoEntrada, setInsumoEntrada] = useState<string | null>(null);
  const [qtdEntrada, setQtdEntrada] = useState('');
  const [registrandoEntrada, setRegistrandoEntrada] = useState(false);

  const buscar = useCallback(async () => {
    const [lista, cont, sugs, prox] = await Promise.all([
      insumosService.listarProativo().catch(() => insumosService.listar()),
      requisicoesService.pendentes().catch(() => ({ total: 0 })),
      insumosService.sugestoesPendentes().catch(() => [] as SugestaoPedido[]),
      insumosService.proximoQuinzenal().catch(() => null),
    ]);
    setInsumos(lista as InsumoProativo[]);
    setPendentes(cont.total);
    setSugestoes(sugs);
    setProximoSacolas(prox?.diasRestantes ?? null);
    setErro(null);
  }, []);

  const carregar = useCallback(
    async (ehAtualizacao = false) => {
      if (ehAtualizacao) setAtualizando(true);
      else setCarregando(true);
      try {
        await buscar();
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : 'Falha ao carregar os insumos.');
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [buscar],
  );

  const primeiraCarga = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primeiraCarga.current) {
        primeiraCarga.current = false;
        void carregar();
      } else {
        void buscar().catch(() => undefined);
      }
    }, [carregar, buscar]),
  );

  // ==================== Ações rápidas ====================

  // Máximo de embalagens que dá para retirar (não deixa o estoque negativo).
  const maxSaida = saidaInsumo
    ? Math.max(1, Math.floor(saidaInsumo.saldo / saidaInsumo.fatorEmbalagem))
    : 1;

  /** Abre o card flutuante de saída para o insumo (quantidade começa em 1). */
  const abrirSaida = (insumo: InsumoProativo) => {
    if (insumo.saldo < insumo.fatorEmbalagem) {
      notificar(
        'Sem estoque',
        `Não há ${capitalizar(insumo.embalagem)} de ${insumo.nome} em estoque para registrar saída.`,
      );
      return;
    }
    setQtdSaida(1);
    setSaidaInsumo(insumo);
  };

  /** Ajusta a quantidade a retirar, sempre entre 1 e o máximo do estoque. */
  const ajustarSaida = (delta: number) => {
    setQtdSaida((q) => Math.min(maxSaida, Math.max(1, q + delta)));
  };

  /** Confirma a saída de `qtdSaida` embalagens do insumo selecionado. */
  const confirmarSaida = async () => {
    if (!saidaInsumo) return;
    const insumo = saidaInsumo;
    const qtd = qtdSaida;
    setConsumindo(insumo.id);
    try {
      const { saldo } = await insumosService.consumirEmbalagem(insumo.id, qtd);
      setSaidaInsumo(null);
      await buscar();
      notificar(
        'Saída registrada',
        `${qtd} ${pluralEmbalagem(insumo.embalagem, qtd)} de ${insumo.nome}. Novo saldo: ${formatarNumero(saldo)} ${insumo.unidade}${saldo === 1 ? '' : 's'}.`,
      );
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar saída.');
    } finally {
      setConsumindo(null);
    }
  };

  // ==================== Pedido da semana ====================

  const confirmarPedido = async () => {
    if (sugestoes.length === 0) return;
    const ok = await confirmar(
      '✅ Confirmar pedido',
      `Confirmar entrada de ${sugestoes.length} item(ns) no estoque?`,
      'Confirmar',
    );
    if (!ok) return;

    setConfirmandoPedido(true);
    try {
      const ids = sugestoes.map((s) => s.id);
      await insumosService.confirmarSugestoes(ids);
      await buscar();
      notificar('Pedido confirmado', 'Entrada registrada no estoque.');
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao confirmar.');
    } finally {
      setConfirmandoPedido(false);
    }
  };

  const ignorarPedido = async () => {
    if (sugestoes.length === 0) return;
    const ok = await confirmar(
      'Ignorar pedido',
      'Descartar as sugestões sem dar entrada?',
      'Ignorar',
    );
    if (!ok) return;
    try {
      const ids = sugestoes.map((s) => s.id);
      await insumosService.ignorarSugestoes(ids);
      await buscar();
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha.');
    }
  };

  // ==================== Gestão: entrada ====================

  const insumoEntradaObj = insumos.find((i) => i.id === insumoEntrada);

  const registrarEntrada = async () => {
    if (!insumoEntradaObj) {
      notificar('Selecione o insumo', 'Escolha o insumo que entrou.');
      return;
    }
    const embalagens = Number(qtdEntrada);
    if (!Number.isInteger(embalagens) || embalagens <= 0) {
      notificar('Quantidade inválida', 'Informe um número inteiro.');
      return;
    }
    const base = embalagens * insumoEntradaObj.fatorEmbalagem;
    setRegistrandoEntrada(true);
    try {
      await insumosService.registrarEntrada(
        insumoEntradaObj.id,
        base,
        'ENTRADA',
      );
      setQtdEntrada('');
      await buscar();
      notificar(
        'Entrada registrada',
        `+${embalagens} ${pluralEmbalagem(insumoEntradaObj.embalagem, embalagens)} no estoque.`,
      );
    } catch (e) {
      notificar('Erro', e instanceof ApiError ? e.message : 'Falha ao registrar entrada.');
    } finally {
      setRegistrandoEntrada(false);
    }
  };

  // ==================== Render ====================

  if (carregando) {
    return (
      <Tela>
        <Carregando />
      </Tela>
    );
  }

  return (
    <Tela aoAtualizar={() => void carregar(true)} atualizando={atualizando}>
      {erro && <MensagemErro mensagem={erro} aoTentarNovamente={() => void carregar()} />}

      {/* ===== PEDIDO DA SEMANA (sugestões pendentes) ===== */}
      {sugestoes.length > 0 && (
        <Cartao style={styles.cardPedido}>
          <View style={styles.pedidoTopo}>
            <Ionicons name="clipboard-outline" size={22} color={cores.primaria} />
            <View style={styles.flex1}>
              <Text style={styles.pedidoTitulo}>Pedido da semana</Text>
              <Text style={styles.pedidoSub}>Gerado automaticamente</Text>
            </View>
          </View>

          {sugestoes.map((s) => (
            <View key={s.id} style={styles.pedidoItem}>
              <Ionicons name="checkmark-circle" size={18} color={cores.verde} />
              <Text style={styles.pedidoItemTexto}>
                {s.quantidade} {s.quantidade === 1 ? s.embalagem : `${s.embalagem}s`} de {s.insumoNome}
              </Text>
            </View>
          ))}

          {proximoSacolas !== null && proximoSacolas > 0 && (
            <View style={styles.pedidoQuinzenal}>
              <Ionicons name="time-outline" size={14} color={cores.textoSecundario} />
              <Text style={styles.pedidoQuinzenalTexto}>
                Sacolas (quinzenal): próximo pedido em {proximoSacolas} dia{proximoSacolas !== 1 ? 's' : ''}
              </Text>
            </View>
          )}

          <View style={styles.pedidoBotoes}>
            <Pressable
              onPress={() => void ignorarPedido()}
              style={styles.pedidoBtnIgnorar}
            >
              <Text style={styles.pedidoBtnIgnorarTexto}>Ignorar</Text>
            </Pressable>
            <Pressable
              onPress={() => void confirmarPedido()}
              disabled={confirmandoPedido}
              style={styles.pedidoBtnConfirmar}
            >
              <Ionicons name="checkmark" size={18} color={cores.textoInverso} />
              <Text style={styles.pedidoBtnConfirmarTexto}>
                {confirmandoPedido ? 'Confirmando...' : 'Confirmar pedido'}
              </Text>
            </Pressable>
          </View>
        </Cartao>
      )}

      {/* ===== ZONA 1: PAINEL VISUAL ===== */}
      <Text style={styles.secaoTitulo}>Estoque</Text>

      {insumos.length === 0 ? (
        <EstadoVazio
          icone="cube-outline"
          titulo="Nenhum insumo"
          descricao="Os insumos do setor aparecerão aqui."
        />
      ) : (
        insumos.map((i) => (
          <Pressable
            key={i.id}
            onPress={() => navigation.navigate('InsumoDetalhe', { insumoId: i.id, nome: i.nome })}
          >
            <Cartao style={styles.cardInsumo}>
              {/* Borda lateral colorida pelo nível */}
              <View style={[styles.bordaNivel, { backgroundColor: corNivel(i.nivel) }]} />

              {/* Cabeçalho: nome + badge nível */}
              <View style={styles.cardTopo}>
                <View style={[styles.iconeNivel, { backgroundColor: fundoNivel(i.nivel) }]}>
                  <Ionicons name={iconeCategoria(i.categoria)} size={20} color={corNivel(i.nivel)} />
                </View>
                <View style={styles.cardNomeArea}>
                  <Text style={styles.cardNome}>{capitalizar(i.nome)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name={iconeNivel(i.nivel)} size={12} color={corNivel(i.nivel)} />
                    <Text style={[styles.cardNivel, { color: corNivel(i.nivel) }]}>
                      {rotuloNivel(i.nivel)}
                    </Text>
                  </View>
                </View>
                <View style={[styles.badgeNivel, { backgroundColor: fundoNivel(i.nivel) }]}>
                  <Text style={[styles.badgeNivelTexto, { color: corNivel(i.nivel) }]}>
                    {formatarNumero(Math.round(i.saldo / i.fatorEmbalagem))} {pluralEmbalagem(i.embalagem, Math.round(i.saldo / i.fatorEmbalagem))}
                  </Text>
                </View>
              </View>

              {/* Métricas proativas */}
              <View style={styles.metricas}>
                <View style={styles.metrica}>
                  <Text style={styles.metricaValor}>
                    {i.diasAteRuptura != null ? `${i.diasAteRuptura}d` : '—'}
                  </Text>
                  <Text style={styles.metricaRotulo}>até acabar</Text>
                </View>
                <View style={styles.metrica}>
                  <Text style={styles.metricaValor}>
                    {formatarNumero(Math.round(i.consumoSemana / i.fatorEmbalagem))}
                  </Text>
                  <Text style={styles.metricaRotulo}>consumo/sem</Text>
                </View>
                <View style={styles.metrica}>
                  <Text style={styles.metricaValor}>
                    {formatarNumero(Math.round(i.entradaSemana / i.fatorEmbalagem))}
                  </Text>
                  <Text style={styles.metricaRotulo}>entrada/sem</Text>
                </View>
              </View>

              {/* Sugestão de reposição (se necessário) */}
              {i.sugestaoReposicao > 0 && (
                <View style={styles.sugestao}>
                  <Ionicons name="bulb-outline" size={14} color={cores.primaria} />
                  <Text style={styles.sugestaoTexto}>
                    Sugestão: repor {i.sugestaoReposicao} {pluralEmbalagem(i.embalagem, i.sugestaoReposicao)}
                  </Text>
                </View>
              )}
            </Cartao>
          </Pressable>
        ))
      )}

      {/* ===== ZONA 2: AÇÕES RÁPIDAS ===== */}
      {insumos.length > 0 && (
        <>
          <Text style={styles.secaoTitulo}>Ações rápidas</Text>
          <Text style={styles.secaoSubtitulo}>
            Registrar saída (escolha a quantidade)
          </Text>

          <View style={styles.acoesGrid}>
            {insumos.map((i) => {
              // Sem saldo para nem 1 embalagem: botão desabilitado e apagado.
              const semSaldo = i.saldo < i.fatorEmbalagem;
              return (
                <Pressable
                  key={i.id}
                  onPress={() => abrirSaida(i)}
                  disabled={semSaldo}
                  style={[styles.acaoBtn, semSaldo && styles.acaoBtnLoading]}
                >
                  <Ionicons
                    name={
                      i.categoria === 'SACOLA'
                        ? 'bag-outline'
                        : i.categoria === 'BOBINA'
                          ? 'receipt-outline'
                          : i.categoria === 'ALCOOL'
                            ? 'flask-outline'
                            : 'cube-outline'
                    }
                    size={28}
                    color={semSaldo ? cores.textoSecundario : cores.primaria}
                  />
                  <Text style={[styles.acaoBtnTexto, semSaldo && { color: cores.textoSecundario }]}>
                    {capitalizar(i.nome)}
                  </Text>
                  <Text style={styles.acaoBtnSub}>
                    {semSaldo ? 'Sem estoque' : capitalizar(i.embalagem)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* ===== ZONA 3: GESTÃO ===== */}
      <Text style={styles.secaoTitulo}>Gestão</Text>

      {/* Link para requisições */}
      <Pressable onPress={() => navigation.navigate('Requisicoes')}>
        <Cartao>
          <View style={styles.linkRow}>
            <Ionicons name="file-tray-full-outline" size={22} color={cores.primaria} />
            <View style={styles.flex1}>
              <Text style={styles.linkTitulo}>Requisições</Text>
              <Text style={styles.linkSub}>Solicitar e aprovar pedidos</Text>
            </View>
            {pendentes > 0 && (
              <View style={styles.badgePendentes}>
                <Text style={styles.badgePendentesTexto}>{pendentes}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={cores.textoSecundario} />
          </View>
        </Cartao>
      </Pressable>

      {/* Registrar entrada (gestores) */}
      {podeGerenciar && (
        <Cartao>
          <Pressable
            onPress={() => setEntradaAberta(!entradaAberta)}
            style={styles.linkRow}
          >
            <Ionicons name="add-circle-outline" size={22} color={cores.verde} />
            <View style={styles.flex1}>
              <Text style={styles.linkTitulo}>Registrar entrada</Text>
              <Text style={styles.linkSub}>Mercadoria recebida do depósito</Text>
            </View>
            <Ionicons
              name={entradaAberta ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={cores.textoSecundario}
            />
          </Pressable>

          {entradaAberta && (
            <View style={styles.formEntrada}>
              <Text style={styles.rotulo}>Insumo</Text>
              <View style={styles.chips}>
                {insumos.map((i) => {
                  const ativo = i.id === insumoEntrada;
                  return (
                    <Pressable
                      key={i.id}
                      onPress={() => setInsumoEntrada(i.id)}
                      style={[styles.chip, ativo && styles.chipAtivo]}
                    >
                      <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>
                        {i.nome}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <CampoTexto
                rotulo={
                  insumoEntradaObj
                    ? `Quantidade (em ${pluralEmbalagem(insumoEntradaObj.embalagem, 2)})`
                    : 'Quantidade (em embalagens)'
                }
                keyboardType="number-pad"
                value={qtdEntrada}
                onChangeText={setQtdEntrada}
                placeholder="0"
              />
              <Botao
                titulo="Registrar entrada"
                aoPressionar={registrarEntrada}
                carregando={registrandoEntrada}
              />
            </View>
          )}
        </Cartao>
      )}

      {/* ===== Card flutuante: registrar saída com quantidade ajustável ===== */}
      <Modal
        visible={saidaInsumo !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSaidaInsumo(null)}
      >
        <Pressable style={styles.saidaFundo} onPress={() => setSaidaInsumo(null)}>
          <Pressable style={styles.saidaCartao} onPress={() => {}}>
            <View style={styles.saidaCabecalho}>
              <Text style={styles.saidaTitulo} numberOfLines={1}>
                {saidaInsumo ? capitalizar(saidaInsumo.nome) : ''}
              </Text>
              <Pressable
                onPress={() => setSaidaInsumo(null)}
                hitSlop={10}
                accessibilityLabel="Fechar"
              >
                <Ionicons name="close" size={24} color={cores.texto} />
              </Pressable>
            </View>
            {saidaInsumo ? (
              <Text style={styles.saidaSub}>
                Quantas {pluralEmbalagem(saidaInsumo.embalagem, 2)} saíram?
              </Text>
            ) : null}

            <View style={styles.stepper}>
              <Pressable
                onPress={() => ajustarSaida(-1)}
                disabled={qtdSaida <= 1}
                style={[styles.stepBtn, qtdSaida <= 1 && styles.stepBtnInativo]}
                hitSlop={8}
                accessibilityLabel="Diminuir"
              >
                <Ionicons name="remove" size={24} color={cores.primaria} />
              </Pressable>
              <View style={styles.stepValorBox}>
                <Text style={styles.stepValor}>{qtdSaida}</Text>
                <Text style={styles.stepValorSub}>
                  {saidaInsumo ? pluralEmbalagem(saidaInsumo.embalagem, qtdSaida) : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => ajustarSaida(1)}
                disabled={qtdSaida >= maxSaida}
                style={[styles.stepBtn, qtdSaida >= maxSaida && styles.stepBtnInativo]}
                hitSlop={8}
                accessibilityLabel="Aumentar"
              >
                <Ionicons name="add" size={24} color={cores.primaria} />
              </Pressable>
            </View>

            <Text style={styles.saidaMax}>Disponível: {maxSaida} no estoque</Text>

            <Botao
              titulo={`Registrar saída de ${qtdSaida}`}
              aoPressionar={() => void confirmarSaida()}
              carregando={consumindo !== null}
            />
            <Botao
              titulo="Cancelar"
              variante="texto"
              aoPressionar={() => setSaidaInsumo(null)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Tela>
  );
}

// ==================== Styles ====================

const styles = StyleSheet.create({
  secaoTitulo: {
    ...tipografia.secao,
    color: cores.texto,
    marginTop: espacamento.lg,
    marginBottom: espacamento.xs,
  },
  secaoSubtitulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginBottom: espacamento.sm,
  },
  cardInsumo: {
    overflow: 'hidden',
    position: 'relative',
  },
  bordaNivel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: raio.lg,
    borderBottomLeftRadius: raio.lg,
  },
  cardTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  iconeNivel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardNomeArea: {
    flex: 1,
  },
  cardNome: {
    ...tipografia.rotulo,
    color: cores.texto,
  },
  cardNivel: {
    ...tipografia.legenda,
    fontWeight: '700',
    marginTop: 1,
  },
  badgeNivel: {
    paddingHorizontal: espacamento.sm,
    paddingVertical: 4,
    borderRadius: raio.pill,
  },
  badgeNivelTexto: {
    ...tipografia.legenda,
    fontWeight: '700',
  },
  metricas: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.md,
  },
  metrica: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: cores.fundo,
    borderRadius: raio.md,
    paddingVertical: espacamento.sm,
  },
  metricaValor: {
    ...tipografia.rotulo,
    color: cores.texto,
    fontWeight: '700',
  },
  metricaRotulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 2,
  },
  sugestao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
  },
  sugestaoTexto: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '600',
  },
  acoesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.sm,
  },
  acaoBtn: {
    // Largura por coluna via flexBasis percentual (2 por linha), em vez de
    // `flex: 1`. Com `flex: 1` (flexBasis 0%) dentro de um container com
    // `flexWrap`, o Yoga calcula a altura da grade só como 1 linha — o que fazia
    // a seção seguinte ("Gestão") se sobrepor às ações rápidas quando havia mais
    // de 2 insumos. Um flexBasis percentual definido corrige o cálculo de altura.
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    paddingVertical: espacamento.lg,
    paddingHorizontal: espacamento.md,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  acaoBtnLoading: {
    opacity: 0.5,
  },
  acaoBtnTexto: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontWeight: '700',
  },
  acaoBtnSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  flex1: {
    flex: 1,
  },
  linkTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
  },
  linkSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  badgePendentes: {
    backgroundColor: cores.primaria,
    borderRadius: raio.pill,
    paddingHorizontal: espacamento.sm,
    paddingVertical: 2,
    marginRight: espacamento.xs,
  },
  badgePendentesTexto: {
    color: cores.textoInverso,
    fontSize: 11,
    fontWeight: '700',
  },
  formEntrada: {
    marginTop: espacamento.md,
    paddingTop: espacamento.md,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
    marginBottom: espacamento.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espacamento.sm,
    marginBottom: espacamento.md,
  },
  chip: {
    paddingHorizontal: espacamento.lg,
    paddingVertical: espacamento.md,
    backgroundColor: cores.fundo,
    borderRadius: raio.pill,
    borderWidth: 1,
    borderColor: cores.borda,
    minHeight: 40,
  },
  chipAtivo: {
    backgroundColor: cores.primaria,
    borderColor: cores.primaria,
  },
  chipTexto: {
    ...tipografia.legenda,
    color: cores.texto,
    fontWeight: '600',
  },
  chipTextoAtivo: {
    color: cores.textoInverso,
  },
  cardPedido: {
    borderWidth: 1,
    borderColor: cores.primaria,
    borderStyle: 'dashed',
  },
  pedidoTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    marginBottom: espacamento.md,
  },
  pedidoTitulo: {
    ...tipografia.rotulo,
    color: cores.texto,
  },
  pedidoSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  pedidoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
    paddingVertical: espacamento.xs,
  },
  pedidoItemTexto: {
    ...tipografia.corpo,
    color: cores.texto,
  },
  pedidoQuinzenal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.xs,
    marginTop: espacamento.sm,
    paddingTop: espacamento.sm,
    borderTopWidth: 1,
    borderTopColor: cores.divisor,
  },
  pedidoQuinzenalTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  pedidoBotoes: {
    flexDirection: 'row',
    gap: espacamento.sm,
    marginTop: espacamento.lg,
  },
  pedidoBtnIgnorar: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: espacamento.md,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  pedidoBtnIgnorarTexto: {
    ...tipografia.rotulo,
    color: cores.textoSecundario,
  },
  pedidoBtnConfirmar: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.xs,
    paddingVertical: espacamento.md,
    borderRadius: raio.md,
    backgroundColor: cores.primaria,
  },
  pedidoBtnConfirmarTexto: {
    ...tipografia.rotulo,
    color: cores.textoInverso,
  },
  // Card flutuante de saída
  saidaFundo: {
    flex: 1,
    backgroundColor: 'rgba(10,37,64,0.45)',
    justifyContent: 'center',
    padding: espacamento.lg,
  },
  saidaCartao: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: espacamento.lg,
    ...sombra.flutuante,
  },
  saidaCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacamento.md,
  },
  saidaTitulo: { ...tipografia.subtitulo, color: cores.texto, flex: 1 },
  saidaSub: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: espacamento.xs,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacamento.lg,
    marginVertical: espacamento.md,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: raio.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cores.primariaClara,
  },
  stepBtnInativo: { opacity: 0.4 },
  stepValorBox: { alignItems: 'center', minWidth: 90 },
  stepValor: {
    ...tipografia.titulo,
    fontSize: 36,
    color: cores.primaria,
  },
  stepValorSub: { ...tipografia.legenda, color: cores.textoSecundario },
  saidaMax: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginBottom: espacamento.sm,
  },
});

export default InsumosScreen;
