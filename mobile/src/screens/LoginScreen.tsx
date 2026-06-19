/**
 * Tela de Login (Req 7.1).
 *
 * Autentica o usuário pelo seu login individual e senha, exibindo a identidade
 * Stok Center. Em caso de credenciais inválidas, mostra a mensagem retornada
 * pelo backend. Ao autenticar, o `AuthContext` persiste o token e a navegação
 * passa a exibir as áreas conforme o perfil.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ApiError } from '../api/client';
import { Botao, CampoTexto } from '../components';
import { useAuth } from '../auth/AuthContext';
import { cores, espacamento, tipografia } from '../theme';

export function LoginScreen(): React.ReactElement {
  const { entrar } = useAuth();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const aoEntrar = async () => {
    setErro(null);
    if (!login.trim() || !senha) {
      setErro('Informe o login e a senha.');
      return;
    }
    setEnviando(true);
    try {
      await entrar(login, senha);
    } catch (e) {
      if (e instanceof ApiError) {
        setErro(
          e.naoAutorizado ? 'Login ou senha inválidos.' : e.message,
        );
      } else {
        setErro('Não foi possível entrar. Tente novamente.');
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.cabecalho}>
          <View style={styles.logo}>
            <Text style={styles.logoTexto}>SC</Text>
          </View>
          <Text style={styles.marca}>Check-out Pro</Text>
          <Text style={styles.subtitulo}>Gestão de Frente de Caixa</Text>
        </View>

        <View style={styles.formulario}>
          <Text style={styles.tituloForm}>Entrar</Text>
          <CampoTexto
            rotulo="Login"
            placeholder="seu.login"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            value={login}
            onChangeText={setLogin}
            returnKeyType="next"
          />
          <CampoTexto
            rotulo="Senha"
            placeholder="Sua senha"
            secureTextEntry
            autoComplete="password"
            value={senha}
            onChangeText={setSenha}
            onSubmitEditing={aoEntrar}
            returnKeyType="go"
            erro={erro}
          />
          <Botao
            titulo="Entrar"
            aoPressionar={aoEntrar}
            carregando={enviando}
            estilo={{ marginTop: espacamento.sm }}
          />
        </View>

        <Text style={styles.rodape}>
          Cada usuário acessa com o seu login individual e exclusivo.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.primaria,
  },
  flex: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: espacamento.xl,
  },
  cabecalho: {
    alignItems: 'center',
    marginBottom: espacamento.xxl,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: cores.textoInverso,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espacamento.md,
  },
  logoTexto: {
    fontSize: 28,
    fontWeight: '800',
    color: cores.primaria,
  },
  marca: {
    fontSize: 28,
    fontWeight: '800',
    color: cores.textoInverso,
  },
  subtitulo: {
    ...tipografia.corpo,
    color: cores.primariaClara,
    marginTop: espacamento.xs,
  },
  formulario: {
    backgroundColor: cores.superficie,
    borderRadius: 20,
    padding: espacamento.xl,
  },
  tituloForm: {
    ...tipografia.titulo,
    color: cores.texto,
    marginBottom: espacamento.lg,
  },
  rodape: {
    ...tipografia.legenda,
    color: cores.primariaClara,
    textAlign: 'center',
    marginTop: espacamento.xl,
  },
});

export default LoginScreen;
