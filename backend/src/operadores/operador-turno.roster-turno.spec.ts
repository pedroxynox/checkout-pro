import { OperadorTurnoService } from './operador-turno.service';

/**
 * O roster do dia (`diaOperadores`) deve expor o TURNO vindo do Cadastro de
 * cada colaborador (fonte oficial para agrupar a escala). Quando o colaborador
 * ainda não tem turno definido, o roster devolve `turno: null`.
 */
describe('OperadorTurnoService.diaOperadores — turno do cadastro', () => {
  function colab(over: {
    id: string;
    nome: string;
    turno: string | null;
  }): Record<string, unknown> {
    return {
      id: over.id,
      nome: over.nome,
      genero: 'F',
      turno: over.turno,
      entradaSemana: '08:00',
      saidaSemana: '16:00',
      entradaFds: '08:00',
      saidaFds: '16:00',
      // -1 nunca casa um dia da semana (nunca folga), para simplificar o teste.
      folgaDiaSemana: -1,
      ativo: true,
      criadoEm: new Date(),
    };
  }

  function servico(colaboradores: Record<string, unknown>[]) {
    const prismaFake = {
      colaborador: {
        findMany: () => Promise.resolve(colaboradores),
      },
      ausencia: {
        findMany: () => Promise.resolve([]),
      },
    };
    return new OperadorTurnoService(prismaFake as never);
  }

  it('propaga o turno do cadastro para cada linha do roster', async () => {
    const service = servico([
      colab({ id: 'c1', nome: 'Sheila', turno: 'FECHAMENTO' }),
      colab({ id: 'c2', nome: 'Ana', turno: 'ABERTURA' }),
    ]);
    // Quarta-feira (dia útil, não é domingo nem fim de semana).
    const dia = await service.diaOperadores(new Date('2026-07-15T12:00:00Z'));
    const porId = new Map(dia.colaboradores.map((c) => [c.id, c.turno]));
    expect(porId.get('c1')).toBe('FECHAMENTO');
    expect(porId.get('c2')).toBe('ABERTURA');
  });

  it('devolve turno null quando o colaborador não tem turno definido', async () => {
    const service = servico([
      colab({ id: 'c3', nome: 'Sem Turno', turno: null }),
    ]);
    const dia = await service.diaOperadores(new Date('2026-07-15T12:00:00Z'));
    expect(dia.colaboradores[0].turno).toBeNull();
  });
});
