import { LoteApaeController } from './lote-apae.controller';
import { SaldoInvalidoError } from './lote-apae.errors';
import { LoteApaeService } from './lote-apae.service';

/**
 * Testes de exemplo do `LoteApaeController` (Tarefa 13.2): registro de lote
 * (Req 2.6.1) e propagação de erro de atualização inválida de saldo (Req 2.6.4).
 */
describe('LoteApaeController', () => {
  it('registra um lote inicial delegando ao serviço', async () => {
    const registrar = jest.fn(() =>
      Promise.resolve({ id: 'l1', quantidadeInicial: 100 } as never),
    );
    const controller = new LoteApaeController({
      registrarLoteInicial: registrar,
    } as unknown as LoteApaeService);

    await controller.registrarLoteInicial({ quantidadeInicial: 100 });
    expect(registrar).toHaveBeenCalledWith(100);
  });

  it('propaga SaldoInvalidoError ao atualizar com saldo maior que o anterior', async () => {
    const controller = new LoteApaeController({
      atualizarSaldo: jest.fn(() =>
        Promise.reject(new SaldoInvalidoError(10, 5)),
      ),
    } as unknown as LoteApaeService);

    await expect(
      controller.atualizarSaldo('l1', { saldoAtual: 10 }),
    ).rejects.toBeInstanceOf(SaldoInvalidoError);
  });

  it('retorna o lote ativo delegando ao serviço', async () => {
    const loteAtivo = jest.fn(() =>
      Promise.resolve({ id: 'l1', status: 'ABERTO' } as never),
    );
    const controller = new LoteApaeController({
      loteAtivo,
    } as unknown as LoteApaeService);

    const ativo = await controller.ativo();
    expect(loteAtivo).toHaveBeenCalled();
    expect(ativo).toEqual({ id: 'l1', status: 'ABERTO' });
  });

  it('limpa o histórico delegando ao serviço', async () => {
    const limparHistorico = jest.fn(() => Promise.resolve(3));
    const controller = new LoteApaeController({
      limparHistorico,
    } as unknown as LoteApaeService);

    const resultado = await controller.limparHistorico();
    expect(limparHistorico).toHaveBeenCalled();
    expect(resultado).toEqual({ removidos: 3 });
  });
});
