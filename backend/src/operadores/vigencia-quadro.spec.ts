import { REGRAS_PADRAO } from '../ponto/ponto.domain';
import { EscalaExportacaoService } from '../escala-exportacao/escala-exportacao.service';
import { jornadaDeTeste } from '../../test/helpers/jornada-de-teste';
import { OperadorTurnoService } from './operador-turno.service';

/**
 * Quadro de operadores e escala publicada com a vigência da jornada (spec
 * `jornada-5x2`, ADR 0027): as duas telas mostram o horário e a folga da
 * vigência do dia — e continuam iguais entre si.
 */

const QUARTA = new Date('2026-11-25T12:00:00Z'); // 5x2: dia de trabalho
const SABADO = new Date('2026-11-28T12:00:00Z'); // 5x2: folga fixa

const colaborador = {
  id: 'c1',
  nome: 'Ana Souza',
  matricula: '0001',
  genero: 'F',
  funcao: 'OPERADOR',
  turno: 'ABERTURA',
  ativo: true,
  usuarioId: null,
  criadoEm: new Date('2026-01-01'),
  tipoContratoJornadaId: 'contrato-6x1',
  folgaDiaSemana: 3, // a folga antiga (quarta)
  grupoDomingo: null,
  entradaSemana: '07:00',
  saidaSemana: '15:20',
  entradaFds: '08:00',
  saidaFds: '17:20',
  entradaDom: null,
  saidaDom: null,
};

const vigencia = {
  id: 'v1',
  colaboradorId: 'c1',
  vigenteDesde: new Date('2026-11-23T00:00:00Z'),
  tipoContratoJornadaId: 'contrato-5x2',
  grupo: null,
  folgasFixas: [6, 0],
  disponibilidade: [1, 2, 3, 4, 5].map((d) => ({
    diaSemana: d,
    entrada: '06:00',
    saida: '16:48',
  })),
};

function prismaFake() {
  return {
    colaborador: {
      // Só há uma operadora; o filtro por função (quando houver) a inclui.
      findMany: () => Promise.resolve([colaborador]),
    },
    jornadaVigencia: {
      findMany: ({ where }: { where: { vigenteDesde?: { lte: Date } } }) =>
        Promise.resolve(
          !where.vigenteDesde || vigencia.vigenteDesde <= where.vigenteDesde.lte
            ? [vigencia]
            : [],
        ),
    },
    escalaEntry: { findMany: () => Promise.resolve([]) },
    feriado: { findMany: () => Promise.resolve([]) },
    ausencia: { findMany: () => Promise.resolve([]) },
    atestado: { findMany: () => Promise.resolve([]) },
    fiscal: { findMany: () => Promise.resolve([]) },
    usuario: { findMany: () => Promise.resolve([]) },
  };
}

function montar() {
  const prisma = prismaFake();
  const jornada = jornadaDeTeste(prisma, undefined, {
    regrasDoContrato: () => Promise.resolve(REGRAS_PADRAO),
  });
  // Ordem: prisma, notificacoes, escalaDomingo, folga, ferias, feriados, jornada.
  const quadro = new OperadorTurnoService(
    prisma as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    jornada,
  );
  // Ordem: prisma, escalaDomingo, ferias, folga, jornada.
  const publicada = new EscalaExportacaoService(
    prisma as never,
    undefined,
    undefined,
    undefined,
    jornada,
  );
  return { quadro, publicada };
}

describe('Quadro de operadores e escala publicada com vigência da jornada', () => {
  it('quarta (folga antiga) aparece trabalhando no horário novo, nas duas telas', async () => {
    const { quadro, publicada } = montar();
    const dia = await quadro.diaOperadores(QUARTA);
    expect(dia.colaboradores[0]).toMatchObject({
      status: 'TRABALHA',
      entrada: '06:00',
      saida: '16:48',
    });
    const escala = await publicada.escalaDoDia('2026-11-25');
    const linha = escala.secoes.flatMap((s) => s.linhas)[0];
    expect(linha).toMatchObject({
      status: 'TRABALHA',
      entrada: '06:00',
      saida: '16:48',
    });
  });

  it('sábado (folga nova) aparece de folga nas duas telas', async () => {
    const { quadro, publicada } = montar();
    expect((await quadro.diaOperadores(SABADO)).colaboradores[0].status).toBe(
      'FOLGA',
    );
    const escala = await publicada.escalaDoDia('2026-11-28');
    expect(escala.secoes.flatMap((s) => s.linhas)[0].status).toBe('FOLGA');
  });
});
