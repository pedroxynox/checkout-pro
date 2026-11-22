import { REGRAS_PADRAO, RegrasContrato } from '../ponto/ponto.domain';
import { PontoService } from './ponto.service';

/**
 * O ponto calcula cada dia com o contrato DAQUELE dia (spec `jornada-5x2`, ADR
 * 0027): corrigir hoje uma batida de 20/11 tem de usar o 6x1, e uma de 25/11, o
 * contrato novo. O serviço de contratos decide qual vale; aqui provamos que o
 * ponto pergunta pelo dia certo e usa a resposta.
 */
describe('PontoService — contrato do dia', () => {
  const REGRAS_5X2: RegrasContrato = {
    ...REGRAS_PADRAO,
    cargaBaseMs: () => 528 * 60_000,
  };
  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-26T15:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  function montar() {
    const batidas = (iso: string) =>
      ['06:00', '10:00', '12:00', '16:48'].map((h, i) => ({
        id: `${iso}-${i}`,
        pessoaId: 'c1',
        tipoPessoa: 'OPERADOR',
        colaboradorId: 'c1',
        data: dia(iso),
        hora: new Date(`${iso}T${h}:00.000Z`),
        tipo: 'ENTRADA',
        origem: 'MANUAL',
        registradoPorNome: null,
      }));
    const prisma = {
      colaborador: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          ativo: true,
          funcao: 'OPERADOR',
        }),
      },
      batidaPonto: {
        findMany: jest.fn(({ where }: { where: { data: Date } }) =>
          Promise.resolve(batidas(where.data.toISOString().slice(0, 10))),
        ),
      },
    };
    // Corte em 23/11: antes, 6x1; a partir dele, 5x2.
    const tiposContrato = {
      regrasDoColaborador: jest.fn((_: string, d: Date) =>
        Promise.resolve(d >= dia('2026-11-23') ? REGRAS_5X2 : REGRAS_PADRAO),
      ),
    };
    // Ordem: prisma, validacaoData, fiscais, ocr, notificacoes, feriados,
    // escalaDomingo, cicloFolha, tiposContrato.
    const service = new PontoService(
      prisma as never,
      { exigirDataPermitida: jest.fn() } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tiposContrato as never,
    );
    return { service, tiposContrato };
  }

  it('pergunta pelo contrato do dia das batidas e calcula com ele', async () => {
    const { service, tiposContrato } = montar();
    // Sexta 20/11 (6x1, carga 8h): 8h48 trabalhadas → 48 min de extra.
    const antes = await service.jornadaDoDia(
      'c1',
      'OPERADOR',
      dia('2026-11-20'),
    );
    expect(tiposContrato.regrasDoColaborador).toHaveBeenLastCalledWith(
      'c1',
      dia('2026-11-20'),
    );
    expect(antes.jornada.baseMs).toBe(8 * 3_600_000);
    expect(antes.jornada.horasExtrasMs).toBe(48 * 60_000);

    // Quarta 25/11 (5x2, carga 8h48): as mesmas 8h48 → nada de extra.
    const depois = await service.jornadaDoDia(
      'c1',
      'OPERADOR',
      dia('2026-11-25'),
    );
    expect(tiposContrato.regrasDoColaborador).toHaveBeenLastCalledWith(
      'c1',
      dia('2026-11-25'),
    );
    expect(depois.jornada.baseMs).toBe(528 * 60_000);
    expect(depois.jornada.horasExtrasMs).toBe(0);
  });
});
