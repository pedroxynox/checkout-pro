/**
 * Conversão da escala (SVG) em **imagem PNG** para enviar à equipe.
 *
 * O SVG é desenhado no tamanho final (retrato 2160 px no dia, paisagem 3840 px
 * na semana) e rasterizado **1:1** num `canvas`: o PNG sai exatamente com as
 * dimensões declaradas, sem reamostragem, que é o que mantém o texto nítido
 * quando alguém amplia a escala no celular.
 *
 * Só funciona onde existe `canvas` — no app aberto pelo **navegador** (inclusive
 * o do celular). No APK não há canvas: ali a saída é o PDF, que já cobre o
 * mesmo desenho. `suportaImagemPng()` diz qual dos dois oferecer, para a tela
 * nunca mostrar um botão que não vai funcionar.
 */
import type { ImagemEscala } from './escalaLayout';

/**
 * Limite de segurança do lado maior da imagem.
 *
 * Navegadores recusam canvas gigantes em silêncio (devolvem um PNG em branco),
 * e uma escala em branco enviada à equipe é pior do que um aviso claro.
 */
const LADO_MAXIMO = 16000;

/** true quando dá para gerar PNG neste ambiente (navegador com canvas). */
export function suportaImagemPng(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  return (
    typeof g.document !== 'undefined' &&
    typeof g.Image !== 'undefined' &&
    typeof g.URL?.createObjectURL === 'function'
  );
}

/** Erro de geração com mensagem já pronta para o usuário. */
export class ErroImagemEscala extends Error {}

/**
 * Gera o PNG da escala e dispara o download com o nome informado.
 *
 * O SVG é carregado como imagem a partir de um blob (e não de um `data:` URI):
 * escalas grandes passam de centenas de milhares de caracteres, e nesse tamanho
 * a URL embutida falha em alguns navegadores.
 */
export async function baixarEscalaComoPng(
  imagem: ImagemEscala,
  nomeArquivo: string,
): Promise<void> {
  if (!suportaImagemPng()) {
    throw new ErroImagemEscala(
      'A imagem só pode ser gerada pelo navegador. Use o PDF no aplicativo.',
    );
  }
  if (Math.max(imagem.largura, imagem.altura) > LADO_MAXIMO) {
    throw new ErroImagemEscala(
      'A escala ficou grande demais para virar uma única imagem. Gere o PDF ou publique por função.',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  const blobSvg = new g.Blob([imagem.svg], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const urlSvg: string = g.URL.createObjectURL(blobSvg);

  try {
    const img = await carregarImagem(urlSvg);
    const canvas = g.document.createElement('canvas');
    canvas.width = imagem.largura;
    canvas.height = imagem.altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new ErroImagemEscala('Não foi possível preparar a imagem.');
    }
    // Fundo branco explícito: sem isso, o PNG sai com fundo transparente e
    // aplicativos de mensagem o exibem sobre fundo escuro, apagando o texto.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, imagem.largura, imagem.altura);
    ctx.drawImage(img, 0, 0, imagem.largura, imagem.altura);

    const blobPng: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b: Blob | null) => {
        if (b) resolve(b);
        else reject(new ErroImagemEscala('Não foi possível gerar a imagem.'));
      }, 'image/png');
    });
    baixarBlob(blobPng, nomeArquivo);
  } finally {
    g.URL.revokeObjectURL(urlSvg);
  }
}

/** Carrega o SVG como imagem, com erro tratado. */
function carregarImagem(url: string): Promise<HTMLImageElement> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  return new Promise((resolve, reject) => {
    const img = new g.Image();
    img.onload = (): void => resolve(img);
    img.onerror = (): void =>
      reject(new ErroImagemEscala('Não foi possível desenhar a escala.'));
    img.src = url;
  });
}

/** Dispara o download de um blob com o nome informado. */
function baixarBlob(blob: Blob, nomeArquivo: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  const url = g.URL.createObjectURL(blob);
  const link = g.document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  g.document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoga depois do clique: revogar na hora cancela o download em alguns
  // navegadores.
  setTimeout(() => g.URL.revokeObjectURL(url), 10000);
}
