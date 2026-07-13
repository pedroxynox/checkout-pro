import { Injectable, Logger } from '@nestjs/common';
import { createWorker } from 'tesseract.js';

/**
 * Contrato do leitor do papelito (OCR): recebe a imagem (base64) e devolve o
 * texto lido. Fica atrás de uma interface para poder trocar a implementação
 * (nosso servidor, nuvem, etc.) sem mexer no resto.
 */
export abstract class LeitorPapelitoService {
  abstract extrairTexto(imagemBase64: string): Promise<string>;
}

/**
 * Implementação com OCR no **nosso próprio servidor** (tesseract.js, sem
 * serviços de terceiros) — usada pela versão WEB. No app Android, o texto é
 * lido no aparelho (ML Kit) e enviado já pronto, sem passar por aqui.
 */
@Injectable()
export class OcrServidorService extends LeitorPapelitoService {
  private readonly logger = new Logger(OcrServidorService.name);

  async extrairTexto(imagemBase64: string): Promise<string> {
    const base64 = imagemBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const worker = await createWorker('por');
    try {
      const { data } = await worker.recognize(buffer);
      return data.text ?? '';
    } catch (e) {
      this.logger.error(`Falha no OCR do papelito: ${String(e)}`);
      return '';
    } finally {
      await worker.terminate();
    }
  }
}
