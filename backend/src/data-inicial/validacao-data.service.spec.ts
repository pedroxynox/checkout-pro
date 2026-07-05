import { ValidacaoDataService } from './validacao-data.service';
import { DataInicialService } from './data-inicial.service';
import { ErroDataAnteriorInicial } from './data-inicial.errors';

/**
 * Testes unitários do `ValidacaoDataService` (validação de data mínima
 * compartilhada usada por arrecadação, vendas, ausências, incidências, ponto e
 * checklist). Mocka `DataInicialService.obterData` para 2026-07-01 e verifica a
 * fronteira: data anterior lança `ErroDataAnteriorInicial` (400); data igual ou
 * posterior prossegue.
 *
 * Requisitos 6.1, 6.2, 6.4.
 */
describe('ValidacaoDataService', () => {
  const INICIAL = new Date('2026-07-01T00:00:00.000Z');

  function criar(): ValidacaoDataService {
    const dataInicialFake = {
      obterData: () => Promise.resolve(INICIAL),
    } as unknown as DataInicialService;
    return new ValidacaoDataService(dataInicialFake);
  }

  it('rejeita data anterior à inicial com ErroDataAnteriorInicial (400)', async () => {
    const service = criar();
    await expect(
      service.exigirDataPermitida(new Date('2026-06-30T23:59:59.999Z')),
    ).rejects.toBeInstanceOf(ErroDataAnteriorInicial);
    try {
      await service.exigirDataPermitida(new Date('2026-06-30T00:00:00.000Z'));
      fail('deveria ter lançado');
    } catch (e) {
      expect((e as ErroDataAnteriorInicial).statusHttp).toBe(400);
      expect((e as ErroDataAnteriorInicial).message).toContain('01/07/2026');
    }
  });

  it('aceita a data igual à inicial (fronteira permitida)', async () => {
    const service = criar();
    await expect(
      service.exigirDataPermitida(new Date('2026-07-01T09:00:00.000Z')),
    ).resolves.toBeUndefined();
  });

  it('aceita data posterior à inicial', async () => {
    const service = criar();
    await expect(
      service.exigirDataPermitida(new Date('2026-08-15T00:00:00.000Z')),
    ).resolves.toBeUndefined();
  });
});
