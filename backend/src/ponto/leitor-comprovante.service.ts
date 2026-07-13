import { Injectable, Logger } from '@nestjs/common';
import Jimp from 'jimp';
import { createWorker, PSM, Worker } from 'tesseract.js';

/**
 * Contrato do leitor do comprovante (OCR): recebe a imagem (base64) e devolve o
 * texto lido. Fica atrás de uma interface para poder trocar a implementação
 * (nosso servidor, nuvem, etc.) sem mexer no resto.
 */
export abstract class LeitorComprovanteService {
  abstract extrairTexto(imagemBase64: string): Promise<string>;
}

// Largura máxima enviada ao OCR: fotos de celular são grandes; reduzir (nunca
// ampliar) deixa o tesseract muito mais leve e rápido, sem estourar memória.
const LARGURA_MAX = 1300;
// Tempo máximo por leitura: se travar, devolve vazio e o app cai no manual.
const TIMEOUT_MS = 25000;

// Um único worker do tesseract, criado sob demanda e reaproveitado entre as
// requisições (criar/derrubar a cada leitura era caro e congestionava o
// servidor). As leituras são serializadas (o tesseract processa uma por vez).
let workerPromise: Promise<Worker> | null = null;

async function obterWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker('por');
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return w;
    })();
  }
  return workerPromise;
}

// Fila que serializa as leituras: garante que só um OCR roda por vez (evita
// vários trabalhos pesados ao mesmo tempo derrubarem a instância).
let fila: Promise<unknown> = Promise.resolve();
function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = fila.then(tarefa, tarefa);
  fila = resultado.then(
    () => undefined,
    () => undefined,
  );
  return resultado;
}

/**
 * Implementação com OCR no **nosso próprio servidor** (tesseract.js, sem
 * serviços de terceiros) — usada pela versão WEB. No app Android, o texto é
 * lido no aparelho (ML Kit) e enviado já pronto, sem passar por aqui.
 *
 * A imagem é **reduzida** e pré-tratada (cinza/contraste/normalização) antes do
 * OCR, um **único worker é reaproveitado** e as leituras são **serializadas** —
 * isso mantém o servidor leve e evita congestionamento.
 */
@Injectable()
export class OcrServidorService extends LeitorComprovanteService {
  private readonly logger = new Logger(OcrServidorService.name);

  async extrairTexto(imagemBase64: string): Promise<string> {
    const base64 = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const preparada = await this.prepararImagem(buffer);

    return enfileirar(() =>
      this.comTimeout(
        (async () => {
          try {
            const worker = await obterWorker();
            const { data } = await worker.recognize(preparada);
            return data.text ?? '';
          } catch (e) {
            this.logger.error(`Falha no OCR do comprovante: ${String(e)}`);
            return '';
          }
        })(),
      ),
    );
  }

  /** Devolve vazio se a leitura passar do tempo limite (não trava a request). */
  private comTimeout(promessa: Promise<string>): Promise<string> {
    return Promise.race([
      promessa,
      new Promise<string>((resolver) => {
        setTimeout(() => {
          this.logger.warn('OCR do comprovante excedeu o tempo limite.');
          resolver('');
        }, TIMEOUT_MS);
      }),
    ]);
  }

  /**
   * Deixa a imagem mais leve e legível para o OCR: **reduz** fotos grandes
   * (nunca amplia), converte para tons de cinza, normaliza e dá contraste.
   * Sai em JPEG (mais leve que PNG). Se algo falhar, usa a imagem original.
   */
  private async prepararImagem(buffer: Buffer): Promise<Buffer> {
    try {
      const img = await Jimp.read(buffer);
      if (img.getWidth() > LARGURA_MAX || img.getHeight() > LARGURA_MAX) {
        img.scaleToFit(LARGURA_MAX, LARGURA_MAX);
      }
      img.greyscale().normalize().contrast(0.2);
      return await img.getBufferAsync(Jimp.MIME_JPEG);
    } catch (e) {
      this.logger.warn(`Pré-tratamento da imagem falhou: ${String(e)}`);
      return buffer;
    }
  }
}
