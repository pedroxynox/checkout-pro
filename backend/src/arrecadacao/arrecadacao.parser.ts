/**
 * Lê o arquivo .txt (bloc de notas) de arrecadação enviado pelo fiscal.
 *
 * Cada indicador tem um layout próprio, mas todos são separados por ';' e têm
 * um cabeçalho. O parser localiza as colunas pelo nome do cabeçalho, então
 * funciona com formatos diferentes. Exemplos:
 *   Troco:     FILIAL;LOGIN_USUARIO;NOME_USUARIO;VALOR
 *   Recargas:  NROEMPRESA;LOGIN;MATRICULA;NOME;VALOR_TOTAL
 *   Cancel.:   EMPRESA;OPERACAO;COD_OPERADOR;NOME_OPERADOR;QTD_ITENS;VALOR_TOTAL
 *   Cupom:     ...;NOME_OPERADOR;...;NOME_USU_AUTORIZACAO;...;VALOR;MOTIVO;...
 *   Devol.:    NROEMPRESA;USUARIO_LANCAMENTO;DATA_HORA;VALOR_NF;NF;NOME_CLIENTE
 *
 * O que importa é NOME + VALOR (e, quando existir, QTD = quantidade de itens,
 * NOME de quem autorizou e o MOTIVO do cancelamento). Em devoluções o nome do
 * fiscal vem junto com a matrícula ("243183 - Fulano"), então é extraído da
 * coluna USUARIO_LANCAMENTO; a coluna NOME_CLIENTE é ignorada. O valor usa
 * vírgula decimal (ex.: ",50" = 0,50) e é interpretado por `parseValor`
 * (reaproveitado do parser de importações).
 */
import { parseValor } from '../importacoes/importacoes.parser';

export interface LinhaArrecadacao {
  nome: string;
  matricula?: string;
  valor: number;
  /** Quantidade (ex.: itens/cupons cancelados), quando o arquivo informa. */
  quantidade?: number;
  /** Nome de quem autorizou (ex.: cancelamento de cupom). */
  autorizadoPor?: string;
  /** Motivo do cancelamento (ex.: cancelamento de cupom). */
  motivo?: string;
}

/**
 * Extrai o nome de um campo "MATRICULA - NOME" (ex.: "243183 - Fulano").
 * Devolve o nome e, quando houver, a matrícula. Se não houver o separador,
 * o texto inteiro é tratado como nome.
 */
function separarMatriculaNome(bruto: string): {
  nome: string;
  matricula?: string;
} {
  const texto = bruto.trim();
  const m = texto.match(/^(\d+)\s*-\s*(.+)$/);
  if (m) {
    return { matricula: m[1].trim(), nome: m[2].trim() };
  }
  return { nome: texto };
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
  let idxAutoriza = -1;
  let idxMotivo = -1;
  let inicio = 0;
  // Quando o nome vem como "MATRICULA - NOME" (ex.: devoluções).
  let extrairDeUsuario = false;

  const primeira = linhas[0];
  const temCabecalho =
    /(nome|valor|filial|login|empresa|qtd|quant|motivo|autoriza|usuario)/i.test(
      primeira,
    );
  if (temCabecalho) {
    const colunas = primeira.split(';').map((c) => c.trim().toLowerCase());
    // Nome do operador/fiscal: coluna com "nome", exceto a do cliente.
    let fNome = colunas.findIndex(
      (c) => c.includes('nome') && !c.includes('cliente'),
    );
    if (fNome < 0) {
      // Devoluções: o nome vem na coluna do usuário de lançamento.
      fNome = colunas.findIndex(
        (c) => c.includes('usuario') || c.includes('lancamento'),
      );
      extrairDeUsuario = fNome >= 0;
    }
    const fValor = colunas.findIndex((c) => c.includes('valor'));
    const fMat = colunas.findIndex(
      (c) =>
        c.includes('login') || c.includes('matr') || c.includes('cod'),
    );
    const fQtd = colunas.findIndex(
      (c) => c.includes('qtd') || c.includes('quant'),
    );
    // Nome de quem autorizou: coluna com "nome" e "autoriza".
    const fAutoriza = colunas.findIndex(
      (c) => c.includes('autoriza') && c.includes('nome'),
    );
    const fMotivo = colunas.findIndex((c) => c.includes('motivo'));
    if (fNome >= 0) idxNome = fNome;
    if (fValor >= 0) idxValor = fValor;
    idxMatricula = fMat; // pode ser -1 (sem coluna de código)
    idxQtd = fQtd; // pode ser -1 (sem coluna de quantidade)
    idxAutoriza = fAutoriza; // pode ser -1
    idxMotivo = fMotivo; // pode ser -1
    inicio = 1;
  }

  const registros: LinhaArrecadacao[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    const colunas = linhas[i].split(';');
    const valor = parseValor(colunas[idxValor]);
    let nome = (colunas[idxNome] ?? '').trim();
    let matricula =
      idxMatricula >= 0
        ? (colunas[idxMatricula] ?? '').trim() || undefined
        : undefined;
    if (extrairDeUsuario) {
      const sep = separarMatriculaNome(nome);
      nome = sep.nome;
      matricula = sep.matricula ?? matricula;
    }
    let quantidade: number | undefined;
    if (idxQtd >= 0) {
      const bruto = (colunas[idxQtd] ?? '').trim();
      const q = parseInt(bruto, 10);
      if (!Number.isNaN(q)) {
        quantidade = q;
      }
    }
    const autorizadoPor =
      idxAutoriza >= 0
        ? (colunas[idxAutoriza] ?? '').trim() || undefined
        : undefined;
    const motivo =
      idxMotivo >= 0
        ? (colunas[idxMotivo] ?? '').trim() || undefined
        : undefined;
    if (nome !== '' && !Number.isNaN(valor)) {
      registros.push({ nome, matricula, valor, quantidade, autorizadoPor, motivo });
    }
  }
  return registros;
}
