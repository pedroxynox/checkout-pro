/**
 * Erros de domínio tipados do Modulo_ResetOperacional.
 *
 * Estende `ErroDominio` (cada erro declara o próprio `statusHttp`); o filtro
 * global mapeia para a resposta HTTP com mensagem em pt-BR.
 */
import { HttpStatus } from '@nestjs/common';
import { ErroDominio } from '../common/errors/erro-dominio';

/**
 * Lançado quando o reinício é solicitado sem o marcador de confirmação
 * explícita (`confirmacao: "ZERAR"`) — Requisito 1.4. Defesa em profundidade:
 * o `ValidationPipe` global já barra o DTO inválido, e o service revalida.
 */
export class ConfirmacaoAusenteError extends ErroDominio {
  readonly statusHttp = HttpStatus.BAD_REQUEST; // 400

  constructor() {
    super(
      'Confirmação obrigatória ausente. Envie confirmacao: "ZERAR" para reiniciar os dados operacionais.',
    );
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
