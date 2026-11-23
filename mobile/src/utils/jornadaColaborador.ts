/**
 * Edição da jornada na ficha do colaborador (funções puras; spec `jornada-5x2`,
 * Fase 4). A validação que vale é a do backend (`validarVigencia`); aqui só se
 * evita mandar o que certamente será recusado e se mostra o que falta.
 */
import type {
  AvisoJornada,
  JornadaInput,
  VigenciaJornada,
} from '../api/services/jornadaColaborador';
import { NOME_CURTO_DIA, SABADO, SEMANA_SEG_DOM } from './rodizioFolgas';

export { NOME_CURTO_DIA, SEMANA_SEG_DOM };

export const GRUPOS_JORNADA = ['G1', 'G2', 'G3'];

/** Início do 5x2: data das vigências do corte (decisão do dono). */
export const INICIO_5X2_ISO = '2026-11-23';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Uma linha da disponibilidade na tela (texto livre "HH:mm"). */
export interface LinhaHorario {
  diaSemana: number;
  entrada: string;
  saida: string;
}

/** O que a tela edita da jornada. */
export interface EdicaoJornada {
  /** 'G1' | 'G2' | 'G3' ou null (sem grupo). */
  grupo: string | null;
  /** Só sem grupo; vazio = as padrão do contrato. */
  folgasFixas: number[];
  /** Sete linhas, de segunda a domingo. */
  linhas: LinhaHorario[];
  /** Contrato escolhido (só o administrador troca). */
  contratoId: string | null;
}

/** O que o contrato limita nas folgas fixas. */
export interface LimitesFolga {
  folgasPorSemana: number;
  permiteFolgaSabado: boolean;
}

export function linhasVazias(): LinhaHorario[] {
  return SEMANA_SEG_DOM.map((diaSemana) => ({
    diaSemana,
    entrada: '',
    saida: '',
  }));
}

export function edicaoVazia(contratoId: string | null = null): EdicaoJornada {
  return { grupo: null, folgasFixas: [], linhas: linhasVazias(), contratoId };
}

/** A edição a partir de uma vigência gravada. */
export function edicaoDaVigencia(v: VigenciaJornada): EdicaoJornada {
  const porDia = new Map(v.disponibilidade.map((d) => [d.diaSemana, d]));
  return {
    grupo: v.grupo,
    folgasFixas: [...v.folgasFixas],
    linhas: SEMANA_SEG_DOM.map((diaSemana) => ({
      diaSemana,
      entrada: porDia.get(diaSemana)?.entrada ?? '',
      saida: porDia.get(diaSemana)?.saida ?? '',
    })),
    contratoId: v.tipoContratoJornadaId,
  };
}

/** Troca a entrada ou a saída de um dia. */
export function comHorario(
  linhas: readonly LinhaHorario[],
  diaSemana: number,
  campo: 'entrada' | 'saida',
  valor: string,
): LinhaHorario[] {
  return linhas.map((l) =>
    l.diaSemana === diaSemana ? { ...l, [campo]: valor } : l,
  );
}

/** "Copiar a primeira para todas": o horário de segunda vai para os sete dias. */
export function copiarPrimeira(
  linhas: readonly LinhaHorario[],
): LinhaHorario[] {
  const primeira = linhas[0];
  if (!primeira) return [...linhas];
  return linhas.map((l) => ({
    ...l,
    entrada: primeira.entrada,
    saida: primeira.saida,
  }));
}

/** Marca/desmarca uma folga fixa (ordem de segunda a domingo). */
export function alternarFolgaFixa(
  folgas: readonly number[],
  dia: number,
): number[] {
  const nova = folgas.includes(dia)
    ? folgas.filter((d) => d !== dia)
    : [...folgas, dia];
  return nova.sort(
    (a, b) => SEMANA_SEG_DOM.indexOf(a) - SEMANA_SEG_DOM.indexOf(b),
  );
}

const limpo = (t: string) => t.trim();

/** Algum campo da jornada foi preenchido? */
export function jornadaPreenchida(e: EdicaoJornada): boolean {
  return (
    e.grupo != null ||
    e.folgasFixas.length > 0 ||
    e.linhas.some((l) => limpo(l.entrada) !== '' || limpo(l.saida) !== '')
  );
}

/** As duas edições descrevem a mesma jornada? */
export function mesmaJornada(a: EdicaoJornada, b: EdicaoJornada): boolean {
  const chave = (e: EdicaoJornada) =>
    JSON.stringify({
      grupo: e.grupo,
      folgas: e.grupo ? [] : [...e.folgasFixas].sort(),
      linhas: [...e.linhas]
        .sort((x, y) => x.diaSemana - y.diaSemana)
        .map((l) => [l.diaSemana, limpo(l.entrada), limpo(l.saida)]),
      contrato: e.contratoId,
    });
  return chave(a) === chave(b);
}

/** O que impede salvar, em frases para o usuário (vazio = pode salvar). */
export function pendenciasDaJornada(
  e: EdicaoJornada,
  limites: LimitesFolga | null,
): string[] {
  const erros: string[] = [];
  for (const l of e.linhas) {
    const nome = NOME_CURTO_DIA[l.diaSemana];
    const ent = limpo(l.entrada);
    const sai = limpo(l.saida);
    if (!ent && !sai) continue;
    if (!ent || !sai) {
      erros.push(`${nome}: informe entrada e saída (ou deixe as duas vazias).`);
      continue;
    }
    if (!HHMM.test(ent) || !HHMM.test(sai)) {
      erros.push(`${nome}: use HH:mm (ex.: 06:50).`);
      continue;
    }
    if (sai <= ent) erros.push(`${nome}: a saída deve ser depois da entrada.`);
  }
  if (!e.grupo && limites) {
    if (e.folgasFixas.length > limites.folgasPorSemana) {
      erros.push(
        `No máximo ${limites.folgasPorSemana} folga(s) fixa(s) neste contrato.`,
      );
    }
    if (e.folgasFixas.includes(SABADO) && !limites.permiteFolgaSabado) {
      erros.push('Este contrato não permite folga no sábado.');
    }
  }
  return erros;
}

/**
 * Data sugerida para "Vale a partir de": quem ainda está no 6x1 recebe o início
 * do 5x2 (todas as vigências do corte são de 23/11); depois disso, hoje.
 */
export function dataInicialSugerida(
  temVigencia: boolean,
  hoje: string,
): string {
  if (!temVigencia && hoje >= INICIO_5X2_ISO) return INICIO_5X2_ISO;
  return hoje;
}

/** Corpo do `PUT` (ou do bloco do cadastro). */
export function paraGravar(
  e: EdicaoJornada,
  aPartirDe: string,
  incluirContrato: boolean,
): JornadaInput {
  return {
    aPartirDe,
    ...(incluirContrato && e.contratoId
      ? { tipoContratoJornadaId: e.contratoId }
      : {}),
    grupo: e.grupo,
    folgasFixas: e.grupo ? [] : [...e.folgasFixas],
    disponibilidade: e.linhas
      .filter((l) => limpo(l.entrada) && limpo(l.saida))
      .map((l) => ({
        diaSemana: l.diaSemana,
        entrada: limpo(l.entrada),
        saida: limpo(l.saida),
      })),
  };
}

/** "Seg, Qua" (de segunda a domingo); vazio = "—". */
export function textoDias(dias: readonly number[]): string {
  const ordenados = [...dias].sort(
    (a, b) => SEMANA_SEG_DOM.indexOf(a) - SEMANA_SEG_DOM.indexOf(b),
  );
  return ordenados.length
    ? ordenados.map((d) => NOME_CURTO_DIA[d]).join(', ')
    : '—';
}

/** Os avisos em linhas, para o diálogo depois de salvar. */
export function textoAvisos(avisos: readonly AvisoJornada[]): string {
  return avisos.map((a) => `• ${a.mensagem}`).join('\n');
}
