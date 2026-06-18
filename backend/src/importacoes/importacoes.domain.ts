/**
 * Lógica de domínio **pura** do Modulo_Importacoes.
 *
 * Estas funções não dependem do Nest nem do banco de dados. Elas concentram as
 * decisões de validação de colunas (1.1.6), vinculação por nome / fila de não
 * reconhecidos (1.1.7, 1.1.8), status diário por arquivo e pendentes (1.2,
 * 1.4.1) e ordenação/filtragem do histórico (1.3.2, 1.3.3).
 *
 * Por serem puras e determinísticas, podem ser exercitadas por testes de
 * propriedade (fast-check) sem qualquer infraestrutura.
 *
 * Requisitos: 1.1 (importação/validação/vinculação), 1.2 (status do dia),
 * 1.3 (histórico) e 1.4 (pendentes de fim do dia).
 */

/** Os quatro tipos de arquivo importáveis (Req 1.1.1). */
export type TipoArquivo =
  | 'CANCELAMENTO_ITENS'
  | 'TROCO_SOLIDARIO'
  | 'RECARGAS_CELULAR'
  | 'DEVOLUCOES';

/** Tipo de registro operacional persistido (enum do Prisma). */
export type TipoRegistro = 'CANCELAMENTO' | 'TROCO' | 'RECARGA' | 'DEVOLUCAO';

/** Lista canônica dos quatro tipos de arquivo. */
export const TIPOS_ARQUIVO: readonly TipoArquivo[] = Object.freeze([
  'CANCELAMENTO_ITENS',
  'TROCO_SOLIDARIO',
  'RECARGAS_CELULAR',
  'DEVOLUCOES',
]);

/** Mapeia o tipo de arquivo para o tipo de registro operacional persistido. */
export const TIPO_ARQUIVO_PARA_REGISTRO: Readonly<
  Record<TipoArquivo, TipoRegistro>
> = Object.freeze({
  CANCELAMENTO_ITENS: 'CANCELAMENTO',
  TROCO_SOLIDARIO: 'TROCO',
  RECARGAS_CELULAR: 'RECARGA',
  DEVOLUCOES: 'DEVOLUCAO',
});

/**
 * Colunas obrigatórias para qualquer um dos quatro arquivos (Req 1.1.2–1.1.6):
 * data, nome (do operador ou fiscal) e valor.
 */
export const COLUNAS_OBRIGATORIAS: readonly string[] = Object.freeze([
  'data',
  'nome',
  'valor',
]);

/** Uma linha já parseada de um arquivo importado. */
export interface LinhaImportada {
  data: Date;
  nome: string; // nome do operador (ou fiscal, para DEVOLUCOES)
  valor: number; // em reais
}

/** Resultado da validação de colunas de um arquivo. */
export interface ResultadoValidacao {
  valido: boolean;
  colunasAusentes: string[];
  mensagem?: string;
}

/** Pessoa cadastrada (operador ou fiscal) candidata à vinculação por nome. */
export interface PessoaCadastrada {
  id: string;
  nome: string;
  tipo: 'OPERADOR' | 'FISCAL';
}

/** Uma linha vinculada a uma pessoa cadastrada. */
export interface LinhaVinculada {
  linha: LinhaImportada;
  pessoa: PessoaCadastrada;
}

/**
 * Particionamento de um conjunto de linhas entre as que foram vinculadas a uma
 * pessoa cadastrada e as que não foram reconhecidas (Req 1.1.7, 1.1.8).
 */
export interface ParticaoImportacao {
  vinculados: LinhaVinculada[];
  naoReconhecidos: LinhaImportada[];
}

/**
 * Registro de uma importação para fins de histórico (Req 1.3). Inclui apenas
 * os campos necessários à ordenação (importadoEm) e à filtragem por intervalo
 * (dataReferencia), de modo a aceitar tanto o modelo persistido quanto objetos
 * de teste.
 */
export interface RegistroHistorico {
  dataReferencia: Date;
  importadoEm: Date;
}

/** Intervalo de datas inclusivo em ambos os extremos. */
export interface IntervaloDatas {
  inicio: Date;
  fim: Date;
}

/**
 * Normaliza um nome de coluna para comparação: minúsculas e sem espaços nas
 * bordas. Mantém os acentos (os cabeçalhos esperados não os utilizam).
 */
function normalizarColuna(coluna: string): string {
  return coluna.trim().toLowerCase();
}

/**
 * Valida que o cabeçalho de um arquivo contém todas as colunas obrigatórias
 * (data, nome, valor) — Requisito 1.1.6. Quando inválido, reporta exatamente
 * as colunas obrigatórias ausentes (preservando a ordem canônica).
 *
 * A validação é a mesma para os quatro tipos de arquivo (todos exigem as três
 * colunas); o parâmetro `tipo` é mantido para extensão futura e simetria de
 * interface.
 */
export function validarColunas(
  _tipo: TipoArquivo,
  cabecalho: readonly string[],
): ResultadoValidacao {
  const presentes = new Set(cabecalho.map(normalizarColuna));
  const colunasAusentes = COLUNAS_OBRIGATORIAS.filter(
    (obrigatoria) => !presentes.has(obrigatoria),
  );
  if (colunasAusentes.length === 0) {
    return { valido: true, colunasAusentes: [] };
  }
  return {
    valido: false,
    colunasAusentes,
    mensagem:
      colunasAusentes.length === 1
        ? `Coluna obrigatória ausente: ${colunasAusentes[0]}.`
        : `Colunas obrigatórias ausentes: ${colunasAusentes.join(', ')}.`,
  };
}

/**
 * Normaliza um nome para a comparação de vinculação: remove espaços nas bordas,
 * colapsa espaços internos e ignora diferença de maiúsculas/minúsculas e
 * acentuação (Req 1.1.7). Assim "José  Silva" e "jose silva" correspondem.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Tenta vincular um nome a uma pessoa cadastrada por correspondência de nome
 * (Req 1.1.7). Retorna a primeira pessoa cujo nome normalizado corresponde, ou
 * `null` quando nenhum corresponde (Req 1.1.8).
 */
export function vincularPorNome(
  pessoas: readonly PessoaCadastrada[],
  nome: string,
): PessoaCadastrada | null {
  const alvo = normalizarNome(nome);
  return pessoas.find((p) => normalizarNome(p.nome) === alvo) ?? null;
}

/**
 * Particiona cada linha importada entre vinculada a uma pessoa cadastrada (por
 * nome) e não reconhecida (Req 1.1.7, 1.1.8). Cada linha cai em **exatamente
 * um** dos dois conjuntos: nunca em ambos e nunca em nenhum.
 */
export function particionarLinhas(
  linhas: readonly LinhaImportada[],
  pessoas: readonly PessoaCadastrada[],
): ParticaoImportacao {
  const vinculados: LinhaVinculada[] = [];
  const naoReconhecidos: LinhaImportada[] = [];

  for (const linha of linhas) {
    const pessoa = vincularPorNome(pessoas, linha.nome);
    if (pessoa) {
      vinculados.push({ linha, pessoa });
    } else {
      naoReconhecidos.push(linha);
    }
  }

  return { vinculados, naoReconhecidos };
}

/**
 * Deriva a lista de nomes não reconhecidos (para revisão) a partir de uma
 * partição, sem duplicatas e preservando a ordem de primeira ocorrência
 * (Req 1.1.8).
 */
export function nomesNaoReconhecidos(particao: ParticaoImportacao): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const { nome } of particao.naoReconhecidos) {
    const chave = normalizarNome(nome);
    if (!vistos.has(chave)) {
      vistos.add(chave);
      resultado.push(nome);
    }
  }
  return resultado;
}

/**
 * Calcula o status de cada um dos quatro tipos de arquivo de um dia
 * (Req 1.2.1–1.2.3): "importado" se e somente se o tipo consta no conjunto de
 * tipos importados naquele dia; caso contrário, "pendente".
 */
export function statusDoDia(
  tiposImportados: readonly TipoArquivo[],
): Record<TipoArquivo, 'importado' | 'pendente'> {
  const importados = new Set(tiposImportados);
  const status = {} as Record<TipoArquivo, 'importado' | 'pendente'>;
  for (const tipo of TIPOS_ARQUIVO) {
    status[tipo] = importados.has(tipo) ? 'importado' : 'pendente';
  }
  return status;
}

/**
 * Retorna os tipos de arquivo pendentes de um dia (Req 1.4.1): exatamente o
 * complemento dos tipos importados em relação aos quatro tipos canônicos,
 * preservando a ordem canônica.
 */
export function tiposPendentes(
  tiposImportados: readonly TipoArquivo[],
): TipoArquivo[] {
  const importados = new Set(tiposImportados);
  return TIPOS_ARQUIVO.filter((tipo) => !importados.has(tipo));
}

/**
 * Verifica se uma data está dentro do intervalo (inclusivo em ambos os
 * extremos).
 */
function dentroDoIntervalo(data: Date, intervalo: IntervaloDatas): boolean {
  const t = data.getTime();
  return t >= intervalo.inicio.getTime() && t <= intervalo.fim.getTime();
}

/**
 * Monta o histórico de importações (Req 1.3.2, 1.3.3):
 *
 * - quando um intervalo é informado, inclui **apenas** os registros cuja data
 *   de referência está dentro do intervalo (1.3.3);
 * - ordena o resultado da importação mais recente para a mais antiga, pela
 *   data/hora de importação `importadoEm` (1.3.2). Em caso de empate, mantém a
 *   ordem estável de entrada.
 *
 * A função não muta o array de entrada.
 */
export function historico<T extends RegistroHistorico>(
  registros: readonly T[],
  intervalo?: IntervaloDatas,
): T[] {
  const filtrados = intervalo
    ? registros.filter((r) => dentroDoIntervalo(r.dataReferencia, intervalo))
    : [...registros];

  return filtrados.sort(
    (a, b) => b.importadoEm.getTime() - a.importadoEm.getTime(),
  );
}
