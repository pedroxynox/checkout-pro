import { FiscaisService } from './fiscais.service';

/**
 * Status ao vivo dos OPERADORES no painel da escala.
 *  - `painel()` inclui operadores (status derivado das batidas do Relógio Ponto);
 *  - `publicarStatusColaborador()` propaga o status pelo mesmo canal WebSocket
 *    dos fiscais, identificado pela ficha canônica (`colaboradorId`).
 */
describe('FiscaisService — status ao vivo de operadores', () => {
  it('painel() inclui operadores com status derivado das batidas', async () => {
    // Batida de entrada há 4h (rótulo de parede), antes do "agora" de Brasília:
    // uma entrada aberta ⇒ jornada TRABALHANDO ⇒ status DISPONIVEL.
    const horaEntrada = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const prisma = {
      fiscal: { findMany: jest.fn().mockResolvedValue([]) },
      registroPontoFiscal: { findMany: jest.fn().mockResolvedValue([]) },
      usuario: { findMany: jest.fn().mockResolvedValue([]) },
      colaborador: {
        // mapaColaboradores pede funcao FISCAL; jornadaOperadoresDoDia pede
        // funcao IN [...] (objeto). Só o segundo caso devolve o operador.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            where?.funcao === 'FISCAL'
              ? []
              : [{ id: 'op1', nome: 'Ana Operadora', funcao: 'OPERADOR' }],
          ),
        ),
      },
      batidaPonto: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findMany: jest.fn(({ where }: any) =>
          Promise.resolve(
            where?.tipoPessoa === 'OPERADOR'
              ? [{ id: 'b1', pessoaId: 'op1', hora: horaEntrada }]
              : [],
          ),
        ),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new FiscaisService(prisma as any);
    const painel = await service.painel();

    const op = painel.find((p) => p.colaboradorId === 'op1');
    expect(op).toBeDefined();
    expect(op?.tipoPessoa).toBe('OPERADOR');
    expect(op?.status).toBe('DISPONIVEL');
  });

  it('publicarStatusColaborador emite o evento pela ficha canônica', async () => {
    const publicar = jest.fn();
    const prisma = {
      colaborador: {
        findUnique: jest.fn().mockResolvedValue({ nome: 'Ana Operadora' }),
      },
    };
    const service = new FiscaisService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { publicar } as any,
    );
    await service.publicarStatusColaborador(
      'op1',
      'INTERVALO',
      new Date('2026-07-20T13:00:00.000Z'),
    );
    // Operador não tem fiscalId: usamos o colaboradorId como id do evento.
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({
        fiscalId: 'op1',
        colaboradorId: 'op1',
        status: 'INTERVALO',
        primeiroNome: 'Ana',
      }),
    );
  });
});
