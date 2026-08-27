/**
 * Escala publicada: precedência do estado de cada pessoa, ordem de leitura,
 * agrupamento por função e a semana de segunda a domingo.
 */
import { GrupoDomingo } from '../escala-domingo/escala-domingo.domain';
import {
  FichaColaboradorEscala,
  LinhaEscala,
  agruparPorFuncao,
  montarLinhaEscala,
  ordenarLinhas,
  semanaDe,
  totaisEscala,
} from './escala-publicada.domain';

const ANCORA = {
  data: new Date('2026-07-19T00:00:00.000Z'), // domingo
  ordem: ['G1', 'G3', 'G2'] as GrupoDomingo[],
};

const TERCA = new Date('2026-07-21T00:00:00.000Z');
const SEGUNDA = new Date('2026-07-20T00:00:00.000Z');

function ficha(
  parcial: Partial<FichaColaboradorEscala> = {},
): FichaColaboradorEscala {
  return {
    colaboradorId: 'c1',
    nome: 'Ana Souza',
    funcao: 'OPERADOR',
    turno: 'ABERTURA',
    folgaDiaSemana: 1, // segunda
    grupoDomingo: 'G2',
    entradaSemana: '07:00',
    saidaSemana: '15:20',
    entradaFds: '08:00',
    saidaFds: '17:20',
    entradaDom: '09:00',
    saidaDom: '16:20',
    ...parcial,
  };
}

type ParamsMontar = Parameters<typeof montarLinhaEscala>[0];

function montar(parcial: Partial<ParamsMontar> = {}): LinhaEscala {
  return montarLinhaEscala({
    ficha: ficha(),
    dia: TERCA,
    ancoraDomingo: ANCORA,
    ehFeriado: false,
    deFerias: false,
    especial: null,
    ocorrencia: null,
    ...parcial,
  });
}

describe('montarLinhaEscala', () => {
  it('dia normal traz o turno completo do cadastro', () => {
    const linha = montar({});
    expect(linha.status).toBe('TRABALHA');
    expect(linha.entrada).toBe('07:00');
    expect(linha.saida).toBe('15:20');
  });

  it('dia de folga aparece como FOLGA, sem horário', () => {
    // Quem folga precisa aparecer: sem a linha, a pessoa conclui que a
    // esqueceram, não que descansa.
    const linha = montar({ dia: SEGUNDA });
    expect(linha.status).toBe('FOLGA');
    expect(linha.entrada).toBeNull();
  });

  it('férias ganham de tudo, inclusive de uma ausência lançada', () => {
    const linha = montar({
      deFerias: true,
      ocorrencia: { ehAtestado: false },
    });
    expect(linha.status).toBe('FERIAS');
    expect(linha.entrada).toBeNull();
  });

  it('horário especial prevalece sobre o turno do cadastro', () => {
    const linha = montar({
      especial: { entrada: '10:00', saida: '18:00', folga: false },
    });
    expect(linha.entrada).toBe('10:00');
    expect(linha.saida).toBe('18:00');
    expect(linha.horarioEspecial).toBe(true);
  });

  it('folga especial vira FOLGA mesmo em dia útil', () => {
    const linha = montar({
      especial: { entrada: null, saida: null, folga: true },
    });
    expect(linha.status).toBe('FOLGA');
  });

  it('falta mantém o horário previsto ao lado', () => {
    // É o que diz qual turno ficou descoberto — sem isso a escala só informa
    // que alguém faltou, o que não ajuda quem lê.
    const linha = montar({ ocorrencia: { ehAtestado: false } });
    expect(linha.status).toBe('FALTA');
    expect(linha.entrada).toBe('07:00');
    expect(linha.saida).toBe('15:20');
  });

  it('atestado é distinguido da falta comum', () => {
    const linha = montar({ ocorrencia: { ehAtestado: true } });
    expect(linha.status).toBe('ATESTADO');
  });

  it('ausência em dia de folga não vira falta', () => {
    // Falta em dia de folga não existe; mostrá-la assustaria quem lê.
    const linha = montar({
      dia: SEGUNDA,
      ocorrencia: { ehAtestado: false },
    });
    expect(linha.status).toBe('FOLGA');
  });

  it('feriado usa o horário de domingo nas duas pontas', () => {
    const linha = montar({ ehFeriado: true });
    expect(linha.entrada).toBe('09:00');
    expect(linha.saida).toBe('16:20');
  });
});

describe('ordenarLinhas', () => {
  it('ordena por hora de entrada e joga quem não trabalha para o fim', () => {
    const linhas = [
      montar({ ficha: ficha({ colaboradorId: 'c3', nome: 'Zeca' }) }),
      montar({ dia: SEGUNDA, ficha: ficha({ colaboradorId: 'c2', nome: 'Bia' }) }),
      montar({
        ficha: ficha({
          colaboradorId: 'c1',
          nome: 'Ana',
          entradaSemana: '05:00',
        }),
      }),
    ];
    expect(ordenarLinhas(linhas).map((l) => l.nome)).toEqual([
      'Ana', // entra 05:00
      'Zeca', // entra 07:00
      'Bia', // folga
    ]);
  });
});

describe('agruparPorFuncao', () => {
  it('mantém a ordem fixa supervisor → fiscal → operador e omite seções vazias', () => {
    const linhas = [
      montar({ ficha: ficha({ colaboradorId: 'a', nome: 'Op', funcao: 'OPERADOR' }) }),
      montar({
        ficha: ficha({ colaboradorId: 'b', nome: 'Sup', funcao: 'SUPERVISOR' }),
      }),
    ];
    expect(agruparPorFuncao(linhas).map((s) => s.funcao)).toEqual([
      'SUPERVISOR',
      'OPERADOR',
    ]);
  });
});

describe('totaisEscala', () => {
  it('conta cada estado do dia', () => {
    const linhas = [
      montar({}),
      montar({ dia: SEGUNDA }),
      montar({ ocorrencia: { ehAtestado: true } }),
      montar({ deFerias: true }),
    ];
    expect(totaisEscala(linhas)).toEqual({
      trabalhando: 1,
      folgas: 1,
      faltas: 0,
      atestados: 1,
      ferias: 1,
    });
  });
});

describe('semanaDe', () => {
  it('vai de segunda a domingo', () => {
    expect(semanaDe('2026-07-22')).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ]);
  });

  it('domingo pertence à semana que começou na segunda anterior', () => {
    // Sem esta regra, publicar a escala no domingo mostraria a semana seguinte
    // — justamente no dia em que a equipe confere a semana que está acabando.
    expect(semanaDe('2026-07-26')[0]).toBe('2026-07-20');
    expect(semanaDe('2026-07-26')[6]).toBe('2026-07-26');
  });
});
