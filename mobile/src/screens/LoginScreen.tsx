/**
 * Tela de Login (Req 7.1) — identidade "Check-out Pro / Stok Center".
 *
 * Layout fixo (sem rolagem), com fundo e logos oficiais. Autentica pelo login
 * individual e senha; credenciais inválidas mostram "Senha incorreta.".
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  SVG_ENTRAR,
  SVG_FUNDO,
  SVG_LOGO_STOK,
  SVG_OLHO,
  SVG_SENHA,
  SVG_USUARIO,
  SVG_WORKFORCE,
  recolorir,
} from '../theme/icones';

const VERMELHO = '#E31B23';
const VERMELHO_ESCURO = '#A50F1E';
const ESCURO = '#1B1B1F';
const CHAVE_LOGIN_SALVO = 'checkoutpro:login-lembrado';

/** Aplica a cor escura nos textos brancos das logos (visíveis no fundo claro). */
const escurecer = (svg: string): string => svg.split('#ffffff').join(ESCURO);

/** Caixa de ícone com gradiente vermelho. */
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

export function LoginScreen(): React.ReactElement {
  const { entrar } = useAuth();
  const { width, height } = useWindowDimensions();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const versao = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    void (async () => {
      try {
        const salvo = await AsyncStorage.getItem(CHAVE_LOGIN_SALVO);
        if (salvo) {
          setLogin(salvo);
          setLembrar(true);
        }
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
        if (lembrar) await AsyncStorage.setItem(CHAVE_LOGIN_SALVO, login.trim());
        else await AsyncStorage.removeItem(CHAVE_LOGIN_SALVO);
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
      <StatusBar style="dark" />
      {/* Fundo oficial (cobre a tela toda). */}
      <View style={StyleSheet.absoluteFill}>
        <SvgXml xml={SVG_FUNDO} width={width} height={height} />
      </View>

      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.conteudo}
        >
          {/* ===== Marca ===== */}
          <View style={styles.marca}>
            <SvgXml xml={escurecer(SVG_LOGO_STOK)} width={170} height={64} />
            <SvgXml
              xml={escurecer(SVG_WORKFORCE)}
              width={250}
              height={84}
            />
            <Text style={styles.gestao}>Gestão Inteligente</Text>
          </View>

          {/* ===== Card ===== */}
          <View style={styles.card}>
            <View style={styles.boasVindasLinha}>
              <IconeCaixa tamanho={48}>
                <SvgXml xml={recolorir(SVG_USUARIO, '#fff')} width={26} height={26} />
              </IconeCaixa>
              <View style={styles.boasVindasTexto}>
                <Text style={styles.boasVindasTitulo}>Bem-vindo!</Text>
                <Text style={styles.boasVindasSub}>
                  Acesse sua conta para continuar.
                </Text>
              </View>
            </View>

            <View style={styles.campo}>
              <IconeCaixa>
                <SvgXml xml={recolorir(SVG_USUARIO, '#fff')} width={22} height={22} />
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

            <View style={styles.campo}>
              <IconeCaixa>
                <SvgXml xml={recolorir(SVG_SENHA, '#fff')} width={22} height={22} />
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

          {/* ===== Rodapé ===== */}
          <View style={styles.rodape}>
            <View style={styles.rodapeBadge}>
              <Text style={styles.rodapeBadgeTexto}>S</Text>
            </View>
            <Text style={styles.rodapeTexto}>Plataforma Corporativa de Gestão</Text>
            <Text style={styles.rodapeTexto}>Stok Center • Versão {versao}</Text>
            <Text style={styles.creditos}>Desenvolvido por Pedro · 2026</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EFEFF1' },
  flex: { flex: 1 },
  conteudo: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },

  // Marca
  marca: { alignItems: 'center', paddingTop: 6 },
  gestao: { color: '#3A3A42', fontSize: 16, fontWeight: '600', marginTop: 4 },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  iconeCaixa: { alignItems: 'center', justifyContent: 'center' },
  boasVindasLinha: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  boasVindasTexto: { marginLeft: 12, flex: 1 },
  boasVindasTitulo: { fontSize: 21, fontWeight: '800', color: ESCURO },
  boasVindasSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F5F8',
    borderRadius: 14,
    paddingRight: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: ESCURO,
    paddingVertical: 13,
    paddingHorizontal: 12,
  },
  olho: { padding: 4 },
  erro: { color: '#C8102E', fontSize: 14, marginBottom: 6, marginLeft: 4 },
  aviso: { color: '#8A6D00', fontSize: 13, marginBottom: 6, marginLeft: 4 },
  opcoes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
    height: 54,
    borderRadius: 14,
    gap: 10,
  },
  botaoPressed: { opacity: 0.9 },
  botaoTexto: { color: '#fff', fontSize: 18, fontWeight: '800' },

  // Rodapé
  rodape: { alignItems: 'center', paddingBottom: 4 },
  rodapeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: VERMELHO,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  rodapeBadgeTexto: { color: VERMELHO, fontWeight: '900', fontSize: 13 },
  rodapeTexto: { color: '#5A5A62', fontSize: 12, marginTop: 1 },
  creditos: { color: '#8A8A90', fontSize: 11, marginTop: 6 },
});

export default LoginScreen;
