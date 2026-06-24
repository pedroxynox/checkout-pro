/**
 * Login biométrico (Face ID / impressão digital).
 *
 * Guarda, de forma defensiva, o login e um token de sessão para permitir que o
 * usuário entre por biometria sem digitar a senha. Tudo é opcional e seguro:
 *  - Só funciona em aparelhos com hardware biométrico CADASTRADO (no app
 *    nativo). Na web não há suporte — as funções simplesmente retornam falso.
 *  - O acesso ao token é liberado apenas após a autenticação biométrica.
 *  - Se o token estiver expirado, o login cai de volta para usuário + senha.
 *
 * Observação: o token é o mesmo já persistido pelo app; aqui mantemos uma cópia
 * que sobrevive ao logout, para o atalho biométrico. `limparBiometria()` apaga.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { tokenStorage } from '../api/tokenStorage';

const CHAVE_BIO_LOGIN = 'checkoutpro:bio-login';
const CHAVE_BIO_TOKEN = 'checkoutpro:bio-token';

/** Há hardware biométrico disponível e cadastrado neste aparelho? */
export async function biometriaSuportada(): Promise<boolean> {
  try {
    const [hardware, cadastrada] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && cadastrada;
  } catch {
    return false;
  }
}

/**
 * Ativa o atalho biométrico após um login bem-sucedido com senha: guarda o
 * login e o token atual. Silencioso e defensivo (não atrapalha o login).
 */
export async function ativarBiometria(login: string): Promise<void> {
  try {
    if (!(await biometriaSuportada())) {
      return;
    }
    const token = await tokenStorage.obterToken();
    if (!token) {
      return;
    }
    await AsyncStorage.setItem(CHAVE_BIO_LOGIN, login);
    await AsyncStorage.setItem(CHAVE_BIO_TOKEN, token);
  } catch {
    // ignora
  }
}

/** Login lembrado para o atalho biométrico (ou null se não houver). */
export async function loginBiometrico(): Promise<string | null> {
  try {
    const [login, token] = await Promise.all([
      AsyncStorage.getItem(CHAVE_BIO_LOGIN),
      AsyncStorage.getItem(CHAVE_BIO_TOKEN),
    ]);
    return login && token ? login : null;
  } catch {
    return null;
  }
}

/**
 * Pede a biometria e, em caso de sucesso, devolve o token salvo (ou null se o
 * usuário cancelar/falhar).
 */
export async function autenticarComBiometria(): Promise<string | null> {
  try {
    const resultado = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Entrar no Check-out Pro',
      cancelLabel: 'Cancelar',
    });
    if (!resultado.success) {
      return null;
    }
    return await AsyncStorage.getItem(CHAVE_BIO_TOKEN);
  } catch {
    return null;
  }
}

/** Apaga a credencial biométrica (ex.: token expirado). */
export async function limparBiometria(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([CHAVE_BIO_LOGIN, CHAVE_BIO_TOKEN]);
  } catch {
    // ignora
  }
}
