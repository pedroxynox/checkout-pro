import type { VigenciaJornada } from '../api/services/jornadaColaborador';
import {
  alternarFolgaFixa,
  comHorario,
  copiarPrimeira,
  dataInicialSugerida,
  edicaoDaVigencia,
  edicaoVazia,
  jornadaPreenchida,
  linhasVazias,
  mesmaJornada,
  paraGravar,
  pendenciasDaJornada,
  textoDias,
} from './jornadaColaborador';

const LIMITES_5X2 = { folgasPorSemana: 2, permiteFolgaSabado: false };

const vigencia: VigenciaJornada = {
  id: 'v1',
  aPartirDe: '2026-11-23',
  tipoContratoJornadaId: 'c5x2',
  tipoContratoNome: '5x2 44h',
  grupo: null,
  folgasFixas: [0, 3],
  folgasFixasEfetivas: [0, 3],
  disponibilidade: [
    { diaSemana: 1, entrada: '06:50', saida: '16:38' },
    { diaSemana: 6, entrada: '07:00', saida: '16:48' },
  ],
  motivo: null,
  criadoPor: 'dono',
  criadoEm: '2026-11-23T10:00:00.000Z',
  atualizadoPor: null,
  atualizadoEm: '2026-11-23T10:00:00.000Z',
  avisos: [],
};

describe('edição da jornada', () => {
  it('sete linhas de segunda a domingo', () => {
    expect(linhasVazias().map((l) => l.diaSemana)).toEqual([
      1, 2, 3, 4, 5, 6, 0,
    ]);
  });

  it('carrega a vigência gravada (dia sem horário fica vazio)', () => {
    const e = edicaoDaVigencia(vigencia);
    expect(e.contratoId).toBe('c5x2');
    expect(e.folgasFixas).toEqual([0, 3]);
    expect(e.linhas[0]).toEqual({
      diaSemana: 1,
      entrada: '06:50',
      saida: '16:38',
    });
    expect(e.linhas[1]).toEqual({ diaSemana: 2, entrada: '', saida: '' });
    expect(e.linhas[5]).toEqual({
      diaSemana: 6,
      entrada: '07:00',
      saida: '16:48',
    });
  });

  it('"copiar a primeira para todas" leva o horário de segunda aos sete dias', () => {
    const linhas = comHorario(
      comHorario(linhasVazias(), 1, 'entrada', '06:50'),
      1,
      'saida',
      '16:38',
    );
    const copiadas = copiarPrimeira(linhas);
    expect(
      copiadas.every((l) => l.entrada === '06:50' && l.saida === '16:38'),
    ).toBe(true);
    expect(copiadas.map((l) => l.diaSemana)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('folga fixa alterna e fica na ordem de segunda a domingo', () => {
    expect(alternarFolgaFixa([], 0)).toEqual([0]);
    expect(alternarFolgaFixa([0], 3)).toEqual([3, 0]);
    expect(alternarFolgaFixa([3, 0], 3)).toEqual([0]);
  });

  it('mesmaJornada ignora espaços e a ordem das folgas', () => {
    const a = edicaoDaVigencia(vigencia);
    const b = {
      ...a,
      folgasFixas: [3, 0],
      linhas: comHorario(a.linhas, 1, 'entrada', ' 06:50 '),
    };
    expect(mesmaJornada(a, b)).toBe(true);
    expect(mesmaJornada(a, { ...a, grupo: 'G1' })).toBe(false);
    expect(mesmaJornada(a, { ...a, contratoId: 'outro' })).toBe(false);
  });

  it('jornadaPreenchida: vazia × com algo', () => {
    expect(jornadaPreenchida(edicaoVazia('c'))).toBe(false);
    expect(jornadaPreenchida({ ...edicaoVazia(), grupo: 'G2' })).toBe(true);
    expect(
      jornadaPreenchida({
        ...edicaoVazia(),
        linhas: comHorario(linhasVazias(), 2, 'saida', '15:00'),
      }),
    ).toBe(true);
  });
});

describe('pendenciasDaJornada', () => {
  const com = (diaSemana: number, entrada: string, saida: string) => ({
    ...edicaoVazia(),
    linhas: comHorario(
      comHorario(linhasVazias(), diaSemana, 'entrada', entrada),
      diaSemana,
      'saida',
      saida,
    ),
  });

  it.each([
    [
      com(1, '06:50', ''),
      'Seg: informe entrada e saída (ou deixe as duas vazias).',
    ],
    [com(2, '6:50', '15:00'), 'Ter: use HH:mm (ex.: 06:50).'],
    [com(0, '16:00', '07:00'), 'Dom: a saída deve ser depois da entrada.'],
    [
      { ...edicaoVazia(), folgasFixas: [1, 2, 3] },
      'No máximo 2 folga(s) fixa(s) neste contrato.',
    ],
    [
      { ...edicaoVazia(), folgasFixas: [6] },
      'Este contrato não permite folga no sábado.',
    ],
  ])('recusa %#', (e, erro) => {
    expect(pendenciasDaJornada(e, LIMITES_5X2)).toContain(erro);
  });

  it('aceita jornada correta; sem contrato conhecido não confere folgas', () => {
    expect(pendenciasDaJornada(com(1, '06:50', '16:38'), LIMITES_5X2)).toEqual(
      [],
    );
    expect(
      pendenciasDaJornada({ ...edicaoVazia(), folgasFixas: [6, 0, 1] }, null),
    ).toEqual([]);
  });
});

describe('gravação', () => {
  it('manda só os dias com horário; com grupo, sem folgas fixas', () => {
    const e = {
      ...edicaoDaVigencia(vigencia),
      grupo: 'G1',
    };
    expect(paraGravar(e, '2026-11-23', false)).toEqual({
      aPartirDe: '2026-11-23',
      grupo: 'G1',
      folgasFixas: [],
      disponibilidade: [
        { diaSemana: 1, entrada: '06:50', saida: '16:38' },
        { diaSemana: 6, entrada: '07:00', saida: '16:48' },
      ],
    });
  });

  it('o contrato só vai quando quem salva pode trocá-lo', () => {
    const e = edicaoDaVigencia(vigencia);
    expect(paraGravar(e, '2026-12-01', true).tipoContratoJornadaId).toBe(
      'c5x2',
    );
    expect(paraGravar(e, '2026-12-01', false)).not.toHaveProperty(
      'tipoContratoJornadaId',
    );
  });

  it('data sugerida: 23/11 para quem ainda está no 6x1; hoje para os demais', () => {
    expect(dataInicialSugerida(false, '2026-11-24')).toBe('2026-11-23');
    expect(dataInicialSugerida(true, '2026-11-24')).toBe('2026-11-24');
    expect(dataInicialSugerida(false, '2026-11-20')).toBe('2026-11-20');
  });

  it('textoDias de segunda a domingo', () => {
    expect(textoDias([0, 3])).toBe('Qua, Dom');
    expect(textoDias([])).toBe('—');
  });
});
