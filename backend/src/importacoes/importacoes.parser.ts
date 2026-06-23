/**
 * NOTA DE MANUTENÇÃO (limpeza de código morto): o fluxo ANTIGO de importação
 * CSV/XLSX foi removido. Deste parser, hoje só o `parseValor` é usado por
 * código vivo (os parsers ATUAIS de arrecadação e de vendas reaproveitam essa
 * conversão de valores em R$). As funções `parseCsv`/`parseXlsx` permanecem
 * apenas por histórico e não têm chamador na aplicação.
 *
 * Parsing de arquivos de importação (CSV/XLSX) do Modulo_Importacoes.
 *
 * Lê os arquivos linha a linha (Req 1.1.2–1.1.5) usando `papaparse` (CSV) e
 * `xlsx` (planilhas). A leitura é separada da validação de colunas e da
 * vinculação por nome (que residem em `importacoes.domain`), mantendo a lógica
 * de negócio pura e testável.
 *
 * O resultado do parsing é o cabeçalho (nomes das colunas) mais as linhas
 * convertidas para `LinhaImportada` (data, nome, valor). A validação de
 * colunas deve ser aplicada sobre o cabeçalho antes de consumir as linhas.
 */

import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { LinhaImportada } from './importacoes.domain';

/** Resultado do parsing de um arquivo: cabeçalho e linhas convertidas. */
export interface ArquivoParseado {
  cabecalho: string[];
  linhas: LinhaImportada[];
}

/** Localiza, de forma tolerante a maiúsculas/espaços, uma coluna em uma linha. */
function valorDaColuna(
  linha: Record<string, unknown>,
  coluna: string,
): unknown {
  const alvo = coluna.trim().toLowerCase();
  for (const chave of Object.keys(linha)) {
    if (chave.trim().toLowerCase() === alvo) {
      return linha[chave];
    }
  }
  return undefined;
}

/**
 * Converte um valor monetário textual em número de reais. Aceita tanto o
 * formato brasileiro ("1.234,56") quanto o formato com ponto decimal
 * ("1234.56"). Retorna `NaN` quando não é possível interpretar.
 */
export function parseValor(bruto: unknown): number {
  if (typeof bruto === 'number') {
    return bruto;
  }
  if (bruto === null || bruto === undefined) {
    return NaN;
  }
  let texto = String(bruto).trim();
  if (texto === '') {
    return NaN;
  }
  // Remove símbolo de moeda e espaços.
  texto = texto.replace(/r\$\s*/i, '').replace(/\s/g, '');
  // Formato brasileiro: vírgula como separador decimal.
  if (texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(texto);
  return Number.isNaN(n) ? NaN : n;
}

/**
 * Converte um valor de data textual/numérico em `Date`. Aceita ISO
 * ("2024-03-10"), formato brasileiro ("10/03/2024") e datas seriais do Excel.
 */
export function parseData(bruto: unknown): Date {
  if (bruto instanceof Date) {
    return bruto;
  }
  if (typeof bruto === 'number') {
    // Número serial do Excel (dias desde 1899-12-30).
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + Math.round(bruto) * 24 * 60 * 60 * 1000);
  }
  const texto = String(bruto ?? '').trim();
  // Formato brasileiro dd/mm/aaaa.
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (br) {
    const dia = Number(br[1]);
    const mes = Number(br[2]);
    const ano = Number(br[3]);
    return new Date(Date.UTC(ano, mes - 1, dia));
  }
  // ISO aaaa-mm-dd (sem hora -> meia-noite UTC).
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (iso) {
    return new Date(
      Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])),
    );
  }
  return new Date(texto);
}

/** Converte uma linha bruta (chave->valor) em `LinhaImportada`. */
function paraLinhaImportada(linha: Record<string, unknown>): LinhaImportada {
  return {
    data: parseData(valorDaColuna(linha, 'data')),
    nome: String(valorDaColuna(linha, 'nome') ?? '').trim(),
    valor: parseValor(valorDaColuna(linha, 'valor')),
  };
}

/**
 * Faz o parsing de um conteúdo CSV (Req 1.1.2–1.1.5). A primeira linha é
 * tratada como cabeçalho. Retorna o cabeçalho e as linhas convertidas.
 */
export function parseCsv(conteudo: string): ArquivoParseado {
  const resultado = Papa.parse<Record<string, unknown>>(conteudo, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const cabecalho = (resultado.meta.fields ?? []).map((f) => f.trim());
  const linhas = (resultado.data ?? []).map(paraLinhaImportada);
  return { cabecalho, linhas };
}

/**
 * Faz o parsing de uma planilha XLSX (Req 1.1.2–1.1.5) a partir de um buffer.
 * Usa a primeira aba; a primeira linha é tratada como cabeçalho.
 */
export function parseXlsx(buffer: Buffer): ArquivoParseado {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const primeiraAba = workbook.SheetNames[0];
  if (!primeiraAba) {
    return { cabecalho: [], linhas: [] };
  }
  const sheet = workbook.Sheets[primeiraAba];

  // Cabeçalho: primeira linha como array.
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  const cabecalho = ((matriz[0] as unknown[]) ?? []).map((c) =>
    String(c ?? '').trim(),
  );

  const objetos = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  const linhas = objetos.map(paraLinhaImportada);
  return { cabecalho, linhas };
}
