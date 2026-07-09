/**
 * Erros de domínio tipados do Modulo_Checklist. São erros puros (sem dependência
 * do Nest ou do banco) para manter a lógica de domínio testável de forma
 * isolada.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/** Classe base para os erros de domínio do checklist. */
export abstract class ChecklistError extends ErroDominio {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando o arquivo enviado a um checklist não é uma imagem —
 * Requisito 5.1.4. O envio é rejeitado e o status do checklist permanece
 * inalterado.
 */
export class ArquivoNaoImagemError extends ChecklistError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor(tipoArquivo?: string) {
    super(
      tipoArquivo !== undefined
        ? `Apenas imagens são aceitas. Tipo recebido: "${tipoArquivo}".`
        : 'Apenas imagens são aceitas.',
    );
  }
}

/**
 * Lançado ao tentar carregar o checklist de um dia que já passou. Por
 * integridade, o checklist só pode ser enviado no próprio dia — depois que o dia
 * encerra, não é possível preenchê-lo retroativamente.
 */
export class ChecklistDiaPassadoError extends ChecklistError {
  readonly statusHttp = HttpStatus.BAD_REQUEST;
  constructor() {
    super(
      'Este dia já passou. O checklist só pode ser carregado no próprio dia.',
    );
  }
}
