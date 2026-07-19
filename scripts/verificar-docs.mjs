#!/usr/bin/env node
/**
 * Guardião da documentação do Check-out PRO.
 *
 * É o mecanismo que impede a documentação de ficar desatualizada. Roda no CI
 * (a cada push e Pull Request) e pode ser rodado localmente com
 * `npm run docs:check`. Faz duas verificações:
 *
 *  1. REFERÊNCIA GERADA EM DIA (bloqueante e determinística):
 *     Regera os documentos automáticos e falha se o resultado for diferente do
 *     que está commitado. Ou seja: se alguém mudou o código (rotas, tabelas,
 *     testes...) e não rodou `npm run docs:gen`, o CI barra.
 *
 *  2. ATLAS ACOMPANHA O CÓDIGO (bloqueante quando o documento já existe):
 *     Se arquivos de um módulo do backend (`backend/src/<modulo>/`) mudaram
 *     em relação à base, o documento `docs/03-atlas-backend/<modulo>.md`
 *     precisa ter mudado no mesmo conjunto de alterações. Idem para as áreas
 *     do mobile (`mobile/src/screens/<area>/` → `docs/04-atlas-mobile/<area>.md`).
 *     Documentos que ainda não existem (atlas em construção) geram apenas aviso.
 *
 *  Escape de emergência: incluir `[skip-docs]` na mensagem do último commit.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function git(args, opcional = false) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) {
    if (opcional) return '';
    throw e;
  }
}

let erros = 0;
const aviso = (m) => console.log('  ⚠️  ' + m);
const erro = (m) => {
  console.log('  ❌ ' + m);
  erros++;
};
const ok = (m) => console.log('  ✅ ' + m);

/* -------- escape de emergência -------- */
const ultimoCommit = git('log -1 --pretty=%B', true);
if (/\[skip-docs\]/.test(ultimoCommit)) {
  console.log('Guardião da documentação: pulado por [skip-docs] no commit.');
  process.exit(0);
}

/* -------- 1. referência gerada em dia -------- */
const ARQUIVOS_GERADOS = [
  'docs/03-atlas-backend/README.md',
  'docs/04-atlas-mobile/README.md',
  'docs/05-referencia-dados/modelo-de-dados.md',
  'docs/05-referencia-dados/dicionario-de-dados.md',
  'docs/05-referencia-dados/migracoes.md',
  'docs/05-referencia-dados/api-http.md',
  'docs/06-qualidade/catalogo-de-testes.md',
  'docs/08-gestao/estado-e-metricas.md',
];
console.log('\n[1/2] Verificando se a documentação de referência está em dia...');
execSync('node scripts/gerar-docs.mjs', { cwd: ROOT, stdio: 'ignore' });
const gerados = git(
  `status --porcelain -- ${ARQUIVOS_GERADOS.join(' ')}`,
  true,
);
if (gerados) {
  erro(
    'A documentação de referência está desatualizada. Rode `npm run docs:gen` e faça commit. Arquivos afetados:',
  );
  console.log(
    gerados
      .split('\n')
      .map((l) => '       ' + l.trim())
      .join('\n'),
  );
} else {
  ok('Documentação de referência em dia.');
}

/* -------- 2. atlas acompanha o código -------- */
console.log('\n[2/2] Verificando se o Atlas acompanha as mudanças de código...');
const base =
  process.env.DOCS_BASE_REF ||
  (git('rev-parse --verify origin/main', true) ? 'origin/main' : '');

if (!base) {
  aviso('Base de comparação indisponível; pulando a verificação do Atlas.');
} else {
  const diff = git(`diff --name-only ${base}...HEAD`, true);
  const mudados = new Set(diff ? diff.split('\n').filter(Boolean) : []);

  const checarAtlas = (prefixoCodigo, extrairAlvo, pastaDoc) => {
    const modulosMudados = new Set();
    for (const f of mudados) {
      if (f.startsWith(prefixoCodigo)) {
        const alvo = extrairAlvo(f);
        if (alvo) modulosMudados.add(alvo);
      }
    }
    for (const modulo of [...modulosMudados].sort()) {
      const docRel = `${pastaDoc}/${modulo}.md`;
      const docAbs = join(ROOT, docRel);
      if (!existsSync(docAbs)) {
        aviso(
          `Código de "${modulo}" mudou, mas ${docRel} ainda não existe (Atlas em construção).`,
        );
        continue;
      }
      if (!mudados.has(docRel)) {
        erro(
          `Código de "${modulo}" mudou, mas ${docRel} NÃO foi atualizado no mesmo conjunto de alterações.`,
        );
      } else {
        ok(`"${modulo}" — código e documento atualizados juntos.`);
      }
    }
  };

  // Backend: backend/src/<modulo>/...
  checarAtlas(
    'backend/src/',
    (f) => {
      const resto = f.slice('backend/src/'.length);
      const mod = resto.split('/')[0];
      // Ignora arquivos soltos na raiz de src (ex.: main.ts, app.module.ts).
      return resto.includes('/') ? mod : null;
    },
    'docs/03-atlas-backend',
  );

  // Mobile: mobile/src/screens/<area>/...
  checarAtlas(
    'mobile/src/screens/',
    (f) => {
      const resto = f.slice('mobile/src/screens/'.length);
      return resto.includes('/') ? resto.split('/')[0] : null;
    },
    'docs/04-atlas-mobile',
  );
}

/* -------- resultado -------- */
console.log('');
if (erros > 0) {
  console.log(
    `Guardião da documentação: ${erros} problema(s). Corrija antes de mesclar.`,
  );
  process.exit(1);
}
console.log('Guardião da documentação: tudo certo. ✅');
