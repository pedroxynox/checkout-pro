/**
 * Impressão / geração de PDF a partir de HTML.
 *
 * - **Web** (o app roda no navegador): montamos o HTML num `iframe` oculto,
 *   **esperamos ele carregar** e só então chamamos `print()`. Isso evita o PDF
 *   em branco que acontecia quando a impressão era disparada antes do conteúdo
 *   (SVG/estilos) terminar de renderizar. O usuário escolhe "Salvar como PDF"
 *   ou a impressora no diálogo do navegador.
 * - **Nativo** (Android/iOS): usa `expo-print`, que abre a folha de impressão do
 *   sistema (também permite salvar/compartilhar em PDF).
 */
import { Platform } from 'react-native';
import * as Print from 'expo-print';

/** Abre o diálogo de impressão/PDF com o HTML do relatório. */
export async function imprimirRelatorio(html: string): Promise<void> {
  if (Platform.OS === 'web') {
    await imprimirNaWeb(html);
    return;
  }
  await Print.printAsync({ html });
}

/**
 * Impressão robusta no navegador: escreve o HTML num iframe fora da tela,
 * aguarda o `load` (conteúdo + SVG renderizados) e então imprime. Remove o
 * iframe depois de imprimir (ou por segurança, após um tempo).
 */
function imprimirNaWeb(html: string): Promise<void> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = (globalThis as any).document;
    if (!doc || !doc.body) {
      resolve();
      return;
    }

    const iframe = doc.createElement('iframe');
    // Fora da tela, mas com tamanho real para o layout rodar (não usar 0x0).
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.left = '-10000px';
    iframe.style.top = '0';
    iframe.style.width = '794px'; // ~A4 em px a 96dpi
    iframe.style.height = '1123px';
    iframe.style.border = '0';

    let finalizado = false;
    const limpar = (): void => {
      if (finalizado) return;
      finalizado = true;
      setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          // ignora
        }
        resolve();
      }, 1000);
    };

    iframe.onload = (): void => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win: any = iframe.contentWindow;
      if (!win) {
        limpar();
        return;
      }
      // Pequeno atraso extra para garantir a pintura de SVG/fontes.
      setTimeout(() => {
        try {
          win.focus();
          win.addEventListener?.('afterprint', limpar);
          win.print();
        } catch {
          // ignora
        }
        // Rede de segurança caso 'afterprint' não dispare no navegador.
        setTimeout(limpar, 60000);
      }, 350);
    };

    doc.body.appendChild(iframe);
    // `srcdoc` garante o disparo de `onload` após o parse do documento.
    iframe.srcdoc = html;
  });
}
