/**
 * Fila de correção das marcações inválidas: filtros, ordem de trabalho e qual é
 * a próxima pendência. É o contrato que faz a lista e o Relógio Ponto
 * concordarem sobre o que está em jogo.
 */
import type { MarcacaoInvalidaItem } from '../../api/services/centralJornada';
import {
  chaveFila,
  filtrarFila,
  ordenarFila,
  proximaPendencia,
} from './filaCorrecao';

function item(
  parcial: Partial<MarcacaoInvalidaItem> & {
    colaboradorId: string;
    nome: string;
    data: string;
  },
): MarcacaoInvalidaItem {
  return {
    primeiroNome: parcial.nome.split(' ')[0],
    funcao: 'OPERADOR',
    diaSemana: 1,
    ehFeriado: false,
    entradaPrevista: '08:00',
    horasRegistradas: [],
    esperadas: 4,
    registradas: 3,
    quantidadeFaltante: 1,
    tiposFaltantes: ['ENTRADA'],
    tiposPresentes: [],
    confianca: 'ALTA',
    observacao: null,
    detalhe: 'Falta registrar: entrada',
    devidasMs: 0,
    ...parcial,
  } as MarcacaoInvalidaItem;
}

const ANA = item({
  colaboradorId: 'c1',
  nome: 'Ana Souza',
  data: '2026-06-29T00:00:00.000Z',
});
const BRUNO = item({
  colaboradorId: 'c2',
  nome: 'Bruno Lima',
  data: '2026-06-29T00:00:00.000Z',
  tiposFaltantes: ['ENCERRAMENTO'],
});
const CARLA = item({
  colaboradorId: 'c3',
  nome: 'Carla Dias',
  data: '2026-06-27T00:00:00.000Z',
});

describe('chaveFila', () => {
  it('identifica o item por pessoa + dia, ignorando a forma da data', () => {
    // O relatório manda ISO completo; o Relógio Ponto trabalha em yyyy-mm-dd.
    // Se as duas formas gerassem chaves diferentes, o mesmo dia pareceria dois.
    expect(chaveFila({ colaboradorId: 'c1', data: '2026-06-29' })).toBe(
      chaveFila({ colaboradorId: 'c1', data: '2026-06-29T00:00:00.000Z' }),
    );
  });
});

describe('filtrarFila', () => {
  it('sem filtros, devolve tudo', () => {
    expect(filtrarFila([ANA, BRUNO, CARLA])).toHaveLength(3);
  });

  it('filtra por trecho do nome, sem diferenciar maiúsculas', () => {
    expect(filtrarFila([ANA, BRUNO, CARLA], { nome: 'bru' })).toEqual([BRUNO]);
  });

  it('filtra pela marcação que falta', () => {
    expect(
      filtrarFila([ANA, BRUNO, CARLA], { tipo: 'ENCERRAMENTO' }),
    ).toEqual([BRUNO]);
  });
});

describe('ordenarFila', () => {
  it('põe o dia mais recente primeiro e ordena as pessoas por nome', () => {
    expect(ordenarFila([CARLA, BRUNO, ANA]).map((i) => i.nome)).toEqual([
      'Ana Souza',
      'Bruno Lima',
      'Carla Dias',
    ]);
  });
});

describe('proximaPendencia', () => {
  it('reoferece o mesmo dia enquanto ele continuar incompleto', () => {
    // Um dia com duas marcações faltando não se resolve com uma batida: mandar
    // o gestor para outra pessoa deixaria o dia pela metade.
    const restante = { ...ANA, tiposFaltantes: ['ENCERRAMENTO' as const] };
    const proxima = proximaPendencia([restante, BRUNO], {}, ANA);

    expect(proxima?.colaboradorId).toBe('c1');
    expect(proxima?.tiposFaltantes).toEqual(['ENCERRAMENTO']);
  });

  it('anda para o item seguinte quando o dia sai do relatório', () => {
    expect(proximaPendencia([BRUNO, CARLA], {}, ANA)?.nome).toBe('Bruno Lima');
  });

  it('volta ao topo quando o item resolvido era o último', () => {
    // Quem começou pelo meio da lista não pode deixar o começo para trás.
    expect(proximaPendencia([ANA, BRUNO], {}, CARLA)?.nome).toBe('Ana Souza');
  });

  it('respeita os filtros da lista de origem', () => {
    // A fila não pode levar a um item que a lista nem estava mostrando.
    expect(
      proximaPendencia([BRUNO, CARLA], { tipo: 'ENTRADA' }, ANA)?.nome,
    ).toBe('Carla Dias');
  });

  it('devolve null quando não há mais nada a ajustar', () => {
    expect(proximaPendencia([], {}, ANA)).toBeNull();
  });
});
