import { FiscaisController } from './fiscais.controller';
import { FiscalNaoEncontradoError } from './fiscais.errors';
import { FiscaisService } from './fiscais.service';

/**
 * Testes do `FiscaisController` (controle de jornada): o fiscal define o
 * próprio status e informa falta (auto-identificado pelo login); erro quando o
 * usuário não é fiscal; e o log de jornada delega ao serviço.
 */
describe('FiscaisController', () => {
  const usuarioFiscal = { sub: 'u1', login: '1', perfil: 'FISCAL' } as never;

  it('define o status do próprio fiscal (auto-identificado pelo login)', async () => {
    const meuFiscal = jest.fn().mockResolvedValue({ id: 'f1', nome: 'Karen' });
    const definirStatus = jest.fn().mockResolvedValue({
      fiscalId: 'f1',
      primeiroNome: 'Karen',
      status: 'INTERVALO',
      em: '2024-03-10T10:00:00.000Z',
    });
    const controller = new FiscaisController({
      meuFiscal,
      definirStatus,
    } as unknown as FiscaisService);

    await controller.definirMeuStatus({ status: 'INTERVALO' }, usuarioFiscal);

    expect(meuFiscal).toHaveBeenCalledWith('u1');
    expect(definirStatus).toHaveBeenCalledWith('f1', 'INTERVALO');
  });

  it('informa a falta do próprio fiscal no dia', async () => {
    const meuFiscal = jest.fn().mockResolvedValue({ id: 'f1' });
    const registrarFalta = jest.fn().mockResolvedValue(undefined);
    const controller = new FiscaisController({
      meuFiscal,
      registrarFalta,
    } as unknown as FiscaisService);

    await controller.informarFalta(usuarioFiscal);

    expect(registrarFalta).toHaveBeenCalledWith('f1');
  });

  it('propaga erro quando o usuário autenticado não é fiscal', async () => {
    const meuFiscal = jest
      .fn()
      .mockRejectedValue(new FiscalNaoEncontradoError());
    const controller = new FiscaisController({
      meuFiscal,
    } as unknown as FiscaisService);

    await expect(
      controller.definirMeuStatus({ status: 'DISPONIVEL' }, {
        sub: 'g1',
        login: '2',
        perfil: 'GERENTE',
      } as never),
    ).rejects.toBeInstanceOf(FiscalNaoEncontradoError);
  });

  it('retorna o log de jornada do dia delegando ao serviço', async () => {
    const jornadaDoDia = jest.fn().mockResolvedValue([{ fiscalId: 'f1' }]);
    const controller = new FiscaisController({
      jornadaDoDia,
    } as unknown as FiscaisService);

    await controller.jornada('2024-03-10');

    expect(jornadaDoDia).toHaveBeenCalledTimes(1);
    expect(jornadaDoDia.mock.calls[0][0]).toBeInstanceOf(Date);
  });
});
