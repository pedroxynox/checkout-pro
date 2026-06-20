import { FiscaisController } from './fiscais.controller';
import { CheckInAtivoError } from './fiscais.errors';
import { FiscaisService } from './fiscais.service';

/**
 * Testes de exemplo do `FiscaisController` (Tarefa 13.2): alteração de status
 * (Req 4.1) e propagação de erro de check-in duplicado (Req 4.2.3).
 */
describe('FiscaisController', () => {
  it('altera o status do fiscal delegando ao serviço', async () => {
    const alterar = jest
      .fn()
      .mockResolvedValue({ id: 's1', statusAtual: 'EM_INTERVALO' });
    const controller = new FiscaisController({
      alterarStatus: alterar,
    } as unknown as FiscaisService);

    // Gerente desenvolvedor pode alterar o status de qualquer fiscal.
    await controller.alterarStatus('f1', { status: 'EM_INTERVALO' }, {
      sub: 'dev',
      login: '232152',
      perfil: 'GERENTE_DESENVOLVEDOR',
    } as never);

    expect(alterar).toHaveBeenCalledTimes(1);
    expect(alterar.mock.calls[0][0]).toBe('f1');
    expect(alterar.mock.calls[0][1]).toBe('EM_INTERVALO');
  });

  it('recusa alteração de status por quem não é o dono nem desenvolvedor', async () => {
    const controller = new FiscaisController({
      pertenceAoUsuario: jest.fn(() => Promise.resolve(false)),
      alterarStatus: jest.fn(),
    } as unknown as FiscaisService);

    await expect(
      controller.alterarStatus('f1', { status: 'EM_INTERVALO' }, {
        sub: 'g1',
        login: '1',
        perfil: 'GERENTE',
      } as never),
    ).rejects.toBeTruthy();
  });

  it('propaga CheckInAtivoError em check-in duplicado', async () => {
    const controller = new FiscaisController({
      pertenceAoUsuario: jest.fn(() => Promise.resolve(true)),
      checkIn: jest.fn(() => Promise.reject(new CheckInAtivoError('f1'))),
    } as unknown as FiscaisService);

    await expect(
      controller.checkIn('f1', {
        sub: 'u1',
        login: '1',
        perfil: 'FISCAL',
      } as never),
    ).rejects.toBeInstanceOf(CheckInAtivoError);
  });
});
