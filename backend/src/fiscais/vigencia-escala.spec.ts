import { REGRAS_PADRAO } from '../ponto/ponto.domain';
import { jornadaDeTeste } from '../../test/helpers/jornada-de-teste';
import { EscalaService } from './escala.service';
import { FiscaisService } from './fiscais.service';

/**
 * Escala e equipe do dia com a vigência da jornada (spec `jornada-5x2`, ADR
 * 0027). Quem passou ao 5x2 em 23/11/2026 é escalado pela disponibilidade e
 * pelas folgas da vigência; antes do corte, e para quem não tem vigência, vale
 * a ficha — como sempre.
 */

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const QUARTA_ANTES = dia('2026-11-18'); // 6x1: folga fixa na quarta
const QUARTA_DEPOIS = dia('2026-11-25'); // 5x2: dia de trabalho
const SABADO_DEPOIS = dia('2026-11-28'); // 5x2: folga fixa no sábado

const BASE = {
  tipoContratoJornadaId: 'contrato-6x1',
  grupoDomingo: null,
  saidaSemana: '16:00',
  saidaFds: '17:00',
  entradaDom: null,
  saidaDom: null,
  matricula: '1',
  usuarioId: null,
  ativo: true,
};

const COLABORADORES = [
  // Operadora que passa ao 5x2 em 23/11: folga fixa antiga na quarta.
  {
    ...BASE,
    id: 'ana',
    nome: 'Ana',
    funcao: 'OPERADOR',
    folgaDiaSemana: 3,
    entradaSemana: '07:00',
    entradaFds: '07:00',
  },
  // Operador que continua no regime legado (sem vigência).
  {
    ...BASE,
    id: 'bruno',
    nome: 'Bruno',
    funcao: 'OPERADOR',
    folgaDiaSemana: 3,
    entradaSemana: '09:00',
    entradaFds: '09:00',
  },
  // Fiscal que passa ao 5x2 (bate ponto como Fiscal.id 'fiscal-caio').
  {
    ...BASE,
    id: 'caio',
    nome: 'Caio',
    funcao: 'FISCAL',
    matricula: '2',
    usuarioId: 'u-caio',
    folgaDiaSemana: 3,
    entradaSemana: '08:00',
    entradaFds: '08:00',
  },
];

const disponibilidade = (entrada: string, saida: string) =>
  [0, 1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, entrada, saida }));

const VIGENCIAS = [
  {
    id: 'v-ana',
    colaboradorId: 'ana',
    vigenteDesde: dia('2026-11-23'),
    tipoContratoJornadaId: 'contrato-5x2',
    grupo: null,
    folgasFixas: [6, 0],
    disponibilidade: disponibilidade('06:00', '16:48'),
  },
  {
    id: 'v-caio',
    colaboradorId: 'caio',
    vigenteDesde: dia('2026-11-23'),
    tipoContratoJornadaId: 'contrato-5x2',
    grupo: null,
    folgasFixas: [6, 0],
    disponibilidade: disponibilidade('13:00', '23:00'),
  },
];

function montar(comJornada: boolean) {
  const prisma = {
    colaborador: {
      findMany: (args?: { where?: { funcao?: { in: string[] } } }) => {
        const funcoes = args?.where?.funcao?.in;
        return Promise.resolve(
          funcoes
            ? COLABORADORES.filter((c) => funcoes.includes(c.funcao))
            : COLABORADORES,
        );
      },
    },
    fiscal: {
      findMany: () =>
        Promise.resolve([
          { id: 'fiscal-caio', nome: 'Caio', usuarioId: 'u-caio' },
        ]),
    },
    usuario: {
      findMany: () => Promise.resolve([{ id: 'u-caio', login: 'caio' }]),
    },
    escalaEntry: { findMany: () => Promise.resolve([]) },
    jornadaVigencia: {
      findMany: ({ where }: { where: { vigenteDesde: { lte: Date } } }) =>
        Promise.resolve(
          VIGENCIAS.filter((v) => v.vigenteDesde <= where.vigenteDesde.lte),
        ),
    },
  };
  const jornada = comJornada
    ? jornadaDeTeste(prisma, undefined, {
        regrasDoContrato: () => Promise.resolve(REGRAS_PADRAO),
      })
    : undefined;
  const escala = new EscalaService(
    prisma as never,
    undefined,
    undefined,
    undefined,
    jornada,
  );
  // Ordem: prisma, eventos, notificacoes, validacaoData, feriados, cicloFolha,
  // tiposContrato, escala, escalaDomingo, ferias, folga, jornada.
  const fiscais = new FiscaisService(
    prisma as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    escala,
    undefined,
    undefined,
    undefined,
    jornada,
  );
  return { escala, fiscais };
}

const entradas = (
  lista: { pessoaId: string; entradaPrevista: string | null }[],
) => Object.fromEntries(lista.map((e) => [e.pessoaId, e.entradaPrevista]));

describe('Equipe do dia com vigência da jornada', () => {
  it('antes do corte vale a ficha: a quarta é folga de todos', async () => {
    const { fiscais } = montar(true);
    expect(await fiscais.escaladosDoDia(QUARTA_ANTES)).toEqual([]);
  });

  it('depois do corte: quem tem vigência trabalha na quarta, com o horário novo', async () => {
    const { fiscais } = montar(true);
    expect(entradas(await fiscais.escaladosDoDia(QUARTA_DEPOIS))).toEqual({
      ana: '06:00',
      'fiscal-caio': '13:00',
    });
  });

  it('a folga nova (sábado) tira da equipe quem tem vigência; o legado segue', async () => {
    const { fiscais } = montar(true);
    expect(entradas(await fiscais.escaladosDoDia(SABADO_DEPOIS))).toEqual({
      bruno: '09:00',
    });
  });

  it('sem o serviço de vigência, tudo como antes (a ficha manda)', async () => {
    const { fiscais } = montar(false);
    expect(await fiscais.escaladosDoDia(QUARTA_DEPOIS)).toEqual([]);
    expect(entradas(await fiscais.escaladosDoDia(SABADO_DEPOIS))).toEqual({
      ana: '07:00',
      bruno: '09:00',
      'fiscal-caio': '08:00',
    });
  });
});

describe('Escala consolidada dos fiscais com vigência da jornada', () => {
  it('numa data real, o turno da vigência; no dia típico, o da ficha', async () => {
    const { escala } = montar(true);
    const real = await escala.escalaConsolidada(3, '2026-11-25');
    expect(real[0].efetiva).toMatchObject({ entrada: '13:00', saida: '23:00' });
    const tipico = await escala.escalaConsolidada(3);
    expect(tipico[0].efetiva).toBe('FOLGA');
  });
});
