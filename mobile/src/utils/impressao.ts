/**
 * Impressão / geração de PDF a partir de HTML, via `expo-print`.
 *
 * `Print.printAsync` funciona tanto na **web** (abre o diálogo de impressão do
 * navegador — de onde dá para "Salvar como PDF") quanto no **nativo** (abre a
 * folha de impressão do sistema, que também permite salvar/compartilhar em
 * PDF). Mantemos um único caminho para as duas plataformas.
 */
import * as Print from 'expo-print';

/** Abre o diálogo de impressão/PDF com o HTML do relatório. */
export async function imprimirRelatorio(html: string): Promise<void> {
  await Print.printAsync({ html });
}
