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
import { confirmar } from '../utils/dialogos';
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
  const scrollRef = useRef<ScrollView>(null);

  const rolarParaFim = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

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
  }, [aberto, rolarParaFim]);

  const enviar = async () => {
    const texto = entrada.trim();
    if (!texto || enviando) {
      return;
    }
    setEntrada('');
    const pergunta: MensagemAssistente = {
      id: idLocal(),
      papel: 'user',
      conteudo: texto,
      criadaEm: new Date().toISOString(),
    };
    setMensagens((m) => [...m, pergunta]);
    rolarParaFim();
    setEnviando(true);
    try {
      const resposta = await assistenteService.enviar(texto);
      setMensagens((m) => [...m, resposta]);
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
        <Ionicons name="sparkles" size={26} color={cores.textoInverso} />
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
                <Ionicons name="sparkles" size={18} color={cores.primaria} />
                <Text style={styles.titulo}>Assistente Check-out PRO</Text>
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
                  <Ionicons name="chatbubble-ellipses-outline" size={40} color={cores.primaria} />
                  <Text style={styles.vazioTitulo}>Como posso ajudar?</Text>
                  <Text style={styles.vazioTexto}>
                    Pergunte sobre rotinas de frente de caixa, fechamento, troco,
                    cancelamentos, direitos do consumidor e mais.
                  </Text>
                </View>
              ) : (
                mensagens.map((m) => (
                  <View
                    key={m.id}
                    style={[
                      styles.bolha,
                      m.papel === 'user' ? styles.bolhaUsuario : styles.bolhaIA,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bolhaTexto,
                        m.papel === 'user' && styles.bolhaTextoUsuario,
                      ]}
                    >
                      {m.conteudo}
                    </Text>
                  </View>
                ))
              )}
              {enviando && (
                <View style={[styles.bolha, styles.bolhaIA]}>
                  <ActivityIndicator color={cores.primaria} />
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
  bolhaUsuario: {
    alignSelf: 'flex-end',
    backgroundColor: cores.primaria,
    borderBottomRightRadius: raio.sm,
  },
  bolhaIA: {
    alignSelf: 'flex-start',
    backgroundColor: cores.superficie,
    borderBottomLeftRadius: raio.sm,
    borderWidth: 1,
    borderColor: cores.borda,
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
