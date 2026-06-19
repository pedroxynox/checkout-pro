/**
 * Lê o arquivo .txt (bloc de notas) de arrecadação enviado pelo fiscal.
 *
 * Cada indicador tem um layout próprio, mas todos são separados por ';' e têm
 * um cabeçalho. O parser localiza as colunas pelo nome do cabeçalho, então
 * funciona com formatos diferentes. Exemplos:
 *   Troco:     FILIAL;LOGIN_USUARIO;NOME_USUARIO;VALOR
 *   Recargas:  NROEMPRESA;LOGIN;MATRICULA;NOME;VALOR_TOTAL
 *   Cancel.:   EMPRESA;OPERACAO;COD_OPERADOR;NOME_OPERADOR;QTD_ITENS;VALOR_TOTAL
 *
 * O que importa é NOME + VALOR (e, quando existir, QTD = quantidade de itens).
 * O valor usa vírgula decimal (ex.: ",50" = 0,50) e é interpretado por
 * `parseValor` (reaproveitado do parser de importações).
 */
import { parseValor } from '../importacoes/importacoes.parser';

export interface LinhaArrecadacao {
  nome: string;
  matricula?: string;
  valor: number;
  /** Quantidade (ex.: itens/cupons cancelados), quando o arquivo informa. */
  quantidade?: number;
}

export function parseArrecadacao(conteudo: string): LinhaArrecadacao[] {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (linhas.length === 0) {
    return [];
  }

  // Índices padrão (formato FILIAL;LOGIN;NOME;VALOR, sem cabeçalho).
  let idxNome = 2;
  let idxValor = 3;
  let idxMatricula = 1;
  let idxQtd = -1;
  let inicio = 0;

  const primeira = linhas[0];
  const temCabecalho = /(nome|valor|filial|login|empresa|qtd|quant)/i.test(
    primeira,
  );
  if (temCabecalho) {
    const colunas = primeira.split(';').map((c) => c.trim().toLowerCase());
    const fNome = colunas.findIndex((c) => c.includes('nome'));
    const fValor = colunas.findIndex((c) => c.includes('valor'));
    const fMat = colunas.findIndex(
      (c) =>
        c.includes('login') || c.includes('matr') || c.includes('cod'),
    );
    const fQtd = colunas.findIndex(
      (c) => c.includes('qtd') || c.includes('quant'),
    );
    if (fNome >= 0) idxNome = fNome;
    if (fValor >= 0) idxValor = fValor;
    idxMatricula = fMat; // pode ser -1 (sem coluna de código)
    idxQtd = fQtd; // pode ser -1 (sem coluna de quantidade)
    inicio = 1;
  }

  const registros: LinhaArrecadacao[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    const colunas = linhas[i].split(';');
    const nome = (colunas[idxNome] ?? '').trim();
    const valor = parseValor(colunas[idxValor]);
    const matricula =
      idxMatricula >= 0
        ? (colunas[idxMatricula] ?? '').trim() || undefined
        : undefined;
    let quantidade: number | undefined;
    if (idxQtd >= 0) {
      const bruto = (colunas[idxQtd] ?? '').trim();
      const q = parseInt(bruto, 10);
      if (!Number.isNaN(q)) {
        quantidade = q;
      }
    }
    if (nome !== '' && !Number.isNaN(valor)) {
      registros.push({ nome, matricula, valor, quantidade });
    }
  }
  return registros;
}
