/**
 * Heurística de leitura do comprovante do ponto (compartilhada e sem
 * dependências nativas — fácil de testar).
 *
 * O leitor ao vivo escaneia a câmera continuamente; a cada quadro pergunta a
 * `leituraCompleta` se o texto já reconhecido parece um comprovante inteiro
 * (tem uma HORA plausível E algum marcador do documento, como NOME/COMPROVANTE/
 * TRABALHADOR). Só então captura automaticamente — evitando gravar leituras
 * parciais ou borradas. O servidor faz a interpretação final (nome/data/hora).
 */

/** Remove acentos e coloca em maiúsculas, para casar rótulos de forma estável. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

// Hora ancorada no rótulo (tolerante às trocas de OCR: O/I/S… por dígitos) ou
// uma hora genérica "HH:mm"/"HHhmm".
const RE_HORA_ROTULO = /HORA[\s:.=-]*[0-9OQDILZSBG]{1,2}[\s:.H=-]*[0-9OQDILZSBG]{2}/;
const RE_HORA_GENERICA = /\b([01]?\d|2[0-3])[:H][0-5]\d\b/;
// Marcadores que confirmam que é o comprovante (e não um texto qualquer).
const RE_MARCADOR = /NOME|COMPROVANTE|TRABALHADOR|FUNCIONARIO/;

/**
 * true quando o texto lido já tem informação suficiente para capturar: uma
 * hora reconhecível E um marcador do documento.
 */
export function leituraCompleta(texto: string): boolean {
  if (!texto) return false;
  const t = normalizar(texto);
  const temHora = RE_HORA_ROTULO.test(t) || RE_HORA_GENERICA.test(t);
  return temHora && RE_MARCADOR.test(t);
}
