import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErroDominio } from '../errors/erro-dominio';

/**
 * Filtro global de exceções (Tarefa 13). Traduz os erros de domínio tipados
 * (puros, lançados pelos serviços) em respostas HTTP com o status adequado e
 * mensagem em Português. Cada erro de domínio declara o próprio status em
 * `statusHttp` (ver `ErroDominio`), eliminando o mapa central manual — um erro
 * novo nunca cai em 500 por esquecimento. Exceções HTTP do Nest (ex.:
 * `NotFoundException`, `UnauthorizedException`, erros de validação de DTO) são
 * repassadas como estão. Qualquer outro erro vira 500 sem vazar detalhes
 * internos.
 */
@Catch()
export class DominioExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DominioExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const request = ctx.getRequest<{ url?: string }>();

    // Exceções HTTP nativas do Nest: preserva status e corpo.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(this.corpo(status, exception.getResponse()));
      return;
    }

    // Erros de domínio: cada um declara o próprio status HTTP.
    if (exception instanceof ErroDominio) {
      response
        .status(exception.statusHttp)
        .json(this.corpo(exception.statusHttp, exception.message));
      return;
    }

    // Desconhecido: 500 sem vazar detalhes.
    this.logger.error(
      `Erro não tratado em ${request?.url ?? 'rota desconhecida'}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        this.corpo(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Erro interno do servidor.',
        ),
      );
  }

  /** Normaliza o corpo da resposta de erro. */
  private corpo(
    status: number,
    detalhe: unknown,
  ): { statusCode: number; mensagem: unknown } {
    // `getResponse()` do Nest pode ser string ou objeto { message, ... }.
    if (detalhe && typeof detalhe === 'object' && 'message' in detalhe) {
      return {
        statusCode: status,
        mensagem: (detalhe as { message: unknown }).message,
      };
    }
    return { statusCode: status, mensagem: detalhe };
  }
}
