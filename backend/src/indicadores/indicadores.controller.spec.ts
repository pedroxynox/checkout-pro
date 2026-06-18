import { IndicadoresController } from './indicadores.controller';
import { ConfigIndicador } from './indicadores.domain';
import { IndicadoresService } from './indicadores.service';
import { ValorVendaInvalidoError } from './indicadores.errors';

/**
 * Testes de exemplo do `IndicadoresController` (Tarefa 13.2): percentual e cor
 * (Req 2.2/2.3), e propagação de erro de venda inválida (Req 2.1.4).
 */
describe('IndicadoresController', () => {
  const configPadraoFake = (): ConfigIndicador => ({
    meta: 0.75,
    limiteAmarelo: 1,
    sentido: 'MENOR_MELHOR',
  });

  function controllerCom(overrides: Partial<IndicadoresService>) {
    return new IndicadoresController({
      configPadrao: configPadraoFake,
      ...overrides,
    } as unknown as IndicadoresService);
  }

  it('calcula o percentual delegando ao serviço', () => {
    const controller = controllerCom({
      percentual: jest.fn(() => 1.5),
    });
    expect(
      controller.percentual({ totalIndicador: 15, totalVendas: 1000 }),
    ).toEqual({ percentual: 1.5 });
  });

  it('classifica a cor de um indicador', () => {
    const controller = controllerCom({
      statusCor: jest.fn(() => 'VERDE'),
    });
    const resultado = controller.cor({
      indicador: 'CANCELAMENTO',
      valor: 0.5,
      limiteAmarelo: 1,
    });
    expect(resultado).toEqual({ cor: 'VERDE' });
  });

  it('propaga ValorVendaInvalidoError ao registrar venda negativa', async () => {
    const controller = controllerCom({
      registrarVenda: jest.fn(() =>
        Promise.reject(new ValorVendaInvalidoError(-1)),
      ),
    });
    await expect(
      controller.registrarVenda({ data: '2024-03-10', valor: -1 }),
    ).rejects.toBeInstanceOf(ValorVendaInvalidoError);
  });
});
