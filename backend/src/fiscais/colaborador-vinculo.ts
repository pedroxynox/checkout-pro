/**
 * Vínculo Fiscal → Colaborador (ficha única).
 *
 * O módulo de Fiscais é keyed por `Fiscal.id` e exibe `Fiscal.nome`. Para unir
 * essas telas à ficha canônica do colaborador (matrícula como chave), este
 * helper puro resolve, para cada fiscal, o colaborador correspondente:
 *
 *  1) pela conta de acesso compartilhada (Fiscal.usuarioId == Colaborador.usuarioId);
 *  2) na ausência do vínculo, pela matrícula (login do usuário do fiscal ==
 *     matrícula do colaborador).
 *
 * Sem efeitos colaterais — testável sem banco.
 */

/** Dados mínimos de um fiscal. */
export interface FiscalBasico {
  id: string;
  nome: string;
  usuarioId: string | null;
}

/** Dados mínimos de uma conta de acesso. */
export interface UsuarioBasico {
  id: string;
  login: string;
}

/** Dados mínimos de um colaborador (ficha canônica). */
export interface ColaboradorBasicoVinculo {
  id: string;
  nome: string;
  matricula: string;
  usuarioId: string | null;
}

/** Colaborador resolvido para um fiscal. */
export interface ColaboradorDoFiscal {
  colaboradorId: string;
  nome: string;
  matricula: string;
}

/** Normaliza uma matrícula para comparação (sem espaços, maiúsculas). */
function normalizarMatricula(valor: string | null | undefined): string {
  return (valor ?? '').trim().toUpperCase();
}

/**
 * Mapeia cada fiscal ao seu colaborador (ficha única), por conta de acesso ou,
 * em fallback, por matrícula. Fiscais sem ficha correspondente ficam de fora.
 */
export function mapearFiscalColaborador(
  fiscais: readonly FiscalBasico[],
  usuarios: readonly UsuarioBasico[],
  colaboradores: readonly ColaboradorBasicoVinculo[],
): Map<string, ColaboradorDoFiscal> {
  const loginPorUsuario = new Map(usuarios.map((u) => [u.id, u.login]));
  const colPorUsuario = new Map<string, ColaboradorBasicoVinculo>();
  const colPorMatricula = new Map<string, ColaboradorBasicoVinculo>();
  for (const c of colaboradores) {
    if (c.usuarioId) colPorUsuario.set(c.usuarioId, c);
    colPorMatricula.set(normalizarMatricula(c.matricula), c);
  }

  const out = new Map<string, ColaboradorDoFiscal>();
  for (const f of fiscais) {
    let col: ColaboradorBasicoVinculo | undefined;
    if (f.usuarioId) {
      col = colPorUsuario.get(f.usuarioId);
      if (!col) {
        const login = loginPorUsuario.get(f.usuarioId);
        if (login) col = colPorMatricula.get(normalizarMatricula(login));
      }
    }
    if (col) {
      out.set(f.id, {
        colaboradorId: col.id,
        nome: col.nome,
        matricula: col.matricula,
      });
    }
  }
  return out;
}
