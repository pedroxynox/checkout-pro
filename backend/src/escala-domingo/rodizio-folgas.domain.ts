/**
 * Rodízio de FOLGAS do 5x2 (spec `jornada-5x2`, Fase 3) — domínio puro.
 *
 * Cada grupo (G1/G2/G3) folga 2 dias por semana, e os dias mudam a cada semana
 * de um ciclo que se repete. A semana vai de **segunda a domingo**; a semana 1
 * começa em `vigenteDesde` (uma segunda-feira). Exemplo, a vigência de
 * 23/11/2026 (decisão 5):
 *
 *   Grupo | Semana 1  | Semana 2  | Semana 3
 *   G1    | qui + sex | ter + qua | seg + dom
 *   G2    | ter + qua | seg + dom | qui + sex
 *   G3    | seg + dom | qui + sex | ter + qua
 *
 * Ninguém de grupo folga no sábado. O rodízio vale só para quem tem grupo numa
 * vigência da jornada (regime SEMANAL); o regime 6x1 segue o rodízio antigo de
 * domingo (`escala-domingo.domain.ts`).
 *
 * Sem Prisma e sem relógio: quem chama carrega as vigências e informa o dia.
 */
import {
  GRUPOS_DOMINGO,
  GrupoDomingo,
  ehGrupoValido,
} from './escala-domingo.domain';

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const SEMANA_MS = 7 * UM_DIA_MS;
const SABADO = 6;
const DOMINGO = 0;

/** Folgas por grupo e por semana do ciclo (índice 0 = semana 1). */
export type PadraoRodizio = Readonly<
  Record<GrupoDomingo, readonly (readonly number[])[]>
>;

/** Uma vigência do rodízio de folgas. */
export interface RodizioFolgas {
  /** null numa simulação (ainda não gravada). */
  id: string | null;
  /** Segunda-feira de início, 00:00 UTC. */
  vigenteDesde: Date;
  semanasNoCiclo: number;
  padrao: PadraoRodizio;
}

/** Dias de folga por grupo por semana (5x2). */
export const FOLGAS_POR_SEMANA_RODIZIO = 2;
/** Maior ciclo aceito, em semanas. */
export const MAX_SEMANAS_CICLO = 6;
/** Acima disso de dias seguidos trabalhados, a configuração avisa (R3.4). */
export const MAX_DIAS_SEGUIDOS = 6;
/** Acima disso de domingos seguidos trabalhados, a configuração avisa (R3.4). */
export const MAX_DOMINGOS_SEGUIDOS = 2;

/** A vigência inicial (decisão 5): começa em 23/11/2026. */
export const INICIO_RODIZIO_5X2 = new Date('2026-11-23T00:00:00.000Z');
export const PADRAO_RODIZIO_5X2: PadraoRodizio = {
  G1: [
    [4, 5],
    [2, 3],
    [1, 0],
  ],
  G2: [
    [2, 3],
    [1, 0],
    [4, 5],
  ],
  G3: [
    [1, 0],
    [4, 5],
    [2, 3],
  ],
};

/** "no domingo", "na segunda"… (0 = domingo), para as frases dos avisos. */
const NO_DIA = [
  'no domingo',
  'na segunda',
  'na terça',
  'na quarta',
  'na quinta',
  'na sexta',
  'no sábado',
];

/** Ordem da semana do rodízio: de segunda a domingo. */
const SEGUNDA_A_DOMINGO = [1, 2, 3, 4, 5, 6, 0];

function meiaNoiteUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Segunda-feira (00:00 UTC) da semana do dia; a semana vai de seg a dom. */
export function segundaDaSemana(dia: Date): Date {
  const t = meiaNoiteUTC(dia);
  const dow = new Date(t).getUTCDay();
  return new Date(t - ((dow + 6) % 7) * UM_DIA_MS);
}

/** A vigência que decide o dia: a de maior início que não seja posterior a ele. */
export function rodizioNoDia(
  vigencias: readonly RodizioFolgas[],
  dia: Date,
): RodizioFolgas | null {
  const alvo = meiaNoiteUTC(dia);
  let escolhida: RodizioFolgas | null = null;
  for (const r of vigencias) {
    const inicio = meiaNoiteUTC(r.vigenteDesde);
    if (inicio > alvo) continue;
    if (!escolhida || inicio > meiaNoiteUTC(escolhida.vigenteDesde)) {
      escolhida = r;
    }
  }
  return escolhida;
}

/**
 * Semana do ciclo do dia, a partir de 0 (0 = semana 1). Conta semanas inteiras
 * de segunda a domingo desde `vigenteDesde`; repete a cada `semanasNoCiclo`.
 */
export function semanaDoCiclo(rodizio: RodizioFolgas, dia: Date): number {
  const n = rodizio.semanasNoCiclo;
  const semanas = Math.round(
    (segundaDaSemana(dia).getTime() -
      segundaDaSemana(rodizio.vigenteDesde).getTime()) /
      SEMANA_MS,
  );
  return ((semanas % n) + n) % n;
}

/** Dias de folga (0=domingo) do grupo na semana do dia. */
export function folgasDoGrupoNaSemana(
  rodizio: RodizioFolgas,
  grupo: GrupoDomingo,
  dia: Date,
): readonly number[] {
  return rodizio.padrao[grupo]?.[semanaDoCiclo(rodizio, dia)] ?? [];
}

/** Os grupos que folgam no dia (vazio no sábado e num dia sem grupo). */
export function gruposDeFolgaNoDia(
  rodizio: RodizioFolgas,
  dia: Date,
): GrupoDomingo[] {
  const dow = new Date(meiaNoiteUTC(dia)).getUTCDay();
  return GRUPOS_DOMINGO.filter((g) =>
    folgasDoGrupoNaSemana(rodizio, g, dia).includes(dow),
  );
}

// ---------------------------------------------------------------------------
// Validação (bloqueia) e avisos (não bloqueiam) — R3.3 e R3.4.
// ---------------------------------------------------------------------------

/** O que a tela manda para gravar ou simular uma vigência. */
export interface EntradaRodizio {
  vigenteDesde: Date;
  semanasNoCiclo: number;
  padrao: unknown;
}

/**
 * Erros que impedem gravar (R3.3): início numa segunda-feira; ciclo de 1 a
 * `MAX_SEMANAS_CICLO` semanas; G1, G2 e G3 com uma lista por semana; cada
 * semana com exatamente 2 dias distintos de 0 a 6, nunca o sábado. Vazio =
 * válido.
 */
export function validarRodizio(e: EntradaRodizio): string[] {
  const erros: string[] = [];
  if (Number.isNaN(e.vigenteDesde.getTime())) {
    erros.push('Data de início inválida.');
  } else if (e.vigenteDesde.getUTCDay() !== 1) {
    erros.push('O rodízio precisa começar numa segunda-feira.');
  }
  const n = e.semanasNoCiclo;
  if (!Number.isInteger(n) || n < 1 || n > MAX_SEMANAS_CICLO) {
    erros.push(`O ciclo deve ter de 1 a ${MAX_SEMANAS_CICLO} semanas.`);
    return erros;
  }
  if (!e.padrao || typeof e.padrao !== 'object' || Array.isArray(e.padrao)) {
    erros.push('Informe as folgas de G1, G2 e G3.');
    return erros;
  }
  const padrao = e.padrao as Record<string, unknown>;
  for (const chave of Object.keys(padrao)) {
    if (!ehGrupoValido(chave)) erros.push(`Grupo inválido: ${chave}.`);
  }
  for (const g of GRUPOS_DOMINGO) {
    const semanas = padrao[g];
    if (!Array.isArray(semanas) || semanas.length !== n) {
      erros.push(`${g}: informe as folgas das ${n} semana(s) do ciclo.`);
      continue;
    }
    semanas.forEach((dias: unknown, i) => {
      const rotulo = `${g}, semana ${i + 1}`;
      if (
        !Array.isArray(dias) ||
        dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
      ) {
        erros.push(`${rotulo}: dias inválidos (use 0 = domingo … 6 = sábado).`);
        return;
      }
      if (new Set(dias).size !== dias.length) {
        erros.push(`${rotulo}: dia repetido.`);
      } else if (dias.length !== FOLGAS_POR_SEMANA_RODIZIO) {
        erros.push(
          `${rotulo}: escolha exatamente ${FOLGAS_POR_SEMANA_RODIZIO} dias de folga.`,
        );
      }
      if (dias.includes(SABADO)) {
        erros.push(`${rotulo}: ninguém de grupo folga no sábado.`);
      }
    });
  }
  return erros;
}

/** Converte um padrão já validado (o JSON do banco ou da tela). */
export function padraoDe(valor: unknown): PadraoRodizio | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const p = valor as Record<string, unknown>;
  const out: Partial<Record<GrupoDomingo, number[][]>> = {};
  for (const g of GRUPOS_DOMINGO) {
    const semanas = p[g];
    if (!Array.isArray(semanas)) return null;
    const lista: number[][] = [];
    for (const dias of semanas) {
      if (!Array.isArray(dias) || dias.some((d) => !Number.isInteger(d))) {
        return null;
      }
      lista.push([...(dias as number[])]);
    }
    out[g] = lista;
  }
  return out as PadraoRodizio;
}

/** Linha do banco → vigência (null se o JSON não for um padrão). */
export function rodizioDaLinha(linha: {
  id: string;
  vigenteDesde: Date;
  semanasNoCiclo: number;
  padrao: unknown;
}): RodizioFolgas | null {
  const padrao = padraoDe(linha.padrao);
  if (!padrao || linha.semanasNoCiclo < 1) return null;
  return {
    id: linha.id,
    vigenteDesde: linha.vigenteDesde,
    semanasNoCiclo: linha.semanasNoCiclo,
    padrao,
  };
}

export type TipoAvisoRodizio =
  | 'DIA_SEM_GRUPO'
  | 'DIA_COM_VARIOS_GRUPOS'
  | 'DIAS_SEGUIDOS'
  | 'DOMINGOS_SEGUIDOS';

/** Um aviso da configuração (não impede gravar). */
export interface AvisoRodizio {
  tipo: TipoAvisoRodizio;
  grupo: GrupoDomingo | null;
  /** Semana do ciclo, a partir de 1, quando o aviso é de uma semana. */
  semana: number | null;
  diaSemana: number | null;
  mensagem: string;
}

/** Folgas de um grupo na semana `i` do ciclo (0-based, cíclico). */
function folgasNaSemana(
  rodizio: Pick<RodizioFolgas, 'semanasNoCiclo' | 'padrao'>,
  grupo: GrupoDomingo,
  i: number,
): readonly number[] {
  const n = rodizio.semanasNoCiclo;
  return rodizio.padrao[grupo]?.[((i % n) + n) % n] ?? [];
}

/** Maior sequência de `true` num ciclo que se repete (Infinity se tudo `true`). */
function maiorSequenciaCiclica(valores: readonly boolean[]): number {
  if (valores.length === 0) return 0;
  if (valores.every(Boolean)) return Infinity;
  let maior = 0;
  let atual = 0;
  for (const v of [...valores, ...valores]) {
    atual = v ? atual + 1 : 0;
    maior = Math.max(maior, atual);
  }
  return maior;
}

/**
 * Avisos da configuração (R3.4), sem bloquear:
 *
 * - dia da semana (fora o sábado) sem nenhum grupo de folga, ou com mais de um;
 * - grupo com mais de `MAX_DIAS_SEGUIDOS` dias seguidos trabalhados;
 * - grupo com mais de `MAX_DOMINGOS_SEGUIDOS` domingos seguidos trabalhados —
 *   também na passagem do rodízio anterior, quando `folgaNoDomingoAnterior`
 *   diz quem folgou nos domingos antes do início (o rodízio antigo de domingo
 *   ou a vigência anterior).
 */
export function avisosDoRodizio(
  rodizio: Pick<RodizioFolgas, 'vigenteDesde' | 'semanasNoCiclo' | 'padrao'>,
  folgaNoDomingoAnterior?: (domingo: Date) => GrupoDomingo | null,
): AvisoRodizio[] {
  const avisos: AvisoRodizio[] = [];
  const n = rodizio.semanasNoCiclo;

  // Cobertura: um grupo de folga por dia (o sábado não tem nenhum, por regra).
  for (let i = 0; i < n; i++) {
    for (const dow of SEGUNDA_A_DOMINGO) {
      if (dow === SABADO) continue;
      const grupos = GRUPOS_DOMINGO.filter((g) =>
        folgasNaSemana(rodizio, g, i).includes(dow),
      );
      if (grupos.length === 0) {
        avisos.push({
          tipo: 'DIA_SEM_GRUPO',
          grupo: null,
          semana: i + 1,
          diaSemana: dow,
          mensagem: `Semana ${i + 1}: nenhum grupo folga ${NO_DIA[dow]}.`,
        });
      } else if (grupos.length > 1) {
        avisos.push({
          tipo: 'DIA_COM_VARIOS_GRUPOS',
          grupo: null,
          semana: i + 1,
          diaSemana: dow,
          mensagem: `Semana ${i + 1}: ${grupos.join(' e ')} folgam juntos ${NO_DIA[dow]}.`,
        });
      }
    }
  }

  for (const g of GRUPOS_DOMINGO) {
    // Dias seguidos trabalhados, de segunda a domingo, com o ciclo repetindo.
    const trabalha: boolean[] = [];
    for (let i = 0; i < n; i++) {
      for (const dow of SEGUNDA_A_DOMINGO) {
        trabalha.push(!folgasNaSemana(rodizio, g, i).includes(dow));
      }
    }
    const seguidos = maiorSequenciaCiclica(trabalha);
    if (seguidos > MAX_DIAS_SEGUIDOS) {
      avisos.push({
        tipo: 'DIAS_SEGUIDOS',
        grupo: g,
        semana: null,
        diaSemana: null,
        mensagem: Number.isFinite(seguidos)
          ? `${g} trabalha ${seguidos} dias seguidos (o máximo é ${MAX_DIAS_SEGUIDOS}).`
          : `${g} não tem folga no ciclo.`,
      });
    }

    // Domingos seguidos: dentro do ciclo e, se souber, na passagem.
    const domingos: boolean[] = [];
    for (let i = 0; i < n; i++) {
      domingos.push(!folgasNaSemana(rodizio, g, i).includes(DOMINGO));
    }
    const noCiclo = maiorSequenciaCiclica(domingos);
    let naPassagem = 0;
    if (folgaNoDomingoAnterior) {
      // Domingos trabalhados logo antes do início, do mais próximo para trás.
      const inicio = segundaDaSemana(rodizio.vigenteDesde).getTime();
      let antes = 0;
      for (let k = 1; k <= MAX_DOMINGOS_SEGUIDOS + 1; k++) {
        const domingo = new Date(inicio - (7 * (k - 1) + 1) * UM_DIA_MS);
        const folgou = folgaNoDomingoAnterior(domingo);
        if (folgou == null || folgou === g) break;
        antes++;
      }
      let depois = 0;
      for (let i = 0; i < 2 * n && domingos[i % n]; i++) depois++;
      naPassagem = antes + depois;
    }
    if (noCiclo > MAX_DOMINGOS_SEGUIDOS) {
      avisos.push({
        tipo: 'DOMINGOS_SEGUIDOS',
        grupo: g,
        semana: null,
        diaSemana: DOMINGO,
        mensagem: Number.isFinite(noCiclo)
          ? `${g} trabalha ${noCiclo} domingos seguidos (o máximo é ${MAX_DOMINGOS_SEGUIDOS}).`
          : `${g} não folga nenhum domingo no ciclo.`,
      });
    } else if (naPassagem > MAX_DOMINGOS_SEGUIDOS) {
      avisos.push({
        tipo: 'DOMINGOS_SEGUIDOS',
        grupo: g,
        semana: null,
        diaSemana: DOMINGO,
        mensagem: `${g} trabalha ${naPassagem} domingos seguidos na passagem do rodízio anterior para este (o máximo é ${MAX_DOMINGOS_SEGUIDOS}).`,
      });
    }
  }
  return avisos;
}

// ---------------------------------------------------------------------------
// Prévia (R3.5): quem folga em cada dia das próximas semanas.
// ---------------------------------------------------------------------------

/** De onde veio o grupo de folga do dia na prévia. */
export type FontePrevia = 'RODIZIO' | 'DOMINGO_ANTIGO';

export interface DiaPrevia {
  /** yyyy-mm-dd */
  data: string;
  diaSemana: number;
  /** Grupos que folgam no dia (vazio = nenhum). */
  grupos: GrupoDomingo[];
  /** null quando nenhum rodízio decide o dia. */
  fonte: FontePrevia | null;
}

export interface SemanaPrevia {
  /** Segunda-feira da semana (yyyy-mm-dd). */
  inicio: string;
  /** Semana do ciclo, a partir de 1; null antes do primeiro rodízio. */
  semanaDoCiclo: number | null;
  dias: DiaPrevia[];
}

/**
 * Semanas de segunda a domingo a partir da semana de `desde`. Os dias cobertos
 * por uma vigência mostram o rodízio de folgas; antes dela, só os domingos têm
 * grupo, pelo rodízio antigo (`domingoAntigo`), para conferir a continuidade.
 */
export function previaDoRodizio(
  vigencias: readonly RodizioFolgas[],
  desde: Date,
  semanas: number,
  domingoAntigo?: (domingo: Date) => GrupoDomingo | null,
): SemanaPrevia[] {
  const out: SemanaPrevia[] = [];
  const primeira = segundaDaSemana(desde).getTime();
  for (let s = 0; s < semanas; s++) {
    const segunda = new Date(primeira + s * SEMANA_MS);
    const rodizioDaSemana = rodizioNoDia(vigencias, segunda);
    const dias: DiaPrevia[] = [];
    for (let k = 0; k < 7; k++) {
      const dia = new Date(segunda.getTime() + k * UM_DIA_MS);
      const r = rodizioNoDia(vigencias, dia);
      let grupos: GrupoDomingo[] = [];
      let fonte: FontePrevia | null = null;
      if (r) {
        grupos = gruposDeFolgaNoDia(r, dia);
        fonte = 'RODIZIO';
      } else if (dia.getUTCDay() === DOMINGO && domingoAntigo) {
        const g = domingoAntigo(dia);
        if (g) {
          grupos = [g];
          fonte = 'DOMINGO_ANTIGO';
        }
      }
      dias.push({
        data: dia.toISOString().slice(0, 10),
        diaSemana: dia.getUTCDay(),
        grupos,
        fonte,
      });
    }
    out.push({
      inicio: segunda.toISOString().slice(0, 10),
      semanaDoCiclo: rodizioDaSemana
        ? semanaDoCiclo(rodizioDaSemana, segunda) + 1
        : null,
      dias,
    });
  }
  return out;
}
