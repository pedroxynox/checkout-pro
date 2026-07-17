import { EscalaService } from './escala.service';

/**
 * Um fiscal INATIVADO (desligado do quadro) não deve aparecer nem ser contado
 * na escala — mesmo quando sua conta de acesso foi desvinculada e ele apareceria
 * como "sem ficha". O vínculo gravado na própria escala (colaboradorId) é usado
 * para reconhecer o inativo de forma confiável.
 */
describe('EscalaService.escalaConsolidada — exclui inativos "sem ficha"', () => {
  function entry(over: {
    funcionarioId: string;
    colaboradorId: string | null;
  }) {
    return {
      id: `e-${over.funcionarioId}`,
      funcionarioId: over.funcionarioId,
      colaboradorId: over.colaboradorId,
      diaSemana: 1,
      entrada: '08:00',
      saida: '16:00',
      intervaloMin: 60,
      folga: false,
      especial: false,
    };
  }

  function servico(opts: {
    entries: ReturnType<typeof entry>[];
    fiscais: { id: string; nome: string; usuarioId: string | null }[];
    colaboradores: {
      id: string;
      nome: string;
      matricula: string;
      usuarioId: string | null;
      ativo: boolean;
    }[];
  }): EscalaService {
    const prisma = {
      escalaEntry: {
        findMany: ({ where }: { where: { diaSemana: number } }) =>
          Promise.resolve(
            opts.entries.filter((e) => e.diaSemana === where.diaSemana),
          ),
      },
      fiscal: { findMany: () => Promise.resolve(opts.fiscais) },
      usuario: { findMany: () => Promise.resolve([]) },
      colaborador: { findMany: () => Promise.resolve(opts.colaboradores) },
    };
    return new EscalaService(prisma as never);
  }

  it('remove o fiscal inativo mesmo sem vínculo de conta (apareceria "sem ficha")', async () => {
    const service = servico({
      entries: [
        entry({ funcionarioId: 'fisc-raquel', colaboradorId: 'colab-raquel' }),
        entry({ funcionarioId: 'fisc-ana', colaboradorId: 'colab-ana' }),
      ],
      // Conta de acesso desvinculada (usuarioId null) → mapaCol não resolve.
      fiscais: [
        {
          id: 'fisc-raquel',
          nome: 'Raquel Silva de Oliveira',
          usuarioId: null,
        },
        { id: 'fisc-ana', nome: 'Ana Souza', usuarioId: null },
      ],
      colaboradores: [
        {
          id: 'colab-raquel',
          nome: 'Raquel Silva de Oliveira',
          matricula: '900010',
          usuarioId: null,
          ativo: false,
        },
        {
          id: 'colab-ana',
          nome: 'Ana Souza',
          matricula: '900011',
          usuarioId: null,
          ativo: true,
        },
      ],
    });

    const escala = await service.escalaConsolidada(1);
    const ids = escala.map((i) => i.funcionarioId);
    expect(ids).toContain('fisc-ana'); // ativa permanece
    expect(ids).not.toContain('fisc-raquel'); // inativa some do quadro
  });
});
