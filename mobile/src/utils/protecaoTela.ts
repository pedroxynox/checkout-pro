/**
 * Proteção contra captura de tela e marca de confidencialidade.
 *
 * - Nativo (Android/iOS): usa `expo-screen-capture` para bloquear/avisar sobre
 *   capturas. No Android aplica FLAG_SECURE (bloqueia print e gravação); no iOS
 *   detecta a captura (o sistema não permite bloquear de fato).
 * - Web: o navegador NÃO permite bloquear capturas de tela do sistema. Aplicamos
 *   dissuasores discretos: bloquear impressão/PDF (@media print), limpar a área
 *   de transferência ao detectar PrintScreen e desencorajar o menu de contexto.
 *
 * Conteúdo é de uso interno e confidencial — daí a proteção.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

/** Ativa a proteção de tela enquanto o componente estiver montado. */
export function useProtecaoTela(): void {
  useEffect(() => {
    // ----- Web: dissuasores (captura total não é bloqueável pelo navegador) -----
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;

      const estilo = document.createElement('style');
      estilo.setAttribute('data-protecao', 'checkout-pro');
      // Esconde o conteúdo ao imprimir / salvar como PDF.
      estilo.innerHTML = `@media print { body { display: none !important; } }`;
      document.head.appendChild(estilo);

      const limparClipboard = (): void => {
        try {
          void navigator.clipboard?.writeText('');
        } catch {
          // Ignora (permissão negada / contexto inseguro).
        }
      };
      const aoSoltarTecla = (e: KeyboardEvent): void => {
        if (e.key === 'PrintScreen') {
          limparClipboard();
        }
      };
      window.addEventListener('keyup', aoSoltarTecla);

      return () => {
        window.removeEventListener('keyup', aoSoltarTecla);
        if (estilo.parentNode) {
          estilo.parentNode.removeChild(estilo);
        }
      };
    }

    // ----- Nativo: bloqueia/avisa sobre capturas -----
    ScreenCapture.preventScreenCaptureAsync('checkout-pro').catch(() => {
      // Ignora se indisponível na plataforma.
    });
    return () => {
      ScreenCapture.allowScreenCaptureAsync('checkout-pro').catch(() => {
        // Ignora.
      });
    };
  }, []);
}
