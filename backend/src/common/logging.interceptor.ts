import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/** Contrato mínimo da requisição lido pelo interceptor (evita @types/express). */
interface RequisicaoLog {
  method: string;
  url: string;
  originalUrl?: string;
  correlationId?: string;
}

/** Contrato mínimo da resposta lida pelo interceptor. */
interface RespostaLog {
  statusCode: number;
}

/**
 * Interceptor de observabilidade: registra UMA linha por requisição HTTP após
 * a conclusão, no formato:
 *   `${method} ${url} ${statusCode} ${durationMs}ms [${correlationId}]`.
 *
 * Não registra corpos de requisição/resposta (privacidade) e é não-lançante:
 * qualquer falha ao logar é silenciada para não afetar o fluxo da resposta.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const inicio = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest<RequisicaoLog>();
    const res = http.getResponse<RespostaLog>();
    const method = req.method;
    const url = req.originalUrl ?? req.url;
    const correlationId = req.correlationId ?? '-';

    return next.handle().pipe(
      tap({
        next: () =>
          this.registrar(method, url, res.statusCode, inicio, correlationId),
        error: () =>
          this.registrar(method, url, res.statusCode, inicio, correlationId),
      }),
    );
  }

  private registrar(
    method: string,
    url: string,
    statusCode: number,
    inicio: number,
    correlationId: string,
  ): void {
    try {
      const durationMs = Date.now() - inicio;
      this.logger.log(
        `${method} ${url} ${statusCode} ${durationMs}ms [${correlationId}]`,
      );
    } catch {
      // Observabilidade nunca deve derrubar a requisição.
    }
  }
}
