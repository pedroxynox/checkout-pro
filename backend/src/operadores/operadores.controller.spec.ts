import { OperadoresController } from './operadores.controller';
import { NomeDuplicadoError } from './operadores.errors';
import { OperadoresService } from './operadores.service';

/**
 * Testes de exemplo do `OperadoresController` (Tarefa 13.2): cadastro de
 * operador (Req 6.1), contagem por turno (Req 6.6) e propagação de erro de
 * unicidade (Req 6.1.3).
 */
describe('OperadoresController', () => {
  it('cadastra operador delegando ao serviço', async () => {
    const cadastrar = jest.fn(() =>
      Promise.resolve({ id: 'o1', nome: 'Ana' } as never),
    );
    const controller = new OperadoresController({
      cadastrar,
    } as unknown as OperadoresService);

    const operador = await controller.cadastrar({ nome: 'Ana' });

    expect(cadastrar).toHaveBeenCalledWith('Ana');
    expect(operador).toMatchObject({ nome: 'Ana' });
  });

  it('propaga NomeDuplicadoError em nome repetido', async () => {
    const controller = new OperadoresController({
      cadastrar: jest.fn(() => Promise.reject(new NomeDuplicadoError('Ana'))),
    } as unknown as OperadoresService);

    await expect(controller.cadastrar({ nome: 'Ana' })).rejects.toBeInstanceOf(
      NomeDuplicadoError,
    );
  });

  it('converte o DTO de contagem por turno e delega ao serviço', () => {
    const contagemPorTurno = jest.fn(() => ({
      abertura: 1,
      intermediario: 0,
      fechamento: 1,
      total: 2,
    }));
    const controller = new OperadoresController({
      contagemPorTurno,
    } as unknown as OperadoresService);

    const resultado = controller.contagemPorTurno({
      operadores: [
        { operadorId: 'a', entrada: '08:00' },
        { operadorId: 'b', entrada: '13:30' },
        { operadorId: 'c', entrada: null, folga: true },
      ],
    });

    expect(resultado.total).toBe(2);
    expect(contagemPorTurno).toHaveBeenCalledTimes(1);
  });
});
