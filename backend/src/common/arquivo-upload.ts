/**
 * Representação mínima de um arquivo recebido por upload (multipart/form-data).
 *
 * Espelha os campos do objeto de arquivo do multer (usado pelo
 * `FileInterceptor` do `@nestjs/platform-express`) sem depender de
 * `@types/multer`, mantendo a tipagem local e estável.
 */
export interface ArquivoUpload {
  /** Nome do campo do formulário. */
  fieldname: string;
  /** Nome original do arquivo enviado pelo cliente. */
  originalname: string;
  /** Tipo MIME informado pelo cliente. */
  mimetype: string;
  /** Tamanho em bytes. */
  size: number;
  /** Conteúdo do arquivo (armazenamento em memória). */
  buffer: Buffer;
}
