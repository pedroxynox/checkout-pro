/**
 * Armazenamento seguro do token de autenticação.
 *
 * Em dispositivos nativos usamos o `expo-secure-store` (Keychain no iOS,
 * Keystore no Android). Na web — onde o SecureStore não está disponível —
 * caímos para o `AsyncStorage`. A interface pública é assíncrona e idêntica
 * nos dois casos, isolando o restante do app dessa diferença de plataforma.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHAVE_TOKEN = 'checkoutpro.auth.token';

const usaSecureStore = Platform.OS !== 'web';

async function escrever(chave: string, valor: string): Promise<void> {
  if (usaSecureStore && (await SecureStore.isAvailableAsync())) {
    await SecureStore.setItemAsync(chave, valor);
    return;
  }
  await AsyncStorage.setItem(chave, valor);
}

async function ler(chave: string): Promise<string | null> {
  if (usaSecureStore && (await SecureStore.isAvailableAsync())) {
    return SecureStore.getItemAsync(chave);
  }
  return AsyncStorage.getItem(chave);
}

async function remover(chave: string): Promise<void> {
  if (usaSecureStore && (await SecureStore.isAvailableAsync())) {
    await SecureStore.deleteItemAsync(chave);
    return;
  }
  await AsyncStorage.removeItem(chave);
}

export const tokenStorage = {
  async salvarToken(token: string): Promise<void> {
    await escrever(CHAVE_TOKEN, token);
  },
  async obterToken(): Promise<string | null> {
    return ler(CHAVE_TOKEN);
  },
  async limparToken(): Promise<void> {
    await remover(CHAVE_TOKEN);
  },
};

export default tokenStorage;
