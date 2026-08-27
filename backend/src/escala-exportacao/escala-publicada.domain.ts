/**
 * Escala PUBLICADA (lógica pura, sem I/O).
 *
 * É a escala como ela vai ser **entregue à equipe**: uma linha por pessoa, com o
 * turno do dia (entrada e saída) e o estado dela naquele dia. Diferente do
 * Quadro de Operadores — que é uma tela de gestão e cobre só operadores —, aqui
 * entra **todo o time** (operadores, fiscais e supervisores) e o resultado é
 * pensado para virar um PDF/imagem que o colaborador lê no celular.
 *
 * Duas decisões deliberadas, porque mudam o que a pessoa entende ao abrir a
 * escala:
 *
 * 1. **Quem não trabalha também aparece** (folga, falta, atestado, férias). Numa
 *    escala publicada, quem não se vê na lista não conclui "eu folgo": conclui
 *    "me esqueceram". O silêncio gera a pergunta que a escala deveria evitar.
 * 2. **Quem falta mantém o horário previsto ao lado.** Assim quem lê sabe qual
 *    turno ficou descoberto, e não só que alguém faltou.
 *
 * A decisão de horário/folga continua sendo das regras já existentes
 * (`escala-domingo.domain`): aqui só se combina o resultado com as ocorrências
 * do dia e se organiza para apresentação.
 */
import {
  FichaEscalaTurno,
  GrupoDomingo,
  entradaEsperadaNoDia,
  saidaEsperadaNoDia,
} from '../escala-domingo/escala-domingo.domain';

/** Funções que entram na escala publicada (gerência não é escalada). */
export type FuncaoEscala = 'OPERADOR' | 'FISCAL' | 'SUPERVISOR';

/** Estado de uma pessoa num dia da escala. */
export type StatusEscala =
  | 'TRABALHA'
  | 'FOLGA'
  | 'FALTA'
  | 'ATESTADO'
  | 'FERIAS';

/** Ficha necessária para montar a linha da escala. */
export interface FichaColaboradorEscala extends FichaEscalaTurno {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoEscala;
  /** Turno do cadastro (ABERTURA/INTERMEDIARIO/FECHAMENTO/APOIO) ou null. */
  turno: string | null;
}

/** Exceção individual gravada para o dia da semana (prevalece sobre o turno). */
export interface HorarioEspecialDia {
  entrada: string | null;
  saida: string | null;
  folga: boolean;
}

/** Ausência registrada no dia (falta comum ou atestado médico). */
export interface OcorrenciaDia {
  ehAtestado: boolean;
}

/** Uma linha da escala publicada. */
export interface LinhaEscala {
  colaboradorId: string;
  nome: string;
  funcao: FuncaoEscala;
  turno: string | null;
  status: StatusEscala;
  /** Turno do dia ("HH:mm"), mantido também quando a pessoa faltou. */
  entrada: string | null;
  saida: string | null;
  /** true quando o horário do dia vem de uma exceção individual. */
  horarioEspecial: boolean;
}

/**
 * Monta a linha de uma pessoa num dia.
 *
 * Precedência (a ordem importa e é o coração desta função):
 *  1. **Férias** — período aprovado ganha de tudo; não há turno nem falta.
 *  2. **Horário especial** do dia da semana — é a exceção que o gestor cadastrou
 *     justamente para prevalecer sobre o turno padrão.
 *  3. **Turno do cadastro**, pelas regras de dia útil / fim de semana / domingo
 *     com rodízio / feriado.
 *  4. **Sem turno no dia** ⇒ folga (é o que "sem horário" significa aqui).
 *  5. **Ausência** só é aplicada a quem deveria trabalhar: falta em dia de folga
 *     não existe, e mostrá-la assustaria quem lê.
 */
export function montarLinhaEscala(params: {
  ficha: FichaColaboradorEscala;
  dia: Date;
  ancoraDomingo: { data: Date; ordem: readonly GrupoDomingo[] } | null;
  ehFeriado: boolean;
  deFerias: boolean;
  especial: HorarioEspecialDia | null;
  ocorrencia: OcorrenciaDia | null;
}): LinhaEscala {
  const { ficha, dia, ancoraDomingo, ehFeriado, deFerias, especial, ocorrencia } =
    params;
  const base = {
    colaboradorId: ficha.colaboradorId,
    nome: ficha.nome,
    funcao: ficha.funcao,
    turno: ficha.turno,
  };

  if (deFerias) {
    return {
      ...base,
      status: 'FERIAS',
      entrada: null,
      saida: null,
      horarioEspecial: false,
    };
  }

  const usaEspecial = especial != null;
  const entrada = usaEspecial
    ? especial.folga
      ? null
      : especial.entrada
    : entradaEsperadaNoDia(ficha, dia, ancoraDomingo, ehFeriado);
  const saida = usaEspecial
    ? especial.folga
      ? null
      : especial.saida
    : saidaEsperadaNoDia(ficha, dia, ancoraDomingo, ehFeriado);

  if (!entrada) {
    return {
      ...base,
      status: 'FOLGA',
      entrada: null,
      saida: null,
      horarioEspecial: usaEspecial,
    };
  }

  return {
    ...base,
    status: ocorrencia ? (ocorrencia.ehAtestado ? 'ATESTADO' : 'FALTA') : 'TRABALHA',
    entrada,
    saida,
    horarioEspecial: usaEspecial,
  };
}

/** "HH:mm" → minutos desde a meia-noite; null quando não dá para ler. */
export function minutosDoHorario(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Ordem de leitura dentro de um grupo: quem entra mais cedo primeiro (é a ordem
 * em que o dia acontece na loja) e, no empate, por nome. Quem não trabalha vai
 * para o fim, em ordem alfabética — não tem hora para competir.
 */
export function ordenarLinhas(linhas: readonly LinhaEscala[]): LinhaEscala[] {
  return linhas.slice().sort((a, b) => {
    const aTrabalha = a.entrada != null;
    const bTrabalha = b.entrada != null;
    if (aTrabalha !== bTrabalha) return aTrabalha ? -1 : 1;
    if (!aTrabalha) return a.nome.localeCompare(b.nome);
    const ea = minutosDoHorario(a.entrada) ?? 0;
    const eb = minutosDoHorario(b.entrada) ?? 0;
    return ea - eb || a.nome.localeCompare(b.nome);
  });
}

/** Ordem fixa das seções da escala publicada. */
export const ORDEM_FUNCOES: FuncaoEscala[] = [
  'SUPERVISOR',
  'FISCAL',
  'OPERADOR',
];

/** Uma seção da escala (as pessoas de uma função), já ordenada. */
export interface SecaoEscala {
  funcao: FuncaoEscala;
  linhas: LinhaEscala[];
}

/**
 * Agrupa por função na ordem fixa `ORDEM_FUNCOES`, ordenando cada grupo.
 *
 * A posição das seções é **fixa de propósito**: uma escala que muda de forma a
 * cada dia obriga a reler tudo para achar o próprio nome. Seções vazias são
 * omitidas (não há o que ler nelas).
 */
export function agruparPorFuncao(
  linhas: readonly LinhaEscala[],
): SecaoEscala[] {
  return ORDEM_FUNCOES.map((funcao) => ({
    funcao,
    linhas: ordenarLinhas(linhas.filter((l) => l.funcao === funcao)),
  })).filter((s) => s.linhas.length > 0);
}

/** Contagens do dia, para o cabeçalho da escala. */
export interface TotaisEscala {
  trabalhando: number;
  folgas: number;
  faltas: number;
  atestados: number;
  ferias: number;
}

/** Conta cada estado do dia. */
export function totaisEscala(linhas: readonly LinhaEscala[]): TotaisEscala {
  const conta = (s: StatusEscala): number =>
    linhas.filter((l) => l.status === s).length;
  return {
    trabalhando: conta('TRABALHA'),
    folgas: conta('FOLGA'),
    faltas: conta('FALTA'),
    atestados: conta('ATESTADO'),
    ferias: conta('FERIAS'),
  };
}

/** Meia-noite UTC do dia civil de uma data ISO (`yyyy-mm-dd`). */
export function diaUTC(dataISO: string): Date {
  return new Date(`${dataISO.slice(0, 10)}T00:00:00.000Z`);
}

/** `yyyy-mm-dd` de uma data (em UTC). */
export function isoDoDia(dia: Date): string {
  return dia.toISOString().slice(0, 10);
}

/**
 * A semana de trabalho que contém `dataISO`, de **segunda a domingo** (7 dias).
 *
 * Segunda como primeiro dia porque é assim que a loja fala da semana; o domingo
 * fecha a lista por ser o dia do rodízio, que é o que mais gera dúvida.
 */
export function semanaDe(dataISO: string): string[] {
  const dia = diaUTC(dataISO);
  const dow = dia.getUTCDay();
  // Domingo (0) pertence à semana que começou na segunda anterior.
  const recuo = dow === 0 ? 6 : dow - 1;
  const segunda = new Date(dia);
  segunda.setUTCDate(segunda.getUTCDate() - recuo);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setUTCDate(d.getUTCDate() + i);
    return isoDoDia(d);
  });
}
