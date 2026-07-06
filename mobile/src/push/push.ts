/**
 * Notificações push (Expo).
 *
 * Regista o token de push do aparelho no backend (após o login) e configura a
 * exibição das notificações com o app aberto. Tudo é **best-effort**: se o
 * push não puder ser configurado (permissão negada, emulador, sem credencial
 * FCM ainda, web), o app segue funcionando normalmente — o aviso continua
 * chegando in-app/WebSocket.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { notificacoesService } from '../api/services';

// Com o app ABERTO, ainda mostra a notificação (banner + som).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let tokenRegistrado: string | null = null;

/** projectId do EAS (necessário para gerar o token de push do Expo). */
function obterProjectId(): string | undefined {
  const eas = Constants.expoConfig?.extra?.eas as
    | { projectId?: string }
    | undefined;
  return eas?.projectId;
}

/**
 * Pede permissão, gera o token de push do Expo e o registra no backend. Chamar
 * após o login (com sessão ativa). Idempotente: não re-registra o mesmo token.
 */
export async function registrarPush(): Promise<void> {
  try {
    // Push só faz sentido em aparelho físico (não em web/emulador).
    if (Platform.OS === 'web' || !Device.isDevice) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const atual = await Notifications.getPermissionsAsync();
    let concedido = atual.granted;
    if (!concedido) {
      const pedido = await Notifications.requestPermissionsAsync();
      concedido = pedido.granted;
    }
    if (!concedido) return;

    const projectId = obterProjectId();
    const resposta = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = resposta.data;
    if (!token || token === tokenRegistrado) return;

    await notificacoesService.registrarPushToken(token, Platform.OS);
    tokenRegistrado = token;
  } catch {
    // best-effort — nunca quebra o app se o push não puder ser configurado.
  }
}

/** Remove o token do aparelho no backend (logout). Best-effort. */
export async function removerPushRegistrado(): Promise<void> {
  try {
    if (!tokenRegistrado) return;
    await notificacoesService.removerPushToken(tokenRegistrado);
    tokenRegistrado = null;
  } catch {
    // best-effort
  }
}
