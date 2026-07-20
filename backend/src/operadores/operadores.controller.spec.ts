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

  describe('excluir falta (removerAusencia) — restrito à gestão', () => {
    function criar() {
      const removerAusencia = jest.fn().mockResolvedValue(undefined);
      const controller = new OperadoresController({
        removerAusencia,
      } as unknown as OperadoresService);
      return { controller, removerAusencia };
    }

    it('bloqueia o FISCAL de excluir uma falta', async () => {
      const { controller, removerAusencia } = criar();
      await expect(
        controller.removerAusencia('a1', { perfil: 'FISCAL' } as never),
      ).rejects.toMatchObject({ status: 403 });
      expect(removerAusencia).not.toHaveBeenCalled();
    });

    it('permite gerente/supervisor/administrador excluir', async () => {
      for (const perfil of ['GERENTE', 'SUPERVISOR', 'ADMINISTRADOR']) {
        const { controller, removerAusencia } = criar();
        await controller.removerAusencia('a1', { perfil } as never);
        expect(removerAusencia).toHaveBeenCalledWith('a1', perfil);
      }
    });
  });
});
