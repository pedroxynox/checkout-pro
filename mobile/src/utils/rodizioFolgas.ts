/**
 * Edição do rodízio de folgas na tela (funções puras). A validação que vale é a
 * do backend (`validarRodizio`); aqui só se evita mandar o que certamente será
 * recusado e se mostra o que falta.
 */
import type {
  GrupoRodizio,
  PadraoRodizio,
} from '../api/services/rodizioFolgas';

export const GRUPOS_RODIZIO: GrupoRodizio[] = ['G1', 'G2', 'G3'];
/** Ordem da semana do rodízio: de segunda a domingo (0 = domingo). */
export const SEMANA_SEG_DOM = [1, 2, 3, 4, 5, 6, 0];
export const NOME_CURTO_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const SABADO = 6;
/** Dias de folga por grupo e semana (5x2). */
export const FOLGAS_POR_SEMANA = 2;
export const MAX_SEMANAS = 6;

/** A tabela da decisão 5 (vigência de 23/11/2026). */
export const PADRAO_5X2: PadraoRodizio = {
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

/** Cópia profunda (o estado da tela não pode compartilhar arranjos). */
export function copiarPadrao(p: PadraoRodizio): PadraoRodizio {
  return {
    G1: p.G1.map((s) => [...s]),
    G2: p.G2.map((s) => [...s]),
    G3: p.G3.map((s) => [...s]),
  };
}

/** Ajusta o número de semanas: corta as que sobram e cria vazias as novas. */
export function comSemanas(p: PadraoRodizio, semanas: number): PadraoRodizio {
  const ajustar = (lista: number[][]) =>
    Array.from({ length: semanas }, (_, i) => [...(lista[i] ?? [])]);
  return { G1: ajustar(p.G1), G2: ajustar(p.G2), G3: ajustar(p.G3) };
}

/**
 * Marca/desmarca um dia de folga do grupo na semana. O sábado não entra, e um
 * terceiro dia não entra (cada semana tem exatamente 2): devolve o mesmo
 * padrão.
 */
export function alternarFolga(
  p: PadraoRodizio,
  grupo: GrupoRodizio,
  semana: number,
  dia: number,
): PadraoRodizio {
  const atual = p[grupo][semana] ?? [];
  if (atual.includes(dia)) {
    const novo = copiarPadrao(p);
    novo[grupo][semana] = atual.filter((d) => d !== dia);
    return novo;
  }
  if (dia === SABADO || atual.length >= FOLGAS_POR_SEMANA) return p;
  const novo = copiarPadrao(p);
  novo[grupo][semana] = [...atual, dia];
  return novo;
}

/** O que falta para poder salvar (vazio = pronto). */
export function pendenciasDoRodizio(
  inicioISO: string | null,
  p: PadraoRodizio,
): string[] {
  const out: string[] = [];
  if (!inicioISO) {
    out.push('Informe a data de início (dd/mm/aaaa).');
  } else if (new Date(`${inicioISO}T00:00:00.000Z`).getUTCDay() !== 1) {
    out.push('A data de início precisa ser uma segunda-feira.');
  }
  for (const g of GRUPOS_RODIZIO) {
    p[g].forEach((dias, i) => {
      if (dias.length !== FOLGAS_POR_SEMANA) {
        out.push(`${g}, semana ${i + 1}: marque ${FOLGAS_POR_SEMANA} dias.`);
      }
    });
  }
  return out;
}

/** Os dias de uma semana do grupo em texto: "qui + sex". */
export function textoFolgas(dias: readonly number[]): string {
  if (dias.length === 0) return '—';
  return SEMANA_SEG_DOM.filter((d) => dias.includes(d))
    .map((d) => NOME_CURTO_DIA[d].toLowerCase())
    .join(' + ');
}
