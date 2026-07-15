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

// "Dígito" tolerante ao OCR (mesma ideia do parser do servidor): letras que o
// leitor confunde com números. Só usado no valor da hora, já ancorado.
const D = '[0-9OQDILZSBG]';
// Hora ancorada no rótulo (tolerante às trocas de OCR: O/I/S… por dígitos) ou
// uma hora genérica "HH:mm"/"HHhmm".
const RE_HORA_ROTULO = /HORA[\s:.=-]*[0-9OQDILZSBG]{1,2}[\s:.H=-]*[0-9OQDILZSBG]{2}/;
const RE_HORA_GENERICA = /\b([01]?\d|2[0-3])[:H][0-5]\d\b/;
// Versões COM grupos de captura, para extrair o valor (usadas na votação).
const RE_HORA_ROTULO_CAP = new RegExp(
  `H\\s*[O0]\\s*R\\s*[A4][\\s:.=-]*(${D}{1,2})[\\s:.H=-]*(${D}{2})`,
);
const RE_HORA_GENERICA_CAP = /\b([01]?\d|2[0-3])[:H]([0-5]\d)\b/;
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

/** Corrige as trocas mais comuns do OCR num trecho que deveria ser numérico. */
function corrigirDigitos(s: string): string {
  return s
    .replace(/[OQD]/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5')
    .replace(/G/g, '6')
    .replace(/B/g, '8');
}

/** Monta "HH:mm" validando faixa (00–23 / 00–59); null se implausível. */
function montarHora(hh: string, mm: string): string | null {
  const h = Number(hh);
  const m = Number(mm);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Extrai a hora (HH:mm) do texto lido, no aparelho, para a VOTAÇÃO entre
 * quadros do leitor ao vivo (a interpretação final continua no servidor).
 * Primeiro pelo rótulo `HORA:` (tolerante ao OCR), depois genérica.
 */
export function horaLida(texto: string): string | null {
  if (!texto) return null;
  const t = normalizar(texto);
  const rot = RE_HORA_ROTULO_CAP.exec(t);
  if (rot) {
    const h = montarHora(corrigirDigitos(rot[1]), corrigirDigitos(rot[2]));
    if (h) return h;
  }
  const g = RE_HORA_GENERICA_CAP.exec(t);
  if (g) {
    const h = montarHora(g[1], g[2]);
    if (h) return h;
  }
  return null;
}
