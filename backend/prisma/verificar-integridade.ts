/**
 * Verificador de integridade dos vínculos Fiscal ↔ Colaborador (ficha canônica).
 *
 * Ferramenta operacional da Fase 4 (spec `solidez-contratos-jornada`, T.3).
 * Roda contra o banco (usa `DATABASE_URL`) e reporta os "órfãos" que impedem
 * aposentar o modelo legado `Fiscal` com segurança:
 *   - fiscais sem ficha canônica e fichas FISCAL sem registro de fiscal
 *     (lógica pura reaproveitada de `src/fiscais/integridade-vinculo.ts`);
 *   - registros de ponto/escala que AINDA estão sem o vínculo `colaboradorId`
 *     (o que o backfill do Passo 4.4 deveria ter zerado).
 *
 * Uso:  npm run integridade   (no diretório backend)
 * Sai com código 1 se encontrar qualquer pendência (útil em CI/checagens).
 */
import { PrismaClient } from '@prisma/client';
import { detectarVinculosOrfaos } from '../src/fiscais/integridade-vinculo';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const [
      fiscais,
      usuarios,
      colaboradoresFiscais,
      pontosSemVinculo,
      escalasSemVinculo,
    ] = await Promise.all([
      prisma.fiscal.findMany({
        select: { id: true, nome: true, usuarioId: true },
      }),
      prisma.usuario.findMany({ select: { id: true, login: true } }),
      prisma.colaborador.findMany({
        where: { funcao: 'FISCAL' },
        select: { id: true, nome: true, matricula: true, usuarioId: true },
      }),
      prisma.registroPontoFiscal.count({ where: { colaboradorId: null } }),
      prisma.escalaEntry.count({ where: { colaboradorId: null } }),
    ]);

    const r = detectarVinculosOrfaos(fiscais, usuarios, colaboradoresFiscais);

    console.log('== Integridade dos vínculos Fiscal ↔ Colaborador ==');
    console.log(
      `Fiscais: ${r.totalFiscais} · Fichas FISCAL: ${r.totalFichasFiscais} · Vinculados: ${r.vinculados}`,
    );
    console.log(
      `Ponto do fiscal sem vínculo (colaboradorId nulo): ${pontosSemVinculo}`,
    );
    console.log(`Escala sem vínculo (colaboradorId nulo): ${escalasSemVinculo}`);

    if (r.fiscaisSemFicha.length > 0) {
      console.log(`\nFiscais SEM ficha canônica (${r.fiscaisSemFicha.length}):`);
      for (const f of r.fiscaisSemFicha) {
        console.log(`  - ${f.nome} (fiscalId=${f.fiscalId}, conta=${f.usuarioId ?? '—'})`);
      }
    }
    if (r.fichasSemRegistroFiscal.length > 0) {
      console.log(
        `\nFichas FISCAL SEM registro de fiscal (${r.fichasSemRegistroFiscal.length}):`,
      );
      for (const c of r.fichasSemRegistroFiscal) {
        console.log(`  - ${c.nome} (colaboradorId=${c.colaboradorId}, matrícula=${c.matricula})`);
      }
    }

    const tudoOk =
      r.ok && pontosSemVinculo === 0 && escalasSemVinculo === 0;
    if (tudoOk) {
      console.log('\n✅ Integridade OK: nenhum vínculo órfão.');
    } else {
      console.log(
        '\n⚠️  Há pendências de vínculo. Rode o backfill (migração 9zzf) e/ou revise os cadastros acima.',
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
