/**
 * Tela de Login (Req 7.1) — identidade SaaS "Check-out Pro · Gestão Inteligente".
 *
 * Visual alinhado ao resto do app: fundo em degradê azul, cartão branco premium
 * (Inter + ícones Lucide), com:
 *  - Boas-vindas personalizadas quando lembra o último usuário (avatar com a
 *    inicial, saudação por horário e foco direto na senha).
 *  - Mensagens de erro inteligentes (credenciais vs. conexão).
 *
 * Autentica pelo login individual e senha. As credenciais inválidas mostram
 * "Usuário ou senha incorretos." (sem revelar qual dos dois).
 */
import {
  ArrowRight,
  Eye,
  EyeOff,
  Fingerprint,
  Lock,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  User,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  ativarBiometria,
  autenticarComBiometria,
  biometriaSuportada,
  limparBiometria,
  loginBiometrico,
} from '../auth/biometria';
import { cores, gradientes, raio, sombra, tipografia } from '../theme';

const CHAVE_LOGIN_SALVO = 'checkoutpro:login-lembrado';

// Remove o contorno de foco que o navegador adiciona aos inputs na web.
const SEM_CONTORNO_WEB =
  Platform.OS === 'web'
    ? ({ outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle)
    : undefined;

/** Saudação conforme o horário do dispositivo. */
function saudacaoPorHora(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Deriva um nome legível a partir do login (ex.: "pedro.silva" -> "Pedro"). */
function primeiroNomeDoLogin(login: string): string {
  const partes = login
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  return partes[0] ?? login;
}

export function LoginScreen(): React.ReactElement {
  const { entrar, entrarComToken } = useAuth();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [lembrado, setLembrado] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [bioLogin, setBioLogin] = useState<string | null>(null);
  const [bioEnviando, setBioEnviando] = useState(false);
  const senhaRef = useRef<TextInput>(null);

  const versao = Constants.expoConfig?.version ?? '1.0.0';

  // Lembra o último usuário: pré-preenche e foca direto na senha.
  useEffect(() => {
    void (async () => {
      try {
        const salvo = await AsyncStorage.getItem(CHAVE_LOGIN_SALVO);
        if (salvo) {
          setLogin(salvo);
          setLembrado(true);
          setTimeout(() => senhaRef.current?.focus(), 350);
        }
      } catch {
        // ignora
      }
    })();
  }, []);

  // Verifica se há atalho de login biométrico disponível neste aparelho.
  useEffect(() => {
    void (async () => {
      if (await biometriaSuportada()) {
        setBioLogin(await loginBiometrico());
      }
    })();
  }, []);

  const aoEntrarBiometria = async () => {
    setErro(null);
    setAviso(null);
    setBioEnviando(true);
    try {
      const token = await autenticarComBiometria();
      if (!token) {
        return; // usuário cancelou
      }
      await entrarComToken(token);
    } catch {
      // Token expirado/inválido: limpa o atalho e pede a senha.
      await limparBiometria();
      setBioLogin(null);
      setErro('Sua sessão expirou. Entre com a senha.');
    } finally {
      setBioEnviando(false);
    }
  };

  const trocarUsuario = () => {
    setLembrado(false);
    setLogin('');
    setSenha('');
    setErro(null);
    setBioLogin(null);
    void AsyncStorage.removeItem(CHAVE_LOGIN_SALVO);
    void limparBiometria();
  };

  const aoEntrar = async () => {
    setErro(null);
    setAviso(null);
    if (!login.trim() || !senha) {
      setErro('Informe o usuário e a senha.');
      return;
    }
    setEnviando(true);
    try {
      try {
        await AsyncStorage.setItem(CHAVE_LOGIN_SALVO, login.trim());
      } catch {
        // ignora
      }
      await entrar(login.trim(), senha);
      // Ativa o atalho biométrico para o próximo acesso (defensivo/silencioso).
      void ativarBiometria(login.trim());
    } catch (e) {
      if (e instanceof ApiError) {
        setErro(
          e.naoAutorizado
            ? 'Usuário ou senha incorretos.'
            : e.message || 'Não foi possível entrar. Tente novamente.',
        );
      } else {
        setErro('Não foi possível conectar. Verifique sua internet e tente novamente.');
      }
    } finally {
      setEnviando(false);
    }
  };

  const esqueciSenha = () => {
    setErro(null);
    setAviso(
      'Para redefinir sua senha, fale com o gerente ou administrador do sistema.',
    );
  };

  const nome = lembrado ? primeiroNomeDoLogin(login) : '';

  return (
    <LinearGradient
      colors={gradientes.header}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fundo}
    >
      <StatusBar style="light" />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Marca */}
            <View style={styles.marcaBox}>
              <View style={styles.marcaIcone}>
                <ShoppingCart size={26} color={cores.textoInverso} />
              </View>
              <Text style={styles.marca}>Check-out Pro</Text>
              <Text style={styles.marcaTag}>Gestão Inteligente</Text>
            </View>

            {/* Cartão de acesso */}
            <View style={styles.card}>
              {lembrado ? (
                <View style={styles.boasVindasRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTexto}>
                      {(nome.charAt(0) || 'U').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.boasVindasInfo}>
                    <Text style={styles.boasVindasMini}>{saudacaoPorHora()},</Text>
                    <Text style={styles.boasVindasNome} numberOfLines={1}>
                      {nome}
                    </Text>
                  </View>
                  <Pressable onPress={trocarUsuario} hitSlop={8}>
                    <Text style={styles.trocar}>Trocar</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.titulo}>Bem-vindo!</Text>
                  <Text style={styles.subtitulo}>Acesse sua conta para continuar.</Text>
                </>
              )}

              {/* Usuário */}
              {!lembrado && (
                <View style={styles.campo}>
                  <View style={styles.campoIcone}>
                    <User size={20} color={cores.primaria} />
                  </View>
                  <View style={styles.campoCorpo}>
                    <Text style={styles.campoRotulo}>Usuário</Text>
                    <TextInput
                      style={[styles.input, SEM_CONTORNO_WEB]}
                      placeholder="Seu acesso"
                      placeholderTextColor={cores.textoSecundario}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      value={login}
                      onChangeText={setLogin}
                      onSubmitEditing={() => senhaRef.current?.focus()}
                      returnKeyType="next"
                    />
                  </View>
                </View>
              )}

              {/* Senha */}
              <View style={styles.campo}>
                <View style={styles.campoIcone}>
                  <Lock size={20} color={cores.primaria} />
                </View>
                <View style={styles.campoCorpo}>
                  <Text style={styles.campoRotulo}>Senha</Text>
                  <TextInput
                    ref={senhaRef}
                    style={[styles.input, SEM_CONTORNO_WEB]}
                    placeholder="Sua senha"
                    placeholderTextColor={cores.textoSecundario}
                    secureTextEntry={!mostrarSenha}
                    autoComplete="password"
                    value={senha}
                    onChangeText={setSenha}
                    onSubmitEditing={() => void aoEntrar()}
                    returnKeyType="go"
                  />
                </View>
                <Pressable
                  onPress={() => setMostrarSenha((v) => !v)}
                  hitSlop={10}
                  style={styles.olho}
                  accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {mostrarSenha ? (
                    <EyeOff size={22} color={cores.textoSecundario} />
                  ) : (
                    <Eye size={22} color={cores.textoSecundario} />
                  )}
                </Pressable>
              </View>

              {erro ? <Text style={styles.erro}>{erro}</Text> : null}
              {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}

              <Pressable onPress={esqueciSenha} hitSlop={6} style={styles.esqueciBox}>
                <Text style={styles.esqueci}>Esqueci minha senha</Text>
              </Pressable>

              <Pressable
                onPress={() => void aoEntrar()}
                disabled={enviando}
                style={({ pressed }) => [pressed && styles.botaoPressed]}
              >
                <LinearGradient
                  colors={gradientes.header}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.botao}
                >
                  {enviando ? (
                    <ActivityIndicator color={cores.textoInverso} />
                  ) : (
                    <>
                      <Text style={styles.botaoTexto}>Entrar</Text>
                      <ArrowRight size={20} color={cores.textoInverso} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              {bioLogin ? (
                <Pressable
                  onPress={() => void aoEntrarBiometria()}
                  disabled={bioEnviando}
                  style={({ pressed }) => [
                    styles.botaoBio,
                    pressed && styles.botaoPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Entrar com biometria"
                >
                  {bioEnviando ? (
                    <ActivityIndicator color={cores.primaria} />
                  ) : (
                    <>
                      <Fingerprint size={20} color={cores.primaria} />
                      <Text style={styles.botaoBioTexto}>Entrar com biometria</Text>
                    </>
                  )}
                </Pressable>
              ) : null}

              <View style={styles.seguro}>
                <View style={styles.seguroLinha} />
                <ShieldCheck size={15} color={cores.textoSecundario} />
                <Text style={styles.seguroTexto}>Acesso seguro e exclusivo</Text>
                <View style={styles.seguroLinha} />
              </View>
            </View>

            {/* Rodapé */}
            <View style={styles.rodape}>
              <View style={styles.cluby}>
                <Sparkles size={13} color="rgba(255,255,255,0.85)" />
                <Text style={styles.clubyTexto}>Potenciado pela Cluby</Text>
              </View>
              <Text style={styles.creditos}>
                Check-out Pro · Versão {versao} · 2026
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 24,
  },

  // Marca
  marcaBox: { alignItems: 'center', marginBottom: 22 },
  marcaIcone: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  marca: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 26,
    fontWeight: '800',
    color: cores.textoInverso,
    letterSpacing: -0.4,
  },
  marcaTag: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
    marginTop: 2,
  },

  // Cartão
  card: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: 22,
    ...sombra.cartao,
    shadowOpacity: 0.18,
  },
  titulo: {
    ...tipografia.titulo,
    fontSize: 24,
    color: cores.texto,
  },
  subtitulo: {
    ...tipografia.corpo,
    color: cores.textoSecundario,
    marginTop: 2,
    marginBottom: 18,
  },
  boasVindasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 20,
    fontWeight: '800',
    color: cores.primaria,
  },
  boasVindasInfo: { flex: 1 },
  boasVindasMini: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },
  boasVindasNome: {
    ...tipografia.subtitulo,
    color: cores.texto,
  },
  trocar: {
    ...tipografia.rotulo,
    color: cores.primaria,
    fontWeight: '700',
  },

  // Campos
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.superficieAlternativa,
    borderRadius: raio.md,
    borderWidth: 1,
    borderColor: cores.divisor,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  campoIcone: {
    width: 40,
    height: 40,
    borderRadius: raio.md,
    backgroundColor: cores.primariaClara,
    alignItems: 'center',
    justifyContent: 'center',
  },
  campoCorpo: { flex: 1, marginLeft: 10 },
  campoRotulo: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    fontWeight: '600',
    color: cores.textoSecundario,
  },
  input: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: cores.texto,
    paddingVertical: Platform.OS === 'web' ? 6 : 2,
  },
  olho: { padding: 6 },
  erro: { ...tipografia.legenda, color: cores.vermelho, marginLeft: 4 },
  aviso: { ...tipografia.legenda, color: cores.amarelo, marginLeft: 4 },
  esqueciBox: { alignSelf: 'flex-end', marginVertical: 8 },
  esqueci: {
    ...tipografia.legenda,
    color: cores.primaria,
    fontWeight: '700',
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: raio.md,
    gap: 8,
    marginTop: 2,
  },
  botaoPressed: { opacity: 0.9 },
  botaoBio: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: raio.md,
    borderWidth: 1.5,
    borderColor: cores.primaria,
    backgroundColor: cores.primariaClara,
    marginTop: 10,
  },
  botaoBioTexto: {
    fontFamily: 'Inter_700Bold',
    color: cores.primaria,
    fontSize: 15,
    fontWeight: '700',
  },
  botaoTexto: {
    fontFamily: 'Inter_800ExtraBold',
    color: cores.textoInverso,
    fontSize: 17,
    fontWeight: '800',
  },
  seguro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  seguroLinha: { flex: 1, height: 1, backgroundColor: cores.divisor },
  seguroTexto: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
  },

  // Rodapé
  rodape: { alignItems: 'center', marginTop: 22, gap: 6 },
  cluby: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clubyTexto: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  creditos: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
});

export default LoginScreen;
