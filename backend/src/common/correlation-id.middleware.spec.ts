import {
  CORRELATION_ID_HEADER,
  CorrelationIdMiddleware,
} from './correlation-id.middleware';

/**
 * Testes do middleware de correlação: gera um id quando o header está ausente,
 * reaproveita o header quando presente e sempre o devolve na resposta.
 */
describe('CorrelationIdMiddleware', () => {
  const middleware = new CorrelationIdMiddleware();

  function criarContexto(headers: Record<string, string | string[]> = {}) {
    const req = { headers } as unknown as {
      headers: Record<string, string | string[] | undefined>;
      correlationId?: string;
    };
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as { setHeader: jest.Mock };
    const next = jest.fn();
    return { req, res, next, setHeader };
  }

  it('gera um id quando o header está ausente e o propaga na resposta', () => {
    const { req, res, next, setHeader } = criarContexto();

    middleware.use(req, res, next);

    const id = req.correlationId as string;
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, id);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reaproveita o header x-request-id quando presente', () => {
    const { req, res, next, setHeader } = criarContexto({
      [CORRELATION_ID_HEADER]: 'id-do-cliente',
    });

    middleware.use(req, res, next);

    expect(req.correlationId).toBe('id-do-cliente');
    expect(setHeader).toHaveBeenCalledWith(
      CORRELATION_ID_HEADER,
      'id-do-cliente',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('gera um id quando o header presente está vazio', () => {
    const { req, res, next, setHeader } = criarContexto({
      [CORRELATION_ID_HEADER]: '   ',
    });

    middleware.use(req, res, next);

    const id = req.correlationId as string;
    expect(id.trim().length).toBeGreaterThan(0);
    expect(id).not.toBe('   ');
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, id);
  });
});
