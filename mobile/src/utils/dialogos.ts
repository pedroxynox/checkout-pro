/**
 * Diálogos multiplataforma (móvel + web).
 *
 * O `Alert` do React Native **não é implementado pelo react-native-web**: na
 * web, `Alert.alert(...)` com botões é um no-op e os callbacks (`onPress`)
 * nunca disparam. Por isso, ações que dependem de confirmação (ex.: limpar
 * histórico) não funcionavam no app web.
 *
 * Estas funções usam o `confirm`/`alert` nativos do navegador na web e o
 * `Alert` do RN no celular, com uma API baseada em Promise.
 */
import { Alert, Platform } from 'react-native';

/**
 * Pede confirmação ao usuário. Resolve `true` se confirmou, `false` caso
 * contrário. Funciona tanto no app móvel quanto na web.
 */
export function confirmar(
  titulo: string,
  mensagem: string,
  textoConfirmar = 'Confirmar',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`${titulo}\n\n${mensagem}`)
        : true;
    return Promise.resolve(ok);
  }
  return new Promise((resolve) => {
    Alert.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: textoConfirmar, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** Exibe um aviso simples (informativo), funcionando no móvel e na web. */
export function notificar(titulo: string, mensagem: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`${titulo}\n\n${mensagem}`);
    }
    return;
  }
  Alert.alert(titulo, mensagem);
}
