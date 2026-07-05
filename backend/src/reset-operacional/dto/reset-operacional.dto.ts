import { IsIn } from 'class-validator';

/**
 * Payload do reinício operacional (Requisito 1.4). O marcador de confirmação
 * explícita precisa ser exatamente `"ZERAR"`; qualquer outro valor (ou ausência
 * do campo) cai como 400 no `ValidationPipe` global, com mensagem em pt-BR.
 */
export class ResetOperacionalDto {
  @IsIn(['ZERAR'], {
    message: 'Confirmação inválida. Envie confirmacao: "ZERAR".',
  })
  confirmacao!: 'ZERAR';
}
