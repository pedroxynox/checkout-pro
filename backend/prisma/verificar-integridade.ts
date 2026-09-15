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
import {
  detectarEscalasIncoerentes,
  nomeDoDia,
} from '../src/fiscais/integridade-escala';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const [
      fiscais,
      usuarios,
      colaboradoresFiscais,
      pontosSemVinculo,
      escalasSemVinculo,
      ausenciasSemVinculo,
      batidasSemVinculo,
      fichasEscala,
      entradasGerais,
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
      prisma.ausencia.count({ where: { colaboradorId: null } }),
      prisma.batidaPonto.count({ where: { colaboradorId: null } }),
      // Fichas FISCAL com os campos que GERAM a escala semanal.
      prisma.colaborador.findMany({
        where: { funcao: 'FISCAL' },
        select: {
          id: true,
          nome: true,
          matricula: true,
          usuarioId: true,
          entradaSemana: true,
          saidaSemana: true,
          entradaFds: true,
          saidaFds: true,
          folgaDiaSemana: true,
          ativo: true,
        },
      }),
      // Só as entradas GERAIS: as exceções (`especial`) são diferentes da ficha
      // de propósito, e apontá-las como divergência seria ruído.
      prisma.escalaEntry.findMany({
        where: { especial: false },
        select: {
          funcionarioId: true,
          colaboradorId: true,
          diaSemana: true,
          entrada: true,
          saida: true,
          folga: true,
        },
      }),
    ]);

    const r = detectarVinculosOrfaos(fiscais, usuarios, colaboradoresFiscais);
    const e = detectarEscalasIncoerentes(
      fichasEscala,
      fiscais,
      usuarios,
      entradasGerais,
    );

    console.log('== Integridade dos vínculos Fiscal ↔ Colaborador ==');
    console.log(
      `Fiscais: ${r.totalFiscais} · Fichas FISCAL: ${r.totalFichasFiscais} · Vinculados: ${r.vinculados}`,
    );
    console.log(
      `Ponto do fiscal sem vínculo (colaboradorId nulo): ${pontosSemVinculo}`,
    );
    console.log(
      `Escala sem vínculo (colaboradorId nulo): ${escalasSemVinculo}`,
    );
    console.log(
      `Faltas sem vínculo (colaboradorId nulo): ${ausenciasSemVinculo}`,
    );
    console.log(
      `Batidas sem vínculo (colaboradorId nulo): ${batidasSemVinculo}`,
    );

    if (r.fiscaisSemFicha.length > 0) {
      console.log(
        `\nFiscais SEM ficha canônica (${r.fiscaisSemFicha.length}):`,
      );
      for (const f of r.fiscaisSemFicha) {
        console.log(
          `  - ${f.nome} (fiscalId=${f.fiscalId}, conta=${f.usuarioId ?? '—'})`,
        );
      }
    }
    if (r.fichasSemRegistroFiscal.length > 0) {
      console.log(
        `\nFichas FISCAL SEM registro de fiscal (${r.fichasSemRegistroFiscal.length}):`,
      );
      for (const c of r.fichasSemRegistroFiscal) {
        console.log(
          `  - ${c.nome} (colaboradorId=${c.colaboradorId}, matrícula=${c.matricula})`,
        );
      }
    }

    // ── Coerência ficha ↔ escala semanal ──────────────────────────────────
    // A ficha é a fonte da escala, mas a sincronização tem saídas antecipadas.
    // Onde as duas discordam, a detecção automática de falta cobra o ponto num
    // horário e a escala publicada mostra outro — para a mesma pessoa.
    console.log('\n== Coerência ficha ↔ escala semanal (fiscais) ==');
    console.log(
      `Fiscais ativos: ${e.totalFiscaisAtivos} · Coerentes: ${e.coerentes}`,
    );

    if (e.incoerentes.length > 0) {
      console.log(`\nEscala DIFERENTE da ficha (${e.incoerentes.length}):`);
      for (const f of e.incoerentes) {
        const marca = f.fichaVazia ? '  ⚠️ FICHA SEM HORÁRIOS' : '';
        console.log(`  - ${f.nome} (matrícula=${f.matricula})${marca}`);
        for (const d of f.dias) {
          const naFicha = d.ficha
            ? d.ficha.folga
              ? 'folga'
              : `${d.ficha.entrada}–${d.ficha.saida}`
            : '(nada)';
          const naEscala = d.escala
            ? d.escala.folga
              ? 'folga'
              : `${d.escala.entrada}–${d.escala.saida}`
            : '(nada)';
          console.log(
            `      ${nomeDoDia(d.diaSemana)}: ficha ${naFicha} · escala ${naEscala}`,
          );
        }
      }
      console.log(
        '\n    Como corrigir: reabrir e salvar o cadastro do colaborador' +
          ' regenera a escala a partir da ficha.\n' +
          '    Nos marcados "FICHA SEM HORÁRIOS", preencher os horários na ficha' +
          ' primeiro — enquanto ela estiver vazia\n' +
          '    a sincronização não apaga a escala antiga, e é ela que alimenta a' +
          ' detecção de falta.',
      );
    }

    if (e.semEscala.length > 0) {
      console.log(
        `\nFicha preenchida e SEM escala semanal (${e.semEscala.length}) —` +
          ' estes NUNCA recebem falta automática:',
      );
      for (const f of e.semEscala) {
        console.log(`  - ${f.nome} (matrícula=${f.matricula})`);
      }
    }

    if (e.horarioIncompleto.length > 0) {
      console.log(
        `\nHorário pela METADE na ficha (${e.horarioIncompleto.length}) —` +
          ' o dia é omitido da escala em silêncio:',
      );
      for (const f of e.horarioIncompleto) {
        console.log(
          `  - ${f.nome} (matrícula=${f.matricula}): ${f.blocos.join(', ')}`,
        );
      }
    }

    if (e.duplicadas.length > 0) {
      console.log(
        `\nEntradas GERAIS duplicadas (${e.duplicadas.length}) —` +
          ' a escala efetiva passa a depender de qual consumidor pergunta:',
      );
      for (const d of e.duplicadas) {
        console.log(
          `  - fiscalId=${d.funcionarioId} ${nomeDoDia(d.diaSemana)}: ${d.quantidade} entradas`,
        );
      }
    }

    if (e.ok) {
      console.log('\n✅ Escala semanal coerente com as fichas.');
    }

    const tudoOk =
      r.ok &&
      e.ok &&
      pontosSemVinculo === 0 &&
      escalasSemVinculo === 0 &&
      ausenciasSemVinculo === 0 &&
      batidasSemVinculo === 0;
    if (tudoOk) {
      console.log('\n✅ Integridade OK: nenhum vínculo órfão.');
    } else {
      console.log(
        '\n⚠️  Há pendências. Revise os cadastros acima e/ou rode o backfill (migração 9zzf).',
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
