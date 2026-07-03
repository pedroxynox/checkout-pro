import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

/** Nome do header usado para propagar o id de correlação da requisição. */
export const CORRELATION_ID_HEADER = 'x-request-id';

/** Contrato mínimo da requisição usado pelo middleware (evita depender de @types/express). */
interface RequisicaoComCorrelacao {
  headers: Record<string, string | string[] | undefined>;
  correlationId?: string;
}

/** Contrato mínimo da resposta usado pelo middleware. */
interface RespostaComHeader {
  setHeader(nome: string, valor: string): unknown;
}

/**
 * Middleware de observabilidade: garante que toda requisição tenha um id de
 * correlação. Reaproveita o header `x-request-id` quando o cliente/proxy já o
 * enviou; caso contrário, gera um novo (`crypto.randomUUID()`). O id é anexado
 * ao objeto `req` (`req.correlationId`) para uso no log e devolvido no header
 * de resposta `x-request-id`, permitindo rastrear a requisição ponta a ponta.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(
    req: RequisicaoComCorrelacao,
    res: RespostaComHeader,
    next: () => void,
  ): void {
    const bruto = req.headers[CORRELATION_ID_HEADER];
    const enviado = Array.isArray(bruto) ? bruto[0] : bruto;
    const correlationId =
      typeof enviado === 'string' && enviado.trim().length > 0
        ? enviado
        : randomUUID();

    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
