/**
 * Tela de Login (Req 7.1) — identidade "Checkout Pro Workforce / Stok Center".
 *
 * Recriação do layout corporativo (fundo claro com ondas vermelhas, logo com
 * carrinho, card de acesso e rodapé). Autentica pelo login individual e senha;
 * credenciais inválidas mostram "Senha incorreta.".
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
  useWindowDimensions,
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
  SVG_CARRINHO,
  SVG_ENTRAR,
  SVG_FUNDO_ONDAS,
  SVG_OLHO,
  SVG_SEGURANCA,
  SVG_SENHA,
  SVG_USUARIO,
  recolorir,
} from '../theme/icones';

const VERMELHO = '#E31B23';
const VERMELHO_ESCURO = '#B3121A';
const ESCURO = '#1B2233';
const ROSA = '#FCE7E9';
const CHAVE_LOGIN_SALVO = 'checkoutpro:login-lembrado';

export function LoginScreen(): React.ReactElement {
  const { entrar } = useAuth();
  const { width, height } = useWindowDimensions();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const versao = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    void (async () => {
      try {
        const salvo = await AsyncStorage.getItem(CHAVE_LOGIN_SALVO);
        if (salvo) setLogin(salvo);
      } catch {
        // ignora
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
      try {
        await AsyncStorage.setItem(CHAVE_LOGIN_SALVO, login.trim());
      } catch {
        // ignora
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

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={StyleSheet.absoluteFill}>
        <SvgXml xml={SVG_FUNDO_ONDAS} width={width} height={height} />
      </View>

      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ===== Logo Stok Center ===== */}
            <View style={styles.logoLinha}>
              <SvgXml xml={recolorir(SVG_CARRINHO, VERMELHO)} width={34} height={34} />
              <Text style={styles.logoStok}>Stok</Text>
              <Text style={styles.logoCenter}>CENTER</Text>
            </View>

            {/* ===== Hero ===== */}
            <View style={styles.heroLinha}>
              <LinearGradient
                colors={[VERMELHO, VERMELHO_ESCURO]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroIcone}
              >
                <SvgXml xml={recolorir(SVG_CARRINHO, '#fff')} width={42} height={42} />
              </LinearGradient>
              <View style={styles.heroTextos}>
                <View style={styles.heroTitulo}>
                  <Text style={styles.checkout}>CHECKOUT </Text>
                  <Text style={styles.pro}>PRO</Text>
                </View>
                <View style={styles.workforceBar}>
                  <Text style={styles.workforce}>WORKFORCE</Text>
                </View>
              </View>
            </View>
            <View style={styles.heroSublinhado} />
            <Text style={styles.subtitulo}>
              Gestão Inteligente da Frente de Caixa
            </Text>

            {/* ===== Card ===== */}
            <View style={styles.card}>
              <View style={styles.escudoMarca} pointerEvents="none">
                <SvgXml
                  xml={recolorir(SVG_SEGURANCA, '#EEF0F3')}
                  width={120}
                  height={120}
                />
              </View>

              <Text style={styles.boasVindas}>Bem-vindo!</Text>
              <Text style={styles.boasVindasSub}>
                Acesse sua conta para continuar
              </Text>

              {/* Campo Acesso */}
              <View style={styles.campo}>
                <View style={styles.campoIcone}>
                  <SvgXml xml={SVG_USUARIO} width={22} height={22} />
                </View>
                <View style={styles.campoCorpo}>
                  <Text style={styles.campoRotulo}>Acesso</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Seu login"
                    placeholderTextColor="#9AA0AC"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    value={login}
                    onChangeText={setLogin}
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Campo Senha */}
              <View style={styles.campo}>
                <View style={styles.campoIcone}>
                  <SvgXml xml={SVG_SENHA} width={22} height={22} />
                </View>
                <View style={styles.campoCorpo}>
                  <Text style={styles.campoRotulo}>Senha</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Sua senha"
                    placeholderTextColor="#9AA0AC"
                    secureTextEntry={!mostrarSenha}
                    autoComplete="password"
                    value={senha}
                    onChangeText={setSenha}
                    onSubmitEditing={aoEntrar}
                    returnKeyType="go"
                  />
                </View>
                <Pressable
                  onPress={() => setMostrarSenha((v) => !v)}
                  hitSlop={10}
                  style={styles.olho}
                >
                  <SvgXml
                    xml={recolorir(SVG_OLHO, mostrarSenha ? VERMELHO : '#9AA0AC')}
                    width={24}
                    height={24}
                  />
                </Pressable>
              </View>

              {erro ? <Text style={styles.erro}>{erro}</Text> : null}
              {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}
              <Pressable onPress={esqueciSenha} hitSlop={6} style={styles.esqueciBox}>
                <Text style={styles.esqueci}>Esqueci minha senha</Text>
              </Pressable>

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
                      <Text style={styles.botaoTexto}>Entrar</Text>
                      <SvgXml xml={recolorir(SVG_ENTRAR, '#fff')} width={22} height={22} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              {/* Linha "acesso seguro" */}
              <View style={styles.seguro}>
                <View style={styles.seguroLinha} />
                <SvgXml xml={recolorir(SVG_SEGURANCA, VERMELHO)} width={16} height={16} />
                <Text style={styles.seguroTexto}>Acesso seguro e exclusivo</Text>
                <View style={styles.seguroLinha} />
              </View>
            </View>

            {/* ===== Rodapé ===== */}
            <View style={styles.rodape}>
              <View style={styles.rodapeBadge}>
                <SvgXml xml={recolorir(SVG_SEGURANCA, VERMELHO)} width={16} height={16} />
              </View>
              <Text style={styles.rodapeTexto}>Plataforma de Gestão Operacional</Text>
              <Text style={styles.rodapeMarca}>STOK CENTER</Text>
              <Text style={styles.rodapeVersao}>
                Versão {versao} · Desenvolvido por Pedro · 2026
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F2F4' },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingVertical: 14,
    justifyContent: 'space-between',
  },

  // Logo
  logoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoStok: {
    fontSize: 30,
    fontWeight: '900',
    color: VERMELHO,
    fontStyle: 'italic',
  },
  logoCenter: {
    fontSize: 18,
    fontWeight: '800',
    color: ESCURO,
    letterSpacing: 3,
    marginTop: 8,
  },

  // Hero
  heroLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 14,
  },
  heroIcone: {
    width: 66,
    height: 66,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextos: { alignItems: 'flex-start' },
  heroTitulo: { flexDirection: 'row', alignItems: 'center' },
  checkout: { fontSize: 30, fontWeight: '900', color: ESCURO },
  pro: { fontSize: 30, fontWeight: '900', color: VERMELHO },
  workforceBar: {
    backgroundColor: VERMELHO,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 2,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  workforce: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 6,
  },
  heroSublinhado: {
    width: 56,
    height: 3,
    borderRadius: 2,
    backgroundColor: VERMELHO,
    alignSelf: 'center',
    marginTop: 12,
  },
  subtitulo: {
    color: '#3A4151',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    marginTop: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 6,
  },
  escudoMarca: { position: 'absolute', top: 14, right: 10 },
  boasVindas: { fontSize: 26, fontWeight: '900', color: ESCURO },
  boasVindasSub: { fontSize: 14, color: '#6B7280', marginTop: 2, marginBottom: 16 },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEF0F3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  campoIcone: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: ROSA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  campoCorpo: { flex: 1, marginLeft: 10 },
  campoRotulo: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A91A0',
    marginBottom: -2,
  },
  input: { fontSize: 16, color: ESCURO, paddingVertical: Platform.OS === 'web' ? 6 : 2 },
  olho: { padding: 6 },
  erro: { color: VERMELHO, fontSize: 14, marginLeft: 4 },
  aviso: { color: '#8A6D00', fontSize: 13, marginLeft: 4 },
  esqueciBox: { alignSelf: 'flex-end', marginVertical: 8 },
  esqueci: { color: VERMELHO, fontSize: 13, fontWeight: '700' },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 14,
    gap: 10,
    marginTop: 2,
  },
  botaoPressed: { opacity: 0.9 },
  botaoTexto: { color: '#fff', fontSize: 18, fontWeight: '800' },
  seguro: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  seguroLinha: { flex: 1, height: 1, backgroundColor: '#E6E8EC' },
  seguroTexto: { color: '#8A91A0', fontSize: 12, fontWeight: '600' },

  // Rodapé
  rodape: { alignItems: 'center', marginTop: 16 },
  rodapeBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: VERMELHO,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  rodapeTexto: { color: '#5A6072', fontSize: 12 },
  rodapeMarca: { color: ESCURO, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  rodapeVersao: { color: '#8A8F9C', fontSize: 11, marginTop: 4 },
});

export default LoginScreen;
