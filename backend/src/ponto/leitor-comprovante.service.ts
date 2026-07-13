import { Injectable, Logger } from '@nestjs/common';
import Jimp from 'jimp';
import { createWorker, PSM } from 'tesseract.js';

/**
 * Contrato do leitor do comprovante (OCR): recebe a imagem (base64) e devolve o
 * texto lido. Fica atrás de uma interface para poder trocar a implementação
 * (nosso servidor, nuvem, etc.) sem mexer no resto.
 */
export abstract class LeitorComprovanteService {
  abstract extrairTexto(imagemBase64: string): Promise<string>;
}

/**
 * Implementação com OCR no **nosso próprio servidor** (tesseract.js, sem
 * serviços de terceiros) — usada pela versão WEB. No app Android, o texto é
 * lido no aparelho (ML Kit) e enviado já pronto, sem passar por aqui.
 *
 * Como a foto costuma vir de um papel amassado e com fundo, a imagem é
 * **pré-tratada** (tons de cinza, contraste, normalização e ampliação) antes do
 * OCR, e o tesseract é configurado para ler um bloco de texto (comprovante),
 * o que melhora bastante a leitura na web.
 */
@Injectable()
export class OcrServidorService extends LeitorComprovanteService {
  private readonly logger = new Logger(OcrServidorService.name);

  async extrairTexto(imagemBase64: string): Promise<string> {
    const base64 = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const preparada = await this.prepararImagem(buffer);
    const worker = await createWorker('por');
    try {
      // Bloco único de texto (o comprovante é uma coluna só).
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      const { data } = await worker.recognize(preparada);
      return data.text ?? '';
    } catch (e) {
      this.logger.error(`Falha no OCR do comprovante: ${String(e)}`);
      return '';
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Deixa a imagem mais legível para o OCR: tons de cinza + normalização +
   * contraste, e amplia fotos pequenas. Se algo falhar, usa a imagem original.
   */
  private async prepararImagem(buffer: Buffer): Promise<Buffer> {
    try {
      const img = await Jimp.read(buffer);
      if (img.getWidth() < 1200) img.scale(2);
      img.greyscale().normalize().contrast(0.3);
      return await img.getBufferAsync(Jimp.MIME_PNG);
    } catch (e) {
      this.logger.warn(`Pré-tratamento da imagem falhou: ${String(e)}`);
      return buffer;
    }
  }
}
