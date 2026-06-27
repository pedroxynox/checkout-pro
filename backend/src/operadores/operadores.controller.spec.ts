import { OperadoresController } from './operadores.controller';
import { OperadoresService } from './operadores.service';

/**
 * Testes de exemplo do `OperadoresController`: contagem por turno (Req 6.6). O
 * cadastro de operador pelo model simples `Operador` foi removido — operadores
 * agora são pessoas do Cadastro Unificado de Colaboradores.
 */
describe('OperadoresController', () => {
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
