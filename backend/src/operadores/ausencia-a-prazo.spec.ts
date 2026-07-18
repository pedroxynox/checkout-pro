import { OperadoresService } from './operadores.service';
import { AusenciaAPrazoProtegidaError } from './operadores.errors';

/**
 * Ausência a prazo (período do gestor): um FISCAL não pode desmarcar esses dias
 * na escala. Só gerente/supervisor/administrador podem remover.
 */
describe('OperadoresService.removerAusencia — ausência a prazo', () => {
  function criarServico(ausencia: { id: string; aPrazo: boolean }) {
    const removidas: string[] = [];
    const prismaFake = {
      ausencia: {
        findUnique: ({ where: { id } }: { where: { id: string } }) =>
          Promise.resolve(
            id === ausencia.id
              ? { data: new Date('2026-07-10'), aPrazo: ausencia.aPrazo }
              : null,
          ),
        delete: ({ where: { id } }: { where: { id: string } }) => {
          removidas.push(id);
          return Promise.resolve({});
        },
      },
    };
    const service = new OperadoresService(
      prismaFake as never,
      undefined,
      undefined,
      undefined,
    );
    return { service, removidas };
  }

  it('bloqueia o FISCAL de remover uma falta a prazo', async () => {
    const { service, removidas } = criarServico({ id: 'a1', aPrazo: true });
    await expect(
      service.removerAusencia('a1', 'FISCAL'),
    ).rejects.toBeInstanceOf(AusenciaAPrazoProtegidaError);
    expect(removidas).toEqual([]); // nada foi removido
  });

  it('permite o SUPERVISOR remover uma falta a prazo', async () => {
    const { service, removidas } = criarServico({ id: 'a1', aPrazo: true });
    await service.removerAusencia('a1', 'SUPERVISOR');
    expect(removidas).toEqual(['a1']);
  });

  it('o FISCAL ainda pode remover uma falta comum (não a prazo)', async () => {
    const { service, removidas } = criarServico({ id: 'a2', aPrazo: false });
    await service.removerAusencia('a2', 'FISCAL');
    expect(removidas).toEqual(['a2']);
  });
});
