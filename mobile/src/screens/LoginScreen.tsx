/**
 * Tela de Login (Req 7.1) — identidade "Check-out Pro / Stok Center".
 *
 * Autentica o usuário pelo seu login individual e senha. Em caso de
 * credenciais inválidas, mostra "Senha incorreta.". Ao autenticar, o
 * `AuthContext` persiste o token e a navegação passa a exibir as áreas
 * conforme o perfil.
 *
 * Observação: o logotipo e o fundo são recriados com estilo/gradiente até a
 * substituição pelas artes oficiais (logo/imagem de fundo). Os botões de
 * acesso rápido na base são ilustrativos (os módulos abrem após o login).
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgXml } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  SVG_COLABORADORES,
  SVG_ENTRAR,
  SVG_INDICADORES,
  SVG_METAS,
  SVG_OLHO,
  SVG_SENHA,
  SVG_TAREFAS,
  SVG_USUARIO,
  recolorir,
} from '../theme/icones';

const VERMELHO = '#D81E2C';
const VERMELHO_ESCURO = '#A50F1E';
const CHAVE_LOGIN_SALVO = 'checkoutpro:login-lembrado';

/** Caixa de ícone com gradiente vermelho (usada nos campos e no topo do card). */
function IconeCaixa({
  children,
  tamanho = 44,
}: {
  children: React.ReactNode;
  tamanho?: number;
}): React.ReactElement {
  return (
    <LinearGradient
      colors={[VERMELHO, VERMELHO_ESCURO]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.iconeCaixa,
        { width: tamanho, height: tamanho, borderRadius: tamanho * 0.28 },
      ]}
    >
      {children}
    </LinearGradient>
  );
}

/** Botão de acesso rápido (ilustrativo) na base da tela. */
function Atalho({
  icone,
  rotulo,
  aoTocar,
}: {
  icone: React.ReactNode;
  rotulo: string;
  aoTocar: () => void;
}): React.ReactElement {
  return (
    <Pressable
      style={({ pressed }) => [styles.atalho, pressed && styles.atalhoPressed]}
      onPress={aoTocar}
    >
      <View style={styles.atalhoIcone}>{icone}</View>
      <Text style={styles.atalhoRotulo}>{rotulo}</Text>
    </Pressable>
  );
}

export function LoginScreen(): React.ReactElement {
  const { entrar } = useAuth();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const versao = Constants.expoConfig?.version ?? '1.0.0';

  // Carrega o usuário lembrado (se houver) ao abrir a tela.
  useEffect(() => {
    void (async () => {
      try {
        const salvo = await AsyncStorage.getItem(CHAVE_LOGIN_SALVO);
        if (salvo) {
          setLogin(salvo);
          setLembrar(true);
        }
      } catch {
        // Ignora falhas de leitura do armazenamento local.
      }
    })();
  }, []);

  const aoEntrar = async () => {
    setErro(null);
    setAviso(null);
    if (!login.trim() || !senha) {
      setErro('Informe o usuário e a senha.');
      return;
    }
    setEnviando(true);
    try {
      // Persiste (ou remove) o usuário lembrado antes de navegar.
      try {
        if (lembrar) await AsyncStorage.setItem(CHAVE_LOGIN_SALVO, login.trim());
        else await AsyncStorage.removeItem(CHAVE_LOGIN_SALVO);
      } catch {
        // Não bloqueia o login por falha no armazenamento.
      }
      await entrar(login.trim(), senha);
    } catch (e) {
      if (e instanceof ApiError) {
        setErro(e.naoAutorizado ? 'Senha incorreta.' : e.message);
      } else {
        setErro('Não foi possível entrar. Tente novamente.');
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

  const atalhoInfo = () => {
    setErro(null);
    setAviso('Faça login para acessar os módulos.');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* Fundo em gradiente vermelho escuro. */}
      <LinearGradient
        colors={['#7D1A1F', '#3A1013', '#140A0B']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Marca d'água "S" ao fundo. */}
      <Text style={styles.marcaDagua}>S</Text>

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
            {/* ===== Marca ===== */}
            <View style={styles.marca}>
              <View style={styles.logoStok}>
                <Text style={styles.logoStokTexto}>Stok</Text>
                <View style={styles.logoCenterBadge}>
                  <Text style={styles.logoCenterTexto}>CENTER</Text>
                </View>
              </View>

              <View style={styles.tituloLinha}>
                <Text style={styles.tituloCheckout}>CHECK-OUT</Text>
                <View style={styles.proBadge}>
                  <Text style={styles.proTexto}>PRO</Text>
                </View>
              </View>
              <Text style={styles.workforce}>W O R K F O R C E</Text>
              <View style={styles.tituloSublinhado} />
              <Text style={styles.gestao}>Gestão Inteligente</Text>
            </View>

            {/* ===== Card de login ===== */}
            <View style={styles.card}>
              <View style={styles.boasVindasLinha}>
                <IconeCaixa tamanho={52}>
                  <SvgXml xml={recolorir(SVG_USUARIO, '#fff')} width={28} height={28} />
                </IconeCaixa>
                <View style={styles.boasVindasTexto}>
                  <Text style={styles.boasVindasTitulo}>Bem-vindo!</Text>
                  <Text style={styles.boasVindasSub}>
                    Acesse sua conta para continuar.
                  </Text>
                </View>
              </View>

              {/* Campo usuário */}
              <View style={styles.campo}>
                <IconeCaixa>
                  <SvgXml xml={recolorir(SVG_USUARIO, '#fff')} width={24} height={24} />
                </IconeCaixa>
                <TextInput
                  style={styles.input}
                  placeholder="Usuário ou e-mail"
                  placeholderTextColor="#9AA0AC"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  value={login}
                  onChangeText={setLogin}
                  returnKeyType="next"
                />
              </View>

              {/* Campo senha */}
              <View style={styles.campo}>
                <IconeCaixa>
                  <SvgXml xml={recolorir(SVG_SENHA, '#fff')} width={24} height={24} />
                </IconeCaixa>
                <TextInput
                  style={styles.input}
                  placeholder="Senha"
                  placeholderTextColor="#9AA0AC"
                  secureTextEntry={!mostrarSenha}
                  autoComplete="password"
                  value={senha}
                  onChangeText={setSenha}
                  onSubmitEditing={aoEntrar}
                  returnKeyType="go"
                />
                <Pressable
                  onPress={() => setMostrarSenha((v) => !v)}
                  hitSlop={10}
                  style={styles.olho}
                >
                  <SvgXml
                    xml={recolorir(SVG_OLHO, mostrarSenha ? VERMELHO : '#6B7280')}
                    width={24}
                    height={24}
                  />
                </Pressable>
              </View>

              {erro ? <Text style={styles.erro}>{erro}</Text> : null}
              {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}

              {/* Opções */}
              <View style={styles.opcoes}>
                <Pressable
                  style={styles.lembrar}
                  onPress={() => setLembrar((v) => !v)}
                  hitSlop={8}
                >
                  <View style={[styles.check, lembrar && styles.checkOn]}>
                    {lembrar ? <Text style={styles.checkMarca}>✓</Text> : null}
                  </View>
                  <Text style={styles.lembrarTexto}>Lembrar meu acesso</Text>
                </Pressable>
                <Pressable onPress={esqueciSenha} hitSlop={8}>
                  <Text style={styles.esqueci}>Esqueci minha senha</Text>
                </Pressable>
              </View>

              {/* Botão Entrar */}
              <Pressable
                onPress={aoEntrar}
                disabled={enviando}
                style={({ pressed }) => [pressed && styles.botaoPressed]}
              >
                <LinearGradient
                  colors={[VERMELHO, VERMELHO_ESCURO]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.botao}
                >
                  {enviando ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <SvgXml xml={recolorir(SVG_ENTRAR, '#fff')} width={24} height={24} />
                      <Text style={styles.botaoTexto}>Entrar</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>

            {/* ===== Atalhos ilustrativos ===== */}
            <View style={styles.atalhos}>
              <Atalho
                rotulo="Colaboradores"
                aoTocar={atalhoInfo}
                icone={<SvgXml xml={SVG_COLABORADORES} width={28} height={28} />}
              />
              <Atalho
                rotulo="Metas"
                aoTocar={atalhoInfo}
                icone={<SvgXml xml={SVG_METAS} width={28} height={28} />}
              />
              <Atalho
                rotulo="Tarefas"
                aoTocar={atalhoInfo}
                icone={<SvgXml xml={SVG_TAREFAS} width={28} height={28} />}
              />
              <Atalho
                rotulo="Indicadores"
                aoTocar={atalhoInfo}
                icone={<SvgXml xml={SVG_INDICADORES} width={28} height={28} />}
              />
            </View>

            {/* ===== Rodapé ===== */}
            <View style={styles.rodape}>
              <View style={styles.rodapeBadge}>
                <Text style={styles.rodapeBadgeTexto}>S</Text>
              </View>
              <Text style={styles.rodapeTexto}>
                Plataforma Corporativa de Gestão
              </Text>
              <Text style={styles.rodapeTexto}>
                Stok Center • Versão {versao}
              </Text>
              <Text style={styles.creditos}>Desenvolvido por Pedro · 2026</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#140A0B' },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 28,
  },
  marcaDagua: {
    position: 'absolute',
    top: -60,
    left: -40,
    fontSize: 340,
    fontWeight: '900',
    color: 'rgba(255,90,90,0.06)',
  },

  // Marca
  marca: { alignItems: 'center', marginBottom: 22 },
  logoStok: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14 },
  logoStokTexto: {
    fontSize: 46,
    fontWeight: '900',
    color: '#FFFFFF',
    fontStyle: 'italic',
    letterSpacing: -1,
  },
  logoCenterBadge: {
    backgroundColor: VERMELHO,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
    marginBottom: 8,
  },
  logoCenterTexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  tituloLinha: { flexDirection: 'row', alignItems: 'center' },
  tituloCheckout: {
    fontSize: 38,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  proBadge: {
    backgroundColor: VERMELHO,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 10,
  },
  proTexto: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  workforce: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 6,
    marginTop: 6,
  },
  tituloSublinhado: {
    width: 54,
    height: 3,
    borderRadius: 2,
    backgroundColor: VERMELHO,
    marginTop: 10,
  },
  gestao: { color: '#E7C9CC', fontSize: 16, marginTop: 12 },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  iconeCaixa: { alignItems: 'center', justifyContent: 'center' },
  boasVindasLinha: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  boasVindasTexto: { marginLeft: 14, flex: 1 },
  boasVindasTitulo: { fontSize: 22, fontWeight: '800', color: '#1A1A1F' },
  boasVindasSub: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F5F8',
    borderRadius: 14,
    paddingRight: 12,
    marginBottom: 14,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1F',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  olho: { padding: 4 },
  erro: { color: '#C8102E', fontSize: 14, marginBottom: 8, marginLeft: 4 },
  aviso: { color: '#8A6D00', fontSize: 13, marginBottom: 8, marginLeft: 4 },
  opcoes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    marginTop: 2,
  },
  lembrar: { flexDirection: 'row', alignItems: 'center' },
  check: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#9AA0AC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: VERMELHO, borderColor: VERMELHO },
  checkMarca: { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 16 },
  lembrarTexto: { marginLeft: 8, color: '#4B5563', fontSize: 14 },
  esqueci: { color: VERMELHO, fontSize: 14, fontWeight: '700' },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    gap: 10,
  },
  botaoPressed: { opacity: 0.9 },
  botaoTexto: { color: '#fff', fontSize: 18, fontWeight: '800' },

  // Atalhos
  atalhos: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
    gap: 10,
  },
  atalho: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  atalhoPressed: { backgroundColor: 'rgba(255,255,255,0.10)' },
  atalhoIcone: { marginBottom: 8 },
  atalhoRotulo: { color: '#E7C9CC', fontSize: 12, fontWeight: '600' },

  // Rodapé
  rodape: { alignItems: 'center', marginTop: 26 },
  rodapeBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: VERMELHO,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  rodapeBadgeTexto: { color: VERMELHO, fontWeight: '900', fontSize: 14 },
  rodapeTexto: { color: '#B9A6A8', fontSize: 13, marginTop: 2 },
  creditos: { color: '#7E6A6C', fontSize: 11, marginTop: 8 },
});

export default LoginScreen;
