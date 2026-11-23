import { REGRAS_PADRAO, RegrasContrato } from '../ponto/ponto.domain';
import { JornadaColaboradorService } from '../jornada-vigencia/jornada-colaborador.service';
import { ConferenciaEscalaService } from './conferencia-escala.service';

/**
 * Conferência de escala no modelo novo (spec `jornada-5x2`, R5.3): quem já tem
 * vigência sai do diagnóstico da ficha antiga (6x1), e a conferência ganha a
 * jornada da equipe — quem ainda está sem vigência e os avisos de R4.6.
 */

const MIN = 60_000;
const REGRAS_5X2: RegrasContrato = {
  ...REGRAS_PADRAO,
  cargaBaseMs: () => 528 * MIN,
  intervaloMaximoMs: 170 * MIN,
  folgasPorSemana: 2,
};

// Duas fichas antigas com o bloco Seg–Qui pela metade; a Bia já está no 5x2.
const FICHA = {
  matricula: '1',
  usuarioId: null,
  entradaSemana: '07:00',
  saidaSemana: null,
  entradaFds: '07:00',
  saidaFds: '16:20',
  entradaDom: null,
  saidaDom: null,
  grupoDomingo: null,
  folgaDiaSemana: null,
  ativo: true,
};
const FISCAIS = [
  { ...FICHA, id: 'ana', nome: 'Ana' },
  { ...FICHA, id: 'bia', nome: 'Bia', matricula: '2' },
];

const VIGENCIA_BIA = {
  id: 'v1',
  colaboradorId: 'bia',
  vigenteDesde: new Date('2026-11-23T00:00:00.000Z'),
  tipoContratoJornadaId: 'c5x2',
  grupo: null,
  folgasFixas: [0, 3],
  motivo: null,
  criadoPor: 'dono',
  criadoEm: new Date('2026-11-23T10:00:00.000Z'),
  atualizadoPor: null,
  atualizadoEm: new Date('2026-11-23T10:00:00.000Z'),
  // Só segunda a sexta (sem quarta, que é folga): sábado fica sem horário.
  disponibilidade: [1, 2, 4, 5].map((diaSemana) => ({
    diaSemana,
    entrada: '06:50',
    saida: '16:38',
  })),
  tipoContratoJornada: { nome: '5x2 44h' },
};

function montar(comJornada: boolean) {
  const prisma = {
    colaborador: {
      findMany: ({ where }: { where: { ativo?: boolean } }) =>
        Promise.resolve(
          where.ativo
            ? [
                { id: 'ana', nome: 'Ana', funcao: 'FISCAL' },
                { id: 'bia', nome: 'Bia', funcao: 'FISCAL' },
              ]
            : FISCAIS,
        ),
    },
    fiscal: { findMany: () => Promise.resolve([]) },
    usuario: { findMany: () => Promise.resolve([]) },
    escalaEntry: { findMany: () => Promise.resolve([]) },
    jornadaVigencia: {
      findMany: ({ distinct }: { distinct?: string[] }) =>
        Promise.resolve(distinct ? [{ colaboradorId: 'bia' }] : [VIGENCIA_BIA]),
    },
  };
  const tiposContrato = {
    regrasDoContrato: () => Promise.resolve(REGRAS_5X2),
  };
  const jornada = comJornada
    ? new JornadaColaboradorService(
        prisma as never,
        tiposContrato as never,
        {} as never,
        {} as never,
      )
    : undefined;
  return new ConferenciaEscalaService(prisma as never, jornada);
}

describe('ConferenciaEscalaService — jornada 5x2', () => {
  it('quem tem vigência sai do diagnóstico da ficha antiga', async () => {
    const r = await montar(true).conferir();
    expect(r.horarioIncompleto.map((f) => f.colaboradorId)).toEqual(['ana']);
  });

  it('lista quem está sem vigência e os avisos da vigência de cada um', async () => {
    const r = await montar(true).conferir();
    expect(r.jornada?.comVigencia).toBe(1);
    expect(r.jornada?.semVigencia).toEqual([
      { colaboradorId: 'ana', nome: 'Ana', funcao: 'FISCAL' },
    ]);
    expect(r.jornada?.avisos).toHaveLength(1);
    expect(r.jornada?.avisos[0]).toMatchObject({
      colaboradorId: 'bia',
      aPartirDe: '2026-11-23',
    });
    expect(r.jornada?.avisos[0].avisos.map((a) => a.tipo)).toEqual([
      'DIA_SEM_HORARIO',
    ]);
  });

  it('sem o serviço da jornada, segue o diagnóstico antigo inteiro', async () => {
    const r = await montar(false).conferir();
    expect(r.jornada).toBeNull();
    expect(r.horarioIncompleto.map((f) => f.colaboradorId).sort()).toEqual([
      'ana',
      'bia',
    ]);
  });
});
