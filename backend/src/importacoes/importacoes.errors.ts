/**
 * NOTA DE MANUTENÇÃO (limpeza de código morto): o fluxo ANTIGO de importação
 * CSV/XLSX (controller/service/module/dto) foi removido por não ser mais usado
 * pelo app. Este arquivo de erros é **mantido de propósito** porque a classe
 * `ColunaAusenteError` ainda é referenciada pelo filtro global de exceções
 * (`common/filters/dominio-exception.filter.ts`).
 *
 * Erros de domínio tipados do Modulo_Importacoes.
 *
 * São erros puros (sem dependência do Nest ou do banco) para que a lógica de
 * domínio permaneça testável de forma isolada. A camada de API mapeará cada um
 * deles para a resposta HTTP apropriada (Tarefa 13).
 */

/** Classe base para os erros de domínio do módulo de importações. */
export abstract class ImportacoesError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
    // Mantém a cadeia de protótipos correta ao estender Error em TS/ES5+.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Lançado quando um arquivo importado não contém as colunas obrigatórias
 * esperadas (data, nome, valor) — Requisito 1.1.6. A mensagem é descritiva e
 * indica explicitamente a(s) coluna(s) ausente(s).
 */
export class ColunaAusenteError extends ImportacoesError {
  /** Colunas obrigatórias que faltaram no arquivo. */
  readonly colunasAusentes: string[];

  constructor(colunasAusentes: string[]) {
    const lista = colunasAusentes.join(', ');
    super(
      colunasAusentes.length === 1
        ? `O arquivo importado não contém a coluna obrigatória: ${lista}.`
        : `O arquivo importado não contém as colunas obrigatórias: ${lista}.`,
    );
    this.colunasAusentes = colunasAusentes;
  }
}
