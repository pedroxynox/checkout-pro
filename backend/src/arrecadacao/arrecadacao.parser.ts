/**
 * Lê o arquivo .txt (bloc de notas) de arrecadação enviado pelo fiscal.
 *
 * Formato esperado (separado por ';'), com cabeçalho opcional:
 *   FILIAL;LOGIN_USUARIO;NOME_USUARIO;VALOR
 *   35;28967;PATRICIA DE OLIVEIRA;7,55
 *
 * O que importa é NOME + VALOR. O valor usa vírgula decimal (ex.: ",50" = 0,50)
 * e é interpretado por `parseValor` (reaproveitado do parser de importações).
 */
import { parseValor } from '../importacoes/importacoes.parser';

export interface LinhaArrecadacao {
  nome: string;
  matricula?: string;
  valor: number;
}

export function parseArrecadacao(conteudo: string): LinhaArrecadacao[] {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (linhas.length === 0) {
    return [];
  }

  // Índices padrão (formato FILIAL;LOGIN;NOME;VALOR).
  let idxNome = 2;
  let idxValor = 3;
  let idxMatricula = 1;
  let inicio = 0;

  const primeira = linhas[0];
  const temCabecalho = /(nome|valor|filial|login)/i.test(primeira);
  if (temCabecalho) {
    const colunas = primeira.split(';').map((c) => c.trim().toLowerCase());
    const fNome = colunas.findIndex((c) => c.includes('nome'));
    const fValor = colunas.findIndex((c) => c.includes('valor'));
    const fMat = colunas.findIndex(
      (c) => c.includes('login') || c.includes('matr'),
    );
    if (fNome >= 0) idxNome = fNome;
    if (fValor >= 0) idxValor = fValor;
    if (fMat >= 0) idxMatricula = fMat;
    inicio = 1;
  }

  const registros: LinhaArrecadacao[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    const colunas = linhas[i].split(';');
    const nome = (colunas[idxNome] ?? '').trim();
    const valor = parseValor(colunas[idxValor]);
    const matricula = (colunas[idxMatricula] ?? '').trim() || undefined;
    if (nome !== '' && !Number.isNaN(valor)) {
      registros.push({ nome, matricula, valor });
    }
  }
  return registros;
}
