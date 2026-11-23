/**
 * Montagem da jornada prevista para testes unitários (spec `jornada-5x2`).
 *
 * Desde a vigência da jornada, o `FolgaService` pergunta ao
 * `JornadaVigenciaService`, que lê mais fontes do que a regra de folga antiga
 * (vigências e feriados). Os Prismas falsos dos testes existentes não as têm; em
 * vez de repetir os mesmos `findMany` vazios em cada arquivo, este helper
 * completa o que faltar com "nada cadastrado" — sem tocar no que o teste definiu.
 */
import { FolgaService } from '../../src/jornada-vigencia/folga.service';
import { JornadaVigenciaService } from '../../src/jornada-vigencia/jornada-vigencia.service';
import { REGRAS_PADRAO } from '../../src/ponto/ponto.domain';

type Metodos = Record<string, (...args: unknown[]) => unknown>;

/** O que a jornada prevista lê, com a resposta de "nada cadastrado". */
const PADROES: Record<string, Metodos> = {
  colaborador: { findMany: () => Promise.resolve([]) },
  jornadaVigencia: {
    findMany: () => Promise.resolve([]),
    findFirst: () => Promise.resolve(null),
  },
  escalaEntry: { findMany: () => Promise.resolve([]) },
  feriado: { findMany: () => Promise.resolve([]) },
  rodizioFolgasVigencia: { findMany: () => Promise.resolve([]) },
};

/**
 * O mesmo Prisma falso, com os modelos/métodos da jornada prevista que faltarem
 * respondendo "nada cadastrado". O que o teste definiu continua sendo usado (e
 * espionado) como antes.
 */
export function prismaComJornada<T extends object>(prisma: T): T {
  return new Proxy(prisma, {
    get(alvo, prop, receptor) {
      const atual: unknown = Reflect.get(alvo, prop, receptor);
      const padrao = typeof prop === 'string' ? PADROES[prop] : undefined;
      if (!padrao) return atual;
      if (atual == null) return padrao;
      return new Proxy(atual as object, {
        get: (modelo, metodo, r) =>
          Reflect.get(modelo, metodo, r) ??
          (typeof metodo === 'string' ? padrao[metodo] : undefined),
      });
    },
  });
}

/** Contratos: sempre o padrão do código (6x1). */
export const tiposContratoDeTeste = {
  regrasDoContrato: () => Promise.resolve(REGRAS_PADRAO),
  regrasDoColaborador: () => Promise.resolve(REGRAS_PADRAO),
};

/** `JornadaVigenciaService` sobre o Prisma falso do teste. */
export function jornadaDeTeste(
  prisma: object,
  escalaDomingo?: unknown,
  tiposContrato: unknown = tiposContratoDeTeste,
): JornadaVigenciaService {
  return new JornadaVigenciaService(
    prismaComJornada(prisma) as never,
    tiposContrato as never,
    escalaDomingo as never,
  );
}

/** `FolgaService` sobre o Prisma falso do teste. */
export function folgaDeTeste(
  prisma: object,
  escalaDomingo?: unknown,
): FolgaService {
  return new FolgaService(jornadaDeTeste(prisma, escalaDomingo));
}
