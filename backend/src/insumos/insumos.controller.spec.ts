import { CategoriaInsumo } from '@prisma/client';
import { UsuarioAutenticado } from '../common/decorators/usuario-atual.decorator';
import { InsumosController } from './insumos.controller';
import { FardoNaoReconhecidoError } from './insumos.errors';
import { InsumosService } from './insumos.service';

/**
 * Testes de exemplo do `InsumosController` (Tarefa 13.2): retirada de fardo
 * (Req 3.1) e propagação de erro de fardo não reconhecido (Req 3.1.3).
 */
describe('InsumosController', () => {
  const usuario: UsuarioAutenticado = {
    sub: 'u1',
    login: 'fiscal',
    perfil: 'FISCAL',
  };

  it('registra retirada de fardo retornando o novo saldo', async () => {
    const registrar = jest.fn().mockResolvedValue(90);
    const controller = new InsumosController({
      registrarRetiradaFardo: registrar,
    } as unknown as InsumosService);

    const resultado = await controller.retirarFardo(
      { codigoBarras: '789', insumoId: 'i1' },
      usuario,
    );

    expect(resultado).toEqual({ saldo: 90 });
    expect(registrar.mock.calls[0][0]).toMatchObject({
      codigoBarras: '789',
      insumoId: 'i1',
      responsavelId: 'u1',
    });
  });

  it('propaga FardoNaoReconhecidoError para código inexistente', async () => {
    const controller = new InsumosController({
      registrarRetiradaFardo: jest.fn(() =>
        Promise.reject(new FardoNaoReconhecidoError('000')),
      ),
    } as unknown as InsumosService);

    await expect(
      controller.retirarFardo({ codigoBarras: '000', insumoId: 'i1' }, usuario),
    ).rejects.toBeInstanceOf(FardoNaoReconhecidoError);
  });

  it('cadastra um insumo com categoria e limite mínimo', async () => {
    const cadastrar = jest.fn(() =>
      Promise.resolve({ id: 'i1', nome: 'Bobina' } as never),
    );
    const controller = new InsumosController({
      cadastrarInsumo: cadastrar,
    } as unknown as InsumosService);

    await controller.cadastrar({
      nome: 'Bobina',
      categoria: CategoriaInsumo.BOBINA,
      limiteMinimo: 5,
    });

    expect(cadastrar).toHaveBeenCalledWith('Bobina', 'BOBINA', 5, 0);
  });
});
