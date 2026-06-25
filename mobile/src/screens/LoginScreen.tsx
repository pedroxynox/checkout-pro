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
  User,
  X,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
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
const CHAVE_NOME_SALVO = 'checkoutpro:nome-lembrado';

// Remove o contorno de foco que o navegador adiciona aos inputs na web.
const SEM_CONTORNO_WEB =
  Platform.OS === 'web'
    ? ({ outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle)
    : undefined;

// Altura da faixa azul do topo (metade azul / metade branca, com onda suave).
// Responsiva: ~46% da tela, com limites — equilibra melhor azul x branco e
// acomoda o logo maior, mantendo um visual profissional.
const ALTURA_TELA = Dimensions.get('window').height;
const ALTURA_TOPO = Math.min(Math.max(Math.round(ALTURA_TELA * 0.4), 350), 450);
const ALTURA_ONDA = 42;

/**
 * Estrela do Gemini (logo de 4 pontas em "sparkle") desenhada em SVG, com o
 * degradê característico (azul → roxo → coral). Usada no rodapé "Potenciado
 * pela Cluby" (a Cluby é movida pelo Gemini).
 */
function EstrelaGemini({ size = 14 }: { size?: number }): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Gemini">
      <Defs>
        <SvgLinearGradient
          id="gemini"
          x1="0"
          y1="0"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor="#4796E3" />
          <Stop offset="0.5" stopColor="#9177C7" />
          <Stop offset="1" stopColor="#D96570" />
        </SvgLinearGradient>
      </Defs>
      <Path
        d="M12 0 C 12 6.6 17.4 12 24 12 C 17.4 12 12 17.4 12 24 C 12 17.4 6.6 12 0 12 C 6.6 12 12 6.6 12 0 Z"
        fill="url(#gemini)"
      />
    </Svg>
  );
}

/** Saudação conforme o horário do dispositivo. */
function saudacaoPorHora(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Primeiro nome a partir do nome completo (ex.: "João Pedro Silva" -> "João"). */
function primeiroNome(nomeCompleto: string): string {
  const p = nomeCompleto.trim().split(/\s+/)[0] ?? '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
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
  const [nomeSalvo, setNomeSalvo] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [bioLogin, setBioLogin] = useState<string | null>(null);
  const [bioEnviando, setBioEnviando] = useState(false);
  const senhaRef = useRef<TextInput>(null);

  const insets = useSafeAreaInsets();

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
          try {
            const n = await AsyncStorage.getItem(CHAVE_NOME_SALVO);
            if (n) setNomeSalvo(n);
          } catch {
            // ignora — saudação cai para o login se não houver nome salvo.
          }
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
    setNomeSalvo(null);
    void AsyncStorage.removeItem(CHAVE_LOGIN_SALVO);
    void AsyncStorage.removeItem(CHAVE_NOME_SALVO);
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

  const nome = lembrado
    ? nomeSalvo
      ? primeiroNome(nomeSalvo)
      : primeiroNomeDoLogin(login)
    : '';

  return (
    <View style={styles.fundo}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Topo azul com onda suave (metade azul / metade branca) */}
          <View style={[styles.topoWrap, { paddingTop: insets.top + 10 }]}>
            <LinearGradient
              colors={gradientes.header}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Formas decorativas suaves (apenas estética) */}
            <View pointerEvents="none" style={styles.blobTopo} />
            <View pointerEvents="none" style={styles.blobLado} />

            {/* Conteúdo sobre o azul */}
            <View style={styles.topoConteudo}>
              <View style={styles.marcaRow}>
                <Image
                  source={require('../../assets/Logo.png')}
                  style={styles.logo}
                  resizeMode="contain"
                  accessibilityLabel="Check-out Pro"
                />
              </View>

              <View style={styles.intro}>
                <Text style={styles.introTitulo}>Bem-vindo!</Text>
                <Text style={styles.introSub}>Acesse sua conta para continuar.</Text>
              </View>
            </View>

            {/* Onda que recorta o azul deixando o fundo branco abaixo */}
            <Svg
              style={styles.onda}
              width="100%"
              height={ALTURA_ONDA}
              viewBox="0 0 1440 80"
              preserveAspectRatio="none"
            >
              <Path
                d="M0,30 C 360,72 1080,72 1440,30 L1440,80 L0,80 Z"
                fill={cores.fundo}
              />
            </Svg>
          </View>

          {/* Corpo branco com o cartão de acesso */}
          <View style={styles.corpo}>
            <View style={styles.card}>
              {lembrado ? (
                <View style={styles.boasVindasRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTexto}>
                      {(nome.charAt(0) || 'U').toUpperCase()}
                    </Text>
                    <View style={styles.avatarStatus} />
                  </View>
                  <View style={styles.boasVindasInfo}>
                    <Text style={styles.boasVindasNome} numberOfLines={1}>
                      {saudacaoPorHora()}, {nome}!
                    </Text>
                    <Text style={styles.boasVindasMini}>
                      Digite sua senha para continuar.
                    </Text>
                  </View>
                  <Pressable onPress={trocarUsuario} hitSlop={8}>
                    <Text style={styles.trocar}>Trocar</Text>
                  </Pressable>
                </View>
              ) : null}

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
                  {login.length > 0 ? (
                    <Pressable
                      onPress={() => setLogin('')}
                      hitSlop={10}
                      style={styles.limpar}
                      accessibilityLabel="Limpar usuário"
                    >
                      <X size={18} color={cores.textoSecundario} />
                    </Pressable>
                  ) : null}
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
                <>
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
                  <Text style={styles.bioHint}>Disponível apenas no app</Text>
                </>
              ) : null}

              {/* Selo de segurança */}
              <View style={styles.seguroCard}>
                <View style={styles.seguroIcone}>
                  <ShieldCheck size={20} color={cores.primaria} />
                </View>
                <View style={styles.seguroInfo}>
                  <Text style={styles.seguroTitulo}>Acesso seguro e exclusivo</Text>
                  <Text style={styles.seguroDesc}>
                    Seus dados protegidos com criptografia e tecnologia avançada.
                  </Text>
                </View>
              </View>
            </View>

            {/* Rodapé */}
            <View style={[styles.rodape, { marginBottom: insets.bottom + 8 }]}>
              <View style={styles.cluby}>
                <EstrelaGemini size={15} />
                <Text style={styles.clubyTexto}>Potenciado pela Cluby</Text>
              </View>
              <Text style={styles.slogan}>A gestão na palma da sua mão</Text>
              <Text style={styles.creditos}>
                Check-out Pro · Versão {versao} · 2026
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: cores.fundo },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },

  // Faixa azul do topo + onda
  topoWrap: {
    height: ALTURA_TOPO,
    overflow: 'hidden',
  },
  topoConteudo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingBottom: 14,
  },
  onda: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
  },

  // Corpo branco (cartão + rodapé)
  corpo: {
    paddingHorizontal: 22,
    marginTop: -48,
  },

  // Marca — logo horizontal completo (já inclui o nome)
  marcaRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 360,
    height: 216,
  },

  // Saudação sobre o fundo
  intro: { alignItems: 'center', marginBottom: 10 },
  introTitulo: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 26,
    fontWeight: '800',
    color: cores.textoInverso,
    letterSpacing: -0.5,
  },
  introSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 4,
  },

  // Cartão
  card: {
    backgroundColor: cores.superficie,
    borderRadius: raio.lg,
    padding: 20,
    ...sombra.cartao,
    shadowOpacity: 0.18,
  },
  boasVindasRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 21,
    fontWeight: '800',
    color: cores.textoInverso,
  },
  avatarStatus: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: cores.verde,
    borderWidth: 2.5,
    borderColor: cores.superficie,
  },
  boasVindasInfo: { flex: 1 },
  boasVindasMini: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    marginTop: 1,
  },
  boasVindasNome: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
    fontWeight: '700',
    color: cores.texto,
    letterSpacing: -0.2,
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
    paddingVertical: 11,
    marginBottom: 14,
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
  limpar: { padding: 6 },
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
  bioHint: {
    ...tipografia.legenda,
    color: cores.textoSecundario,
    textAlign: 'center',
    marginTop: 8,
  },
  // Selo de segurança (card)
  seguroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: cores.primariaClara,
    borderRadius: raio.md,
    padding: 13,
    marginTop: 14,
  },
  seguroIcone: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(15,76,129,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seguroInfo: { flex: 1 },
  seguroTitulo: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    fontWeight: '700',
    color: cores.primariaEscura,
  },
  seguroDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: cores.textoSecundario,
    marginTop: 2,
    lineHeight: 17,
  },

  // Rodapé
  rodape: { alignItems: 'center', marginTop: 8, gap: 6 },
  cluby: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clubyTexto: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: cores.textoSecundario,
  },
  slogan: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13.5,
    color: cores.primaria,
    textAlign: 'center',
    letterSpacing: -0.1,
    marginTop: 2,
  },
  creditos: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
  },

  // Formas decorativas (dentro da faixa azul)
  blobTopo: {
    position: 'absolute',
    top: -120,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  blobLado: {
    position: 'absolute',
    top: 30,
    left: -110,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});

export default LoginScreen;
