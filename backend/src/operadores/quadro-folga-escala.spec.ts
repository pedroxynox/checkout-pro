import { OperadorTurnoService } from './operador-turno.service';
import { FolgaService } from '../escala-domingo/folga.service';

/**
 * O Quadro de Operadores concorda com a escala publicada sobre o que é FOLGA.
 *
 * Antes, o quadro decidia folga **só** pela ficha (`folgaDiaSemana`), enquanto a
 * escala publicada também respeita a escala semanal. Com as duas fontes em
 * desacordo, o mesmo dia saía FOLGA num lugar e FALTA no outro — foi assim que
 * uma falta indevida ficou visível no dia de descanso de um colaborador.
 *
 * A regra em vigor (`FolgaService`) é a da **ADR 0023**: quando a ficha afirma um
 * dia de folga, ela decide **sozinha** — a escala semanal geral é derivada dela e
 * um derivado velho não acrescenta um descanso que a fonte não afirma. A escala
 * geral só decide quando a ficha é **omissa** (sem dia de folga cadastrado).
 *
 * Os testes abaixo cobrem os dois lados dessa regra. Eles antes exercitavam o
 * caminho errado: o `escalaEntry` falso não trazia `folga: true`, e a linha
 * acabava lida como *exceção de horário* sem hora — o que produzia FOLGA por
 * tabela. Com a exceção de horário removida (ADR 0026), o mock ficou honesto.
 */
describe('OperadorTurnoService — FOLGA pela regra única', () => {
  // Quarta-feira (diaSemana 3).
  const QUARTA = new Date('2026-07-22T12:00:00Z');

  function criarServico(opcoes: {
    /** `null` = ficha OMISSA (sem dia de folga cadastrado). */
    folgaDiaSemanaFicha: number | null;
    folgaNaEscalaEm?: number;
    comAusencia?: boolean;
  }): OperadorTurnoService {
    const colaborador = {
      id: 'c1',
      nome: 'Erick',
      genero: 'M',
      turno: 'ABERTURA',
      entradaSemana: '08:00',
      saidaSemana: '16:00',
      entradaFds: '08:00',
      saidaFds: '16:00',
      folgaDiaSemana: opcoes.folgaDiaSemanaFicha,
      grupoDomingo: null,
      ativo: true,
      criadoEm: new Date(),
    };

    const prismaFake = {
      colaborador: { findMany: () => Promise.resolve([colaborador]) },
      ausencia: {
        findMany: () =>
          Promise.resolve(
            opcoes.comAusencia
              ? [
                  {
                    id: 'au1',
                    pessoaId: 'c1',
                    statusJustificativa: 'PENDENTE',
                    justificadaPorNome: null,
                    aPrazo: false,
                    atestadoId: null,
                    motivoJustificativa: null,
                    cid: null,
                  },
                ]
              : [],
          ),
      },
      atestado: { findMany: () => Promise.resolve([]) },
      escalaEntry: {
        findMany: () =>
          Promise.resolve(
            opcoes.folgaNaEscalaEm !== undefined
              ? [
                  {
                    funcionarioId: 'c1',
                    colaboradorId: 'c1',
                    diaSemana: opcoes.folgaNaEscalaEm,
                    // `folga: true` é o que faz desta linha uma FOLGA da escala.
                    // Sem ele o mock não exercitava a regra que o teste afirma.
                    folga: true,
                    especial: false,
                  },
                ]
              : [],
          ),
      },
    };

    const folga = new FolgaService(prismaFake as never, undefined);
    // Ordem: prisma, notificacoes, escalaDomingo, folga.
    return new OperadorTurnoService(
      prismaFake as never,
      undefined,
      undefined,
      folga,
    );
  }

  it('com a ficha OMISSA, a folga da escala semanal vale', async () => {
    // Ficha sem dia de folga cadastrado: não há fonte que contradiga a escala,
    // e o viés conservador protege a pessoa.
    const service = criarServico({
      folgaDiaSemanaFicha: null,
      folgaNaEscalaEm: 3,
    });

    const dia = await service.diaOperadores(QUARTA);

    expect(dia.colaboradores[0].status).toBe('FOLGA');
    expect(dia.folgas).toBe(1);
  });

  /**
   * O outro lado da ADR 0023, e a razão de ela existir: a ficha afirma segunda,
   * a escala semanal (derivada e velha) afirma quarta. A ficha decide sozinha, e
   * a quarta segue sendo dia de trabalho.
   */
  it('com a ficha AFIRMANDO outro dia, ela decide sozinha', async () => {
    const service = criarServico({
      folgaDiaSemanaFicha: 1,
      folgaNaEscalaEm: 3,
    });

    const dia = await service.diaOperadores(QUARTA);

    expect(dia.colaboradores[0].status).toBe('TRABALHA');
    expect(dia.folgas).toBe(0);
  });

  it('a folga vence uma falta já gravada nesse dia', async () => {
    // É exatamente o sintoma relatado: falta registrada num dia de descanso.
    // O quadro não pode exibi-la como falta — e a auto-cura a removerá.
    const service = criarServico({
      folgaDiaSemanaFicha: null,
      folgaNaEscalaEm: 3,
      comAusencia: true,
    });

    const dia = await service.diaOperadores(QUARTA);

    expect(dia.colaboradores[0].status).toBe('FOLGA');
    expect(dia.faltas).toBe(0);
  });

  it('segue mostrando TRABALHA quando nenhuma fonte diz folga', async () => {
    const service = criarServico({ folgaDiaSemanaFicha: 1 });

    const dia = await service.diaOperadores(QUARTA);

    expect(dia.colaboradores[0].status).toBe('TRABALHA');
    expect(dia.colaboradores[0].entrada).toBe('08:00');
  });

  it('a grade semanal usa a mesma regra', async () => {
    const service = criarServico({
      folgaDiaSemanaFicha: null,
      folgaNaEscalaEm: 3,
    });

    const grade = await service.grade(QUARTA);
    const quarta = grade.operadores[0].celulas.find((c) => c.diaSemana === 3);

    expect(quarta?.status).toBe('FOLGA');
  });
});
