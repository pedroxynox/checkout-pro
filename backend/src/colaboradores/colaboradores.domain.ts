/**
 * Lógica de domínio pura do Cadastro de Colaboradores.
 *
 * Normalização dos identificadores para comparação/armazenamento consistente:
 * - matrícula: sem espaços nas pontas (mantém zeros à esquerda, é um código).
 * - login/código de operador: minúsculo e sem espaços (case-insensitive).
 */

/** Normaliza uma matrícula (trim; preserva o formato do código). */
export function normalizarMatricula(valor: string): string {
  return valor.trim();
}

/** Normaliza um login/código de operador (minúsculo, sem espaços nas pontas). */
export function normalizarLogin(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * A função dá acesso ao app? (ADR 0023)
 *
 * Operador **não entra no app**: ele não tem login. Fiscal, supervisor e gestor
 * têm. É a mesma regra que `perfilDaFuncao` já usava para decidir se cria uma
 * conta na promoção — só que ela vivia privada dentro do serviço de cadastro, e
 * por isso o **login** nunca a consultava.
 *
 * O efeito de ela não ser consultada: descer um fiscal a operador não tirava o
 * acesso dele. `perfilDaFuncao('OPERADOR')` é nulo, a atualização do usuário só
 * atribui o perfil quando há um perfil novo, e o antigo (`FISCAL`) ficava. A
 * pessoa seguia entrando no app com os poderes que já não lhe cabiam.
 *
 * Vive aqui, no domínio puro, para que o módulo de Acessos possa usá-la sem
 * depender do serviço de cadastro — que depende dele, e fecharia um ciclo.
 */
export function funcaoTemAcessoAoApp(funcao: string): boolean {
  return funcao === 'FISCAL' || funcao === 'SUPERVISOR' || funcao === 'GESTOR';
}

/**
 * Campos legados da ficha (regime 6x1). Depois que a pessoa tem uma vigência da
 * jornada eles ficam congelados (spec `jornada-5x2`, R1.3a).
 */
export const CAMPOS_LEGADOS = [
  'folgaDiaSemana',
  'entradaSemana',
  'saidaSemana',
  'entradaFds',
  'saidaFds',
  'entradaDom',
  'saidaDom',
  'grupoDomingo',
  'tipoContratoJornadaId',
] as const;

export type CampoLegado = (typeof CAMPOS_LEGADOS)[number];

type ValorLegado = string | number | null | undefined;

/** Vazio e null são o mesmo "sem valor" (o app manda "" para limpar). */
function semVazio(v: ValorLegado): string | number | null {
  return v === undefined || v === null || v === '' ? null : v;
}

/**
 * Os campos legados que a edição MUDA (ausente = não mexe; mesmo valor = não
 * muda). O APK antigo reenvia a ficha inteira, então só a diferença conta.
 * `tipoContratoJornadaId` deve chegar já resolvido (vazio → id do padrão).
 */
export function camposLegadosAlterados(
  atual: Readonly<Record<CampoLegado, ValorLegado>>,
  edicao: Readonly<Partial<Record<CampoLegado, ValorLegado>>>,
): CampoLegado[] {
  return CAMPOS_LEGADOS.filter(
    (campo) =>
      edicao[campo] !== undefined &&
      semVazio(edicao[campo]) !== semVazio(atual[campo]),
  );
}
