/**
 * Assistente de IA flutuante (chat).
 *
 * Renderiza um botão flutuante (FAB) sempre visível no app autenticado. Ao
 * tocar, abre um chat em modal onde o usuário conversa com o "Assistente
 * Check-out PRO" (backend + Google Gemini).
 *
 * Características:
 * - Conversa isolada por usuário (o backend usa o login do token).
 * - Histórico recuperado das últimas 24h ao abrir (se fechar sem querer, a
 *   conversa continua).
 * - Botão "Limpar conversa".
 * - Funciona no app nativo e na web (usa Modal + KeyboardAvoidingView).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../api/client';
import { assistenteService } from '../api/services';
import { MensagemAssistente } from '../api/types';
import { useAssistente } from '../assistente/AssistenteContext';
import { confirmar } from '../utils/dialogos';
import { MarkdownTexto } from './MarkdownTexto';
import { ProcedimentoView } from './ProcedimentoView';
import { cores, espacamento, raio, sombra, tipografia } from '../theme';

let contadorLocal = 0;
function idLocal(): string {
  contadorLocal += 1;
  return `local-${Date.now()}-${contadorLocal}`;
}

export function AssistenteFlutuante(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [configurado, setConfigurado] = useState<boolean | null>(null);
  const [mensagens, setMensagens] = useState<MensagemAssistente[]>([]);
  const [entrada, setEntrada] = useState('');
  const [animando, setAnimando] = useState<{
    id: string;
    full: string;
    len: number;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pedido de "briefing" vindo de outra tela (ex.: botão no Resumo do Dia).
  const { pedido, limparPedido } = useAssistente();
  const perguntaPendenteRef = useRef<string | null>(null);

  const rolarParaFim = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  // Efeito "digitando em tempo real": revela a resposta da Cluby aos poucos.
  const animarResposta = useCallback(
    (msg: MensagemAssistente) => {
      if (animRef.current) {
        clearInterval(animRef.current);
      }
      const full = msg.conteudo;
      const passo = Math.max(2, Math.ceil(full.length / 160));
      setAnimando({ id: msg.id, full, len: 0 });
      animRef.current = setInterval(() => {
        setAnimando((a) => {
          if (!a) {
            return a;
          }
          const prox = a.len + passo;
          if (prox >= a.full.length) {
            if (animRef.current) {
              clearInterval(animRef.current);
              animRef.current = null;
            }
            return null;
          }
          return { ...a, len: prox };
        });
        rolarParaFim();
      }, 24);
    },
    [rolarParaFim],
  );

  // Limpa o timer de digitação ao desmontar.
  useEffect(() => {
    return () => {
      if (animRef.current) {
        clearInterval(animRef.current);
      }
    };
  }, []);

  /** Envia um texto qualquer à Cluby (usado pelo input e pelos briefings). */
  const enviarTexto = async (texto: string) => {
    const limpo = texto.trim();
    if (!limpo || enviando) {
      return;
    }
    const pergunta: MensagemAssistente = {
      id: idLocal(),
      papel: 'user',
      conteudo: limpo,
      criadaEm: new Date().toISOString(),
    };
    setMensagens((m) => [...m, pergunta]);
    rolarParaFim();
    setEnviando(true);
    try {
      const resposta = await assistenteService.enviar(limpo);
      setMensagens((m) => [...m, resposta]);
      // Procedimentos (passo a passo com fotos) aparecem na hora; o resto usa
      // o efeito de digitação.
      if (!resposta.procedimento) {
        animarResposta(resposta);
      }
    } catch (erro) {
      const mensagemErro =
        erro instanceof ApiError
          ? erro.message
          : 'Não consegui responder agora. Tente novamente em instantes.';
      setMensagens((m) => [
        ...m,
        {
          id: idLocal(),
          papel: 'model',
          conteudo: mensagemErro,
          criadaEm: new Date().toISOString(),
        },
      ]);
    } finally {
      setEnviando(false);
      rolarParaFim();
    }
  };

  const enviar = async () => {
    const texto = entrada.trim();
    if (!texto || enviando) {
      return;
    }
    setEntrada('');
    await enviarTexto(texto);
  };

  // Ao abrir: carrega status + conversa das últimas 24h.
  useEffect(() => {
    if (!aberto) {
      return;
    }
    let ativo = true;
    setCarregando(true);
    (async () => {
      try {
        const [status, conversa] = await Promise.all([
          assistenteService.status(),
          assistenteService.conversa(),
        ]);
        if (!ativo) {
          return;
        }
        setConfigurado(status.configurado);
        setMensagens(conversa);
        rolarParaFim();
        // Se veio um "briefing" pedido por outra tela, envia agora (depois de
        // carregar a conversa, para não sobrescrever a pergunta/resposta).
        const pendente = perguntaPendenteRef.current;
        if (pendente) {
          perguntaPendenteRef.current = null;
          void enviarTexto(pendente);
        }
      } catch {
        // Silencioso: o usuário pode tentar enviar mesmo assim.
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, rolarParaFim]);

  // Recebe pedidos de "briefing" de outras telas (Resumo do Dia).
  useEffect(() => {
    if (!pedido) {
      return;
    }
    if (aberto) {
      // Chat já aberto: envia direto.
      void enviarTexto(pedido.pergunta);
    } else {
      // Guarda a pergunta e abre; o efeito acima a envia após carregar.
      perguntaPendenteRef.current = pedido.pergunta;
      setAberto(true);
    }
    limparPedido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, aberto, limparPedido]);

  const limpar = async () => {
    const ok = await confirmar(
      'Limpar conversa',
      'Deseja apagar toda a conversa com o assistente?',
      'Limpar',
    );
    if (!ok) {
      return;
    }
    try {
      await assistenteService.limpar();
    } catch {
      // Ignora erro de limpeza no servidor; limpa localmente de qualquer forma.
    }
    setMensagens([]);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir assistente de IA"
        onPress={() => setAberto(true)}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + espacamento.lg },
          pressed && styles.fabPressionado,
        ]}
      >
        <Text style={styles.fabEmoji}>🤖</Text>
      </Pressable>

      <Modal
        visible={aberto}
        animationType="slide"
        transparent
        onRequestClose={() => setAberto(false)}
      >
        <View style={styles.fundoModal}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.painel, { paddingBottom: insets.bottom }]}
          >
            <View style={styles.cabecalho}>
              <View style={styles.cabecalhoTitulo}>
                <View style={styles.avatarCabecalho}>
                  <Text style={styles.avatarEmojiGrande}>🤖</Text>
                </View>
                <View>
                  <Text style={styles.titulo}>Cluby</Text>
                  <Text style={styles.subtitulo}>Sua super assistente do mercado</Text>
                </View>
              </View>
              <View style={styles.cabecalhoAcoes}>
                <Pressable
                  onPress={() => void limpar()}
                  hitSlop={10}
                  accessibilityLabel="Limpar conversa"
                >
                  <Ionicons name="trash-outline" size={20} color={cores.textoSecundario} />
                </Pressable>
                <Pressable
                  onPress={() => setAberto(false)}
                  hitSlop={10}
                  accessibilityLabel="Fechar"
                >
                  <Ionicons name="close" size={24} color={cores.texto} />
                </Pressable>
              </View>
            </View>

            {configurado === false && (
              <View style={styles.aviso}>
                <Text style={styles.avisoTexto}>
                  O assistente ainda está sendo configurado. Em breve ele
                  responderá às suas perguntas.
                </Text>
              </View>
            )}

            <ScrollView
              ref={scrollRef}
              style={styles.lista}
              contentContainerStyle={styles.listaConteudo}
              onContentSizeChange={rolarParaFim}
            >
              {carregando ? (
                <ActivityIndicator color={cores.primaria} style={{ marginTop: espacamento.xl }} />
              ) : mensagens.length === 0 ? (
                <View style={styles.vazio}>
                  <Text style={styles.vazioEmoji}>🤖</Text>
                  <Text style={styles.vazioTitulo}>Oi! Eu sou a Cluby</Text>
                  <Text style={styles.vazioTexto}>
                    Sua super assistente do mercado. Pergunte sobre caixa,
                    fechamento, estoque, validade, reposição, equipe, direitos do
                    consumidor e muito mais!
                  </Text>
                </View>
              ) : (
                mensagens.map((m) =>
                  m.papel === 'user' ? (
                    <View key={m.id} style={styles.linhaUsuario}>
                      <View style={[styles.bolha, styles.bolhaUsuario]}>
                        <Text
                          style={[styles.bolhaTexto, styles.bolhaTextoUsuario]}
                        >
                          {m.conteudo}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View key={m.id} style={styles.linhaIA}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarEmoji}>🤖</Text>
                      </View>
                      <View
                        style={[
                          styles.bolha,
                          styles.bolhaIA,
                          m.procedimento && styles.bolhaProc,
                        ]}
                      >
                        <MarkdownTexto
                          conteudo={
                            animando && animando.id === m.id
                              ? animando.full.slice(0, animando.len)
                              : m.conteudo
                          }
                        />
                        {m.procedimento && (
                          <ProcedimentoView
                            titulo={m.procedimento.titulo}
                            blocos={m.procedimento.blocos}
                          />
                        )}
                      </View>
                    </View>
                  ),
                )
              )}
              {enviando && !animando && (
                <View style={styles.linhaIA}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarEmoji}>🤖</Text>
                  </View>
                  <View style={[styles.bolha, styles.bolhaIA]}>
                    <Text style={styles.digitando}>Cluby está digitando…</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.barraEntrada}>
              <TextInput
                style={styles.input}
                placeholder="Escreva sua pergunta..."
                placeholderTextColor={cores.textoSecundario}
                value={entrada}
                onChangeText={setEntrada}
                multiline
                onSubmitEditing={() => void enviar()}
                editable={!enviando}
              />
              <Pressable
                onPress={() => void enviar()}
                disabled={enviando || entrada.trim().length === 0}
                style={({ pressed }) => [
                  styles.botaoEnviar,
                  (enviando || entrada.trim().length === 0) && styles.botaoEnviarInativo,
                  pressed && styles.fabPressionado,
                ]}
                accessibilityLabel="Enviar mensagem"
              >
                <Ionicons name="send" size={20} color={cores.textoInverso} />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: espacamento.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
    ...sombra.cartao,
    shadowOpacity: 0.25,
    elevation: 6,
  },
  fabPressionado: {
    opacity: 0.85,
  },
  fabEmoji: {
    fontSize: 28,
  },
  fundoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  painel: {
    backgroundColor: cores.fundo,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '88%',
    overflow: 'hidden',
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacamento.lg,
    paddingVertical: espacamento.md,
    backgroundColor: cores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: cores.borda,
  },
  cabecalhoTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.sm,
  },
  avatarCabecalho: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmojiGrande: {
    fontSize: 20,
  },
  subtitulo: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  cabecalhoAcoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacamento.lg,
  },
  titulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  aviso: {
    backgroundColor: cores.amareloFundo,
    paddingHorizontal: espacamento.lg,
    paddingVertical: espacamento.sm,
  },
  avisoTexto: {
    ...tipografia.legenda,
    color: cores.amarelo,
  },
  lista: {
    flex: 1,
  },
  listaConteudo: {
    padding: espacamento.lg,
    gap: espacamento.sm,
  },
  vazio: {
    alignItems: 'center',
    paddingHorizontal: espacamento.xl,
    paddingTop: espacamento.xxl,
    gap: espacamento.sm,
  },
  vazioEmoji: {
    fontSize: 44,
  },
  vazioTitulo: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  vazioTexto: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    textAlign: 'center',
  },
  bolha: {
    maxWidth: '85%',
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.sm,
    borderRadius: raio.lg,
  },
  linhaUsuario: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  linhaIA: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: espacamento.sm,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarEmoji: {
    fontSize: 16,
  },
  bolhaUsuario: {
    backgroundColor: cores.primaria,
    borderBottomRightRadius: raio.sm,
  },
  bolhaIA: {
    flexShrink: 1,
    backgroundColor: cores.superficie,
    borderBottomLeftRadius: raio.sm,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  bolhaProc: {
    maxWidth: '92%',
  },
  digitando: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    fontStyle: 'italic',
  },
  bolhaTexto: {
    ...tipografia.corpo,
    color: cores.texto,
  },
  bolhaTextoUsuario: {
    color: cores.textoInverso,
  },
  barraEntrada: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: espacamento.sm,
    paddingHorizontal: espacamento.md,
    paddingVertical: espacamento.sm,
    backgroundColor: cores.superficie,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    backgroundColor: cores.fundo,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.lg,
    paddingHorizontal: espacamento.md,
    paddingTop: espacamento.sm,
    paddingBottom: espacamento.sm,
    color: cores.texto,
    fontSize: 15,
  },
  botaoEnviar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoEnviarInativo: {
    opacity: 0.4,
  },
});

export default AssistenteFlutuante;
