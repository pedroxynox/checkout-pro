/**
 * Verificação de integridade do vínculo Fiscal ↔ Colaborador (ficha canônica).
 *
 * Ferramenta de apoio à consolidação do cadastro (spec `solidez-contratos-jornada`,
 * Fase 4). Enquanto os modelos `Fiscal` (legado) e `Colaborador` (canônico)
 * coexistem, esta lógica **pura** aponta os vínculos "órfãos" — os pontos cegos
 * que precisam de atenção antes de aposentar o `Fiscal`:
 *
 *  - **Fiscal sem ficha**: um `Fiscal` que não resolve para nenhum `Colaborador`
 *    (funcao FISCAL) — nem por conta de acesso nem por matrícula. Some das telas
 *    que exigem ficha canônica.
 *  - **Ficha sem registro de fiscal**: um `Colaborador` FISCAL que não tem um
 *    `Fiscal` correspondente — não teria log de ponto/escala do módulo legado.
 *
 * Reaproveita a MESMA regra de `mapearFiscalColaborador` (conta e, em fallback,
 * matrícula), então o diagnóstico é coerente com o comportamento de runtime.
 * Sem efeitos colaterais — testável sem banco.
 */
import {
  ColaboradorBasicoVinculo,
  FiscalBasico,
  UsuarioBasico,
  mapearFiscalColaborador,
} from './colaborador-vinculo';

/** Um fiscal (legado) que não resolve para nenhuma ficha canônica. */
export interface FiscalSemFicha {
  fiscalId: string;
  nome: string;
  usuarioId: string | null;
}

/** Uma ficha canônica FISCAL sem registro de `Fiscal` correspondente. */
export interface FichaSemRegistroFiscal {
  colaboradorId: string;
  nome: string;
  matricula: string;
}

/** Relatório do diagnóstico de integridade dos vínculos. */
export interface ReporteIntegridadeVinculo {
  fiscaisSemFicha: FiscalSemFicha[];
  fichasSemRegistroFiscal: FichaSemRegistroFiscal[];
  totalFiscais: number;
  totalFichasFiscais: number;
  vinculados: number;
  /** true quando não há nenhum órfão dos dois lados. */
  ok: boolean;
}

/**
 * Cruza fiscais, contas e fichas FISCAL e devolve os vínculos órfãos dos dois
 * lados. `colaboradoresFiscais` deve conter apenas fichas com funcao FISCAL.
 */
export function detectarVinculosOrfaos(
  fiscais: readonly FiscalBasico[],
  usuarios: readonly UsuarioBasico[],
  colaboradoresFiscais: readonly ColaboradorBasicoVinculo[],
): ReporteIntegridadeVinculo {
  const vinculo = mapearFiscalColaborador(fiscais, usuarios, colaboradoresFiscais);

  const fiscaisSemFicha = fiscais
    .filter((f) => !vinculo.has(f.id))
    .map((f) => ({ fiscalId: f.id, nome: f.nome, usuarioId: f.usuarioId }));

  const idsVinculados = new Set(
    [...vinculo.values()].map((v) => v.colaboradorId),
  );
  const fichasSemRegistroFiscal = colaboradoresFiscais
    .filter((c) => !idsVinculados.has(c.id))
    .map((c) => ({
      colaboradorId: c.id,
      nome: c.nome,
      matricula: c.matricula,
    }));

  return {
    fiscaisSemFicha,
    fichasSemRegistroFiscal,
    totalFiscais: fiscais.length,
    totalFichasFiscais: colaboradoresFiscais.length,
    vinculados: vinculo.size,
    ok: fiscaisSemFicha.length === 0 && fichasSemRegistroFiscal.length === 0,
  };
}
