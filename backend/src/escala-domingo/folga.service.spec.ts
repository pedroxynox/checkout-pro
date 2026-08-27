/**
 * Regra ÚNICA de folga: se QUALQUER fonte (ficha ou escala semanal) diz que a
 * pessoa descansa, é folga.
 *
 * O caso que originou esta regra está no primeiro teste: um fiscal com folga na
 * terça **na ficha**, cuja escala semanal não tinha sido atualizada, era escalado
 * pelo sistema e recebia falta automática no próprio dia de descanso.
 */
import { PrismaService } from '../prisma/prisma.service';
import { EscalaDomingoService } from './escala-domingo.service';
import { FolgaService } from './folga.service';

const TERCA = new Date('2026-07-21T00:00:00.000Z'); // diaSemana 2
const QUARTA = new Date('2026-07-22T00:00:00.000Z'); // diaSemana 3
const DOMINGO = new Date('2026-07-19T00:00:00.000Z'); // diaSemana 0

interface Cenario {
  colaboradores?: {
    id: string;
    folgaDiaSemana: number | null;
    grupoDomingo: string | null;
  }[];
  escala?: {
    funcionarioId: string;
    colaboradorId: string | null;
    diaSemana: number;
  }[];
  ancora?: { data: Date; ordem: ('G1' | 'G2' | 'G3')[] } | null;
}

function criarServico(cenario: Cenario = {}): FolgaService {
  const prisma = {
    colaborador: {
      findMany: () => Promise.resolve(cenario.colaboradores ?? []),
    },
    escalaEntry: {
      findMany: ({ where }: { where: { diaSemana: { in: number[] } } }) =>
        Promise.resolve(
          (cenario.escala ?? []).filter((e) =>
            where.diaSemana.in.includes(e.diaSemana),
          ),
        ),
    },
  } as unknown as PrismaService;

  const escalaDomingo = {
    obterAncora: () => Promise.resolve(cenario.ancora ?? null),
  } as unknown as EscalaDomingoService;

  return new FolgaService(prisma, escalaDomingo);
}

describe('FolgaService', () => {
  it('a folga da FICHA vale mesmo quando a escala semanal escala a pessoa', async () => {
    // O bug do Erick: folga na terça na ficha, escala semanal desatualizada.
    // `ids` traz as duas identidades porque um fiscal bate ponto por uma
    // (Fiscal.id) e tem ficha na outra (Colaborador.id).
    const service = criarServico({
      colaboradores: [
        { id: 'col-erick', folgaDiaSemana: 2, grupoDomingo: null },
      ],
      escala: [], // a escala não diz folga nenhuma
    });

    expect(await service.ehFolga(TERCA, ['fiscal-erick', 'col-erick'])).toBe(
      true,
    );
  });

  it('a folga da ESCALA vale mesmo quando a ficha não diz nada', async () => {
    // Simetria inversa: operador cuja folga só foi registrada na escala.
    const service = criarServico({
      colaboradores: [
        { id: 'col-1', folgaDiaSemana: null, grupoDomingo: null },
      ],
      escala: [
        { funcionarioId: 'col-1', colaboradorId: 'col-1', diaSemana: 2 },
      ],
    });

    expect(await service.ehFolga(TERCA, ['col-1'])).toBe(true);
  });

  it('reconhece a folga da escala pelo vínculo com a ficha', async () => {
    // Escalas antigas guardam `funcionarioId` (Fiscal.id) e o vínculo
    // `colaboradorId`; qualquer das duas chaves precisa resolver.
    const service = criarServico({
      colaboradores: [
        { id: 'col-2', folgaDiaSemana: null, grupoDomingo: null },
      ],
      escala: [
        { funcionarioId: 'fiscal-2', colaboradorId: 'col-2', diaSemana: 2 },
      ],
    });

    expect(await service.ehFolga(TERCA, ['col-2'])).toBe(true);
    expect(await service.ehFolga(TERCA, ['fiscal-2'])).toBe(true);
  });

  it('sem nenhuma fonte dizendo folga, é dia de trabalho', async () => {
    const service = criarServico({
      colaboradores: [{ id: 'col-1', folgaDiaSemana: 2, grupoDomingo: null }],
    });

    expect(await service.ehFolga(QUARTA, ['col-1'])).toBe(false);
  });

  it('pessoa desconhecida não é considerada de folga', async () => {
    // Não se afirma folga sobre quem não se conhece — afirmar levaria a deixar
    // de cobrar o ponto de alguém sem nenhuma base.
    const service = criarServico({ colaboradores: [] });

    expect(await service.ehFolga(TERCA, ['ninguem'])).toBe(false);
  });

  describe('domingo', () => {
    const ancora = {
      data: DOMINGO,
      ordem: ['G1', 'G3', 'G2'] as ('G1' | 'G2' | 'G3')[],
    };

    it('quem está fora do rodízio folga aos domingos', async () => {
      const service = criarServico({
        colaboradores: [{ id: 'col-1', folgaDiaSemana: 2, grupoDomingo: null }],
        ancora,
      });

      expect(await service.ehFolga(DOMINGO, ['col-1'])).toBe(true);
    });

    it('o grupo que folga nesse domingo é folga; os outros trabalham', async () => {
      const service = criarServico({
        colaboradores: [
          { id: 'g1', folgaDiaSemana: 2, grupoDomingo: 'G1' },
          { id: 'g2', folgaDiaSemana: 2, grupoDomingo: 'G2' },
        ],
        ancora,
      });

      // Âncora 19/07 com ordem G1,G3,G2 → folga G1 nesse domingo.
      expect(await service.ehFolga(DOMINGO, ['g1'])).toBe(true);
      expect(await service.ehFolga(DOMINGO, ['g2'])).toBe(false);
    });

    it('com grupo mas SEM âncora não se afirma folga', async () => {
      // Herdado de `ehDiaDeFolga`: sem o rodízio configurado não há como saber
      // quem trabalha, e afirmar folga bloquearia gente por engano.
      const service = criarServico({
        colaboradores: [{ id: 'g1', folgaDiaSemana: 2, grupoDomingo: 'G1' }],
        ancora: null,
      });

      expect(await service.ehFolga(DOMINGO, ['g1'])).toBe(false);
    });
  });

  it('o consultor responde por vários dias com uma carga só', async () => {
    const service = criarServico({
      colaboradores: [{ id: 'col-1', folgaDiaSemana: 2, grupoDomingo: null }],
    });

    const consultor = await service.consultor([TERCA, QUARTA]);

    expect(consultor.ehFolga(TERCA, ['col-1'])).toBe(true);
    expect(consultor.ehFolga(QUARTA, ['col-1'])).toBe(false);
  });

  it('ignora ids nulos sem quebrar', async () => {
    const service = criarServico({
      colaboradores: [{ id: 'col-1', folgaDiaSemana: 2, grupoDomingo: null }],
    });

    expect(await service.ehFolga(TERCA, [null, undefined, 'col-1'])).toBe(true);
  });
});
