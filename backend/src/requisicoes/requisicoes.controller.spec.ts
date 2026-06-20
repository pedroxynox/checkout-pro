import { RequisicoesController } from './requisicoes.controller';
import { RequisicoesService } from './requisicoes.service';

/**
 * Testes de delegação do `RequisicoesController`: criação pelo solicitante e
 * decisão (aprovar/negar) repassando o id do decisor autenticado.
 */
describe('RequisicoesController', () => {
  it('cria a requisição com o solicitante autenticado', async () => {
    const criar = jest.fn(() => Promise.resolve({ id: 'r1' } as never));
    const controller = new RequisicoesController({
      criar,
    } as unknown as RequisicoesService);

    await controller.criar(
      { insumoId: 'i1', quantidade: 5, observacao: 'urgente' },
      { sub: 'u1', login: '232150', perfil: 'FISCAL' } as never,
    );
    expect(criar).toHaveBeenCalledWith('i1', 5, 'urgente', 'u1');
  });

  it('aprova repassando o id do decisor', async () => {
    const aprovar = jest.fn(() => Promise.resolve({ id: 'r1' } as never));
    const controller = new RequisicoesController({
      aprovar,
    } as unknown as RequisicoesService);

    await controller.aprovar('r1', {
      sub: 'g1',
      login: '232152',
      perfil: 'GERENTE',
    } as never);
    expect(aprovar).toHaveBeenCalledWith('r1', 'g1');
  });

  it('nega repassando motivo e id do decisor', async () => {
    const negar = jest.fn(() => Promise.resolve({ id: 'r1' } as never));
    const controller = new RequisicoesController({
      negar,
    } as unknown as RequisicoesService);

    await controller.negar('r1', { motivo: 'sem estoque' }, {
      sub: 's1',
      login: '111',
      perfil: 'SUPERVISOR',
    } as never);
    expect(negar).toHaveBeenCalledWith('r1', 'sem estoque', 's1');
  });
});
