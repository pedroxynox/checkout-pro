#!/usr/bin/env node
/**
 * Gerador automático de documentação de referência do Check-out PRO.
 *
 * Lê o código-fonte (backend NestJS + Prisma e app mobile) e (re)escreve os
 * documentos de REFERÊNCIA cujos dados mudam com frequência — de modo que eles
 * NUNCA fiquem desatualizados nem se contradigam. Estes documentos NÃO devem
 * ser editados à mão: rode `npm run docs:gen` e faça commit do resultado.
 *
 * Documentos gerados:
 *  - docs/05-referencia-dados/modelo-de-dados.md   (modelos e enums do Prisma)
 *  - docs/05-referencia-dados/dicionario-de-dados.md (campo a campo de cada tabela)
 *  - docs/05-referencia-dados/migracoes.md          (histórico das migrações)
 *  - docs/05-referencia-dados/api-http.md           (rotas HTTP por módulo)
 *  - docs/06-qualidade/catalogo-de-testes.md        (arquivos de teste e casos)
 *  - docs/08-gestao/estado-e-metricas.md            (métricas do repositório)
 *
 * Princípio: a saída é DETERMINÍSTICA (ordenada e sem data/hora) para que o
 * guardião (scripts/verificar-docs.mjs) consiga detectar defasagem por diff.
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BANNER =
  '<!-- ⚙️ GERADO AUTOMATICAMENTE por scripts/gerar-docs.mjs — NÃO EDITE À MÃO.\n' +
  '     Para atualizar, rode `npm run docs:gen` e faça commit do resultado. -->\n';

/* ------------------------------- utilitários ------------------------------ */

/** Percorre um diretório recursivamente e devolve os caminhos que passam no filtro. */
function listar(dir, filtro, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const nome of readdirSync(dir).sort()) {
    if (nome === 'node_modules' || nome === '.git' || nome === 'dist') continue;
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) listar(caminho, filtro, acc);
    else if (filtro(caminho)) acc.push(caminho);
  }
  return acc;
}

function ler(caminho) {
  return readFileSync(caminho, 'utf8');
}

function contarLinhas(caminho) {
  const c = ler(caminho);
  if (c.length === 0) return 0;
  return c.split('\n').length;
}

function escrever(rel, conteudo) {
  const caminho = join(ROOT, rel);
  writeFileSync(caminho, conteudo.endsWith('\n') ? conteudo : conteudo + '\n');
  console.log('  escrito:', rel);
}

/** Escapa o caractere de barra vertical para não quebrar tabelas Markdown. */
function esc(s) {
  return String(s).replace(/\|/g, '\\|');
}

/* ------------------------- coleta: módulos backend ------------------------ */

function modulosBackend() {
  const base = join(ROOT, 'backend', 'src');
  return readdirSync(base)
    .filter((n) => statSync(join(base, n)).isDirectory())
    .sort();
}

/* ---------------------------- coleta: endpoints --------------------------- */

const METODOS = ['Get', 'Post', 'Patch', 'Put', 'Delete'];

/**
 * Extrai as rotas de um arquivo *.controller.ts.
 *
 * Estratégia: acumula os decoradores (linhas iniciadas por `@`) num buffer e,
 * ao encontrar a assinatura de um método, processa o bloco inteiro. Assim a
 * ordem entre `@Post(...)` e `@Funcionalidade(...)` não importa (ambos podem
 * vir em qualquer ordem acima do método). A permissão de nível de classe é
 * usada como padrão quando o método não define a sua.
 */
function rotasDoController(caminho) {
  const linhas = ler(caminho).split('\n');
  let prefixo = '';
  let funcClasse = '';
  const rotas = [];
  let buffer = [];

  const permissaoDoBuffer = () => {
    for (const b of buffer) {
      const m = b.match(/@Funcionalidade\('([^']+)'\)/);
      if (m) return m[1];
    }
    return null;
  };

  for (const raw of linhas) {
    const l = raw.trim();

    if (l.startsWith('@')) {
      buffer.push(l);
      const mCtrl = l.match(/@Controller\((?:'([^']*)'|"([^"]*)")?\)/);
      if (mCtrl) prefixo = mCtrl[1] || mCtrl[2] || '';
      continue;
    }

    // Declaração da classe: fixa a permissão padrão (nível de classe).
    if (/^export\s+class\s+\w+/.test(l)) {
      const p = permissaoDoBuffer();
      if (p) funcClasse = p;
      buffer = [];
      continue;
    }

    // Assinatura de método: se há decorador HTTP no buffer, é uma rota.
    const mMet = l.match(/^(?:public\s+|private\s+|protected\s+)?(?:async\s+)?([a-zA-Z0-9_]+)\s*\(/);
    if (mMet) {
      const permissao = permissaoDoBuffer() || funcClasse || '—';
      for (const met of METODOS) {
        const re = new RegExp(`@${met}\\((?:'([^']*)'|"([^"]*)")?\\)`);
        for (const b of buffer) {
          const m = b.match(re);
          if (m) {
            const sub = m[1] || m[2] || '';
            const caminhoRota =
              '/' +
              [prefixo, sub].filter(Boolean).join('/').replace(/\/+/g, '/');
            rotas.push({
              metodo: met.toUpperCase(),
              rota: caminhoRota,
              handler: mMet[1],
              permissao,
            });
          }
        }
      }
      buffer = [];
      continue;
    }

    if (l !== '') buffer = [];
  }
  return { prefixo, rotas };
}

function coletarEndpoints() {
  const controllers = listar(
    join(ROOT, 'backend', 'src'),
    (c) => c.endsWith('.controller.ts') && !c.endsWith('.spec.ts'),
  );
  const porModulo = {};
  let total = 0;
  for (const c of controllers) {
    const modulo = c.split('/backend/src/')[1].split('/')[0];
    const { rotas } = rotasDoController(c);
    if (!porModulo[modulo]) porModulo[modulo] = [];
    porModulo[modulo].push(...rotas);
    total += rotas.length;
  }
  return { porModulo, total };
}

/* ----------------------------- coleta: prisma ----------------------------- */

function coletarPrisma() {
  const schema = ler(join(ROOT, 'backend', 'prisma', 'schema.prisma'));
  const linhas = schema.split('\n');
  const modelos = [];
  const enums = [];
  let atualModelo = null;
  let atualEnum = null;
  let comentarioPendente = '';

  for (const raw of linhas) {
    const l = raw.trim();

    if (l.startsWith('///')) {
      comentarioPendente = l.replace(/^\/\/\/\s?/, '');
      continue;
    }
    if (l.startsWith('//')) {
      comentarioPendente = l.replace(/^\/\/\s?/, '');
      continue;
    }

    const mModel = l.match(/^model\s+(\w+)\s*\{/);
    if (mModel) {
      atualModelo = { nome: mModel[1], doc: comentarioPendente, campos: [] };
      modelos.push(atualModelo);
      comentarioPendente = '';
      continue;
    }
    const mEnum = l.match(/^enum\s+(\w+)\s*\{/);
    if (mEnum) {
      atualEnum = { nome: mEnum[1], doc: comentarioPendente, valores: [] };
      enums.push(atualEnum);
      comentarioPendente = '';
      continue;
    }
    if (l === '}') {
      atualModelo = null;
      atualEnum = null;
      comentarioPendente = '';
      continue;
    }

    if (atualEnum) {
      const mv = l.match(/^(\w+)/);
      if (mv) atualEnum.valores.push(mv[1]);
      continue;
    }
    if (atualModelo) {
      if (l.startsWith('@@')) continue;
      const mc = l.match(/^(\w+)\s+([\w[\]?]+)(.*)$/);
      if (mc) {
        const attrs = mc[3].trim();
        atualModelo.campos.push({
          nome: mc[1],
          tipo: mc[2],
          chave: attrs.includes('@id')
            ? 'PK'
            : attrs.includes('@unique')
              ? 'único'
              : attrs.includes('@relation')
                ? 'relação'
                : '',
          doc: comentarioPendente,
        });
      }
      comentarioPendente = '';
    }
  }

  const nomesModelos = new Set(modelos.map((m) => m.nome));
  // Marca relações: campo cujo tipo (sem []/?) é outro modelo.
  for (const m of modelos) {
    for (const campo of m.campos) {
      const base = campo.tipo.replace(/[[\]?]/g, '');
      campo.ehRelacao = nomesModelos.has(base);
    }
  }
  return { modelos, enums };
}

/* --------------------------- coleta: migrações ---------------------------- */

function coletarMigracoes() {
  const dir = join(ROOT, 'backend', 'prisma', 'migrations');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => statSync(join(dir, n)).isDirectory())
    .sort();
}

/* ---------------------------- coleta: testes ------------------------------ */

function contarCasos(caminho) {
  const c = ler(caminho);
  const casos = (c.match(/\b(?:it|test)\s*\(/g) || []).length;
  const suites = (c.match(/\bdescribe\s*\(/g) || []).length;
  return { casos, suites };
}

function coletarTestes() {
  const backend = listar(
    join(ROOT, 'backend', 'src'),
    (c) => c.endsWith('.spec.ts'),
  );
  const mobile = listar(
    join(ROOT, 'mobile', 'src'),
    (c) => c.endsWith('.test.ts') || c.endsWith('.test.tsx'),
  );
  const mapa = (arquivos, prefixo) =>
    arquivos.map((a) => {
      const { casos, suites } = contarCasos(a);
      return { arquivo: a.split(prefixo)[1], casos, suites };
    });
  return {
    backend: mapa(backend, '/backend/'),
    mobile: mapa(mobile, '/mobile/'),
  };
}

/* ----------------------------- coleta: mobile ----------------------------- */

function areasMobile() {
  const base = join(ROOT, 'mobile', 'src', 'screens');
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((n) => statSync(join(base, n)).isDirectory())
    .sort();
}

/* ------------------------------- métricas --------------------------------- */

function somaLinhas(arquivos) {
  return arquivos.reduce((s, a) => s + contarLinhas(a), 0);
}

function coletarMetricas() {
  const backSrc = listar(
    join(ROOT, 'backend', 'src'),
    (c) => c.endsWith('.ts') && !c.endsWith('.spec.ts'),
  );
  const backSpec = listar(join(ROOT, 'backend', 'src'), (c) =>
    c.endsWith('.spec.ts'),
  );
  const mobSrc = listar(
    join(ROOT, 'mobile', 'src'),
    (c) =>
      (c.endsWith('.ts') || c.endsWith('.tsx')) &&
      !c.endsWith('.test.ts') &&
      !c.endsWith('.test.tsx'),
  );
  const mobSpec = listar(
    join(ROOT, 'mobile', 'src'),
    (c) => c.endsWith('.test.ts') || c.endsWith('.test.tsx'),
  );
  return {
    backend: {
      arquivos: backSrc.length,
      linhas: somaLinhas(backSrc),
      arquivosTeste: backSpec.length,
      linhasTeste: somaLinhas(backSpec),
    },
    mobile: {
      arquivos: mobSrc.length,
      linhas: somaLinhas(mobSrc),
      arquivosTeste: mobSpec.length,
      linhasTeste: somaLinhas(mobSpec),
    },
  };
}

/* ------------------------------ documentos -------------------------------- */

function docModeloDeDados(prisma) {
  const { modelos, enums } = prisma;
  let s = BANNER + '\n# Modelo de Dados (Prisma)\n\n';
  s += `> Fonte: \`backend/prisma/schema.prisma\`. Total: **${modelos.length} tabelas** e **${enums.length} tipos (enums)**.\n\n`;
  s += 'Para o detalhe campo a campo de cada tabela, veja o [Dicionário de Dados](./dicionario-de-dados.md).\n\n';

  s += '## Tabelas\n\n| Tabela | Campos | Descrição |\n|---|---|---|\n';
  for (const m of modelos) {
    s += `| \`${m.nome}\` | ${m.campos.length} | ${esc(m.doc || '—')} |\n`;
  }

  s += '\n## Relações (referências entre tabelas)\n\n| Tabela | Campo | Referencia |\n|---|---|---|\n';
  for (const m of modelos) {
    for (const c of m.campos) {
      if (c.ehRelacao) {
        s += `| \`${m.nome}\` | \`${c.nome}\` | \`${c.tipo}\` |\n`;
      }
    }
  }

  s += '\n## Tipos / Estados (enums)\n\n';
  for (const e of enums) {
    s += `### \`${e.nome}\`\n\n`;
    if (e.doc) s += `${esc(e.doc)}\n\n`;
    s += e.valores.map((v) => `- \`${v}\``).join('\n') + '\n\n';
  }
  return s;
}

function docDicionario(prisma) {
  const { modelos } = prisma;
  let s = BANNER + '\n# Dicionário de Dados\n\n';
  s += `> Detalhe campo a campo das **${modelos.length} tabelas**. Fonte: \`backend/prisma/schema.prisma\`.\n\n`;
  for (const m of modelos) {
    s += `## \`${m.nome}\`\n\n`;
    if (m.doc) s += `${esc(m.doc)}\n\n`;
    s += '| Campo | Tipo | Chave | Descrição |\n|---|---|---|---|\n';
    for (const c of m.campos) {
      s += `| \`${c.nome}\` | \`${esc(c.tipo)}\` | ${c.chave || ''} | ${esc(c.doc || '')} |\n`;
    }
    s += '\n';
  }
  return s;
}

function docMigracoes(migracoes) {
  let s = BANNER + '\n# Migrações do Banco de Dados\n\n';
  s += `> Histórico ordenado das **${migracoes.length} migrações** (\`backend/prisma/migrations/\`). Cada migração é uma alteração versionada do banco.\n\n`;
  s += '| # | Migração |\n|---|---|\n';
  migracoes.forEach((m, i) => {
    s += `| ${i + 1} | \`${m}\` |\n`;
  });
  return s;
}

function docApi(endpoints) {
  const { porModulo, total } = endpoints;
  let s = BANNER + '\n# Referência da API HTTP\n\n';
  s += `> **${total} rotas** expostas pelo backend, agrupadas por módulo. Coluna "Permissão" = funcionalidade exigida (ver [Perfis e Permissões](../01-produto/perfis-e-permissoes.md)).\n\n`;
  for (const modulo of Object.keys(porModulo).sort()) {
    const rotas = porModulo[modulo];
    if (rotas.length === 0) continue;
    s += `## \`${modulo}\`\n\n`;
    s += '| Método | Rota | Handler | Permissão |\n|---|---|---|---|\n';
    for (const r of rotas) {
      s += `| ${r.metodo} | \`${esc(r.rota)}\` | \`${r.handler || '?'}\` | \`${esc(r.permissao)}\` |\n`;
    }
    s += '\n';
  }
  return s;
}

function docCatalogoTestes(testes) {
  const totBack = testes.backend.reduce((s, t) => s + t.casos, 0);
  const totMob = testes.mobile.reduce((s, t) => s + t.casos, 0);
  let s = BANNER + '\n# Catálogo de Testes\n\n';
  s += `> Todos os arquivos de teste automatizado e quantos casos cada um cobre.\n>\n> **Backend:** ${testes.backend.length} arquivos, ${totBack} casos. **Mobile:** ${testes.mobile.length} arquivos, ${totMob} casos. **Total: ${totBack + totMob} casos.**\n>\n> _A contagem é por chamadas literais de \`it()\`/\`test()\` no código (determinística). Testes parametrizados (\`it.each\`/\`test.each\`) expandem em mais casos na execução do Jest, então o número reportado pelo Jest pode ser ligeiramente maior._\n\n`;
  s += '## Backend (Jest)\n\n| Arquivo | Casos | Suites |\n|---|---|---|\n';
  for (const t of testes.backend) {
    s += `| \`${esc(t.arquivo)}\` | ${t.casos} | ${t.suites} |\n`;
  }
  s += '\n## Mobile (Jest + Testing Library)\n\n| Arquivo | Casos | Suites |\n|---|---|---|\n';
  for (const t of testes.mobile) {
    s += `| \`${esc(t.arquivo)}\` | ${t.casos} | ${t.suites} |\n`;
  }
  return s;
}

function docMetricas(m, dados) {
  const { metricas, endpoints, prisma, migracoes, testes, areas, modulos } =
    dados;
  const totBack = testes.backend.reduce((s, t) => s + t.casos, 0);
  const totMob = testes.mobile.reduce((s, t) => s + t.casos, 0);
  let s = BANNER + '\n# Estado e Métricas do Projeto\n\n';
  s +=
    '> **Fonte única de verdade** para os números do projeto. Este documento é gerado a partir do código; se algum outro documento citar números, ele deve apontar para cá.\n\n';
  s += '## Tamanho do código\n\n';
  s += '| Área | Arquivos | Linhas | Arquivos de teste | Linhas de teste |\n|---|---|---|---|---|\n';
  s += `| Backend (\`backend/src\`) | ${metricas.backend.arquivos} | ${metricas.backend.linhas} | ${metricas.backend.arquivosTeste} | ${metricas.backend.linhasTeste} |\n`;
  s += `| Mobile (\`mobile/src\`) | ${metricas.mobile.arquivos} | ${metricas.mobile.linhas} | ${metricas.mobile.arquivosTeste} | ${metricas.mobile.linhasTeste} |\n`;
  s += '\n## Estrutura\n\n';
  s += `- **Módulos backend:** ${modulos.length}\n`;
  s += `- **Áreas de tela (mobile):** ${areas.length}\n`;
  s += `- **Rotas HTTP:** ${endpoints.total}\n`;
  s += `- **Tabelas (Prisma):** ${prisma.modelos.length}\n`;
  s += `- **Tipos/estados (enums):** ${prisma.enums.length}\n`;
  s += `- **Migrações:** ${migracoes.length}\n`;
  s += '\n## Testes automatizados\n\n';
  s += `- **Backend:** ${totBack} casos em ${testes.backend.length} arquivos\n`;
  s += `- **Mobile:** ${totMob} casos em ${testes.mobile.length} arquivos\n`;
  s += `- **Total:** ${totBack + totMob} casos\n`;
  s += `\n> Contagem por chamadas literais de \`it()\`/\`test()\` (determinística). Testes parametrizados (\`it.each\`) expandem em mais casos na execução do Jest.\n`;
  s += '\n## Cobertura do Atlas de Documentação\n\n';
  s += `- Módulos backend documentados: ver \`docs/03-atlas-backend/\` (meta: ${modulos.length}).\n`;
  s += `- Áreas mobile documentadas: ver \`docs/04-atlas-mobile/\` (meta: ${areas.length}).\n`;
  return s;
}

function docIndiceAtlas(titulo, itens, pastaRel, descricao) {
  const feitos = itens.filter((i) => i.temDoc).length;
  const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0;
  let s = BANNER + `\n# ${titulo}\n\n`;
  s += `${descricao}\n\n`;
  s += `**Cobertura:** ${feitos}/${itens.length} documentados (${pct}%).\n\n`;
  s += '| Item | Documento | Estado |\n|---|---|---|\n';
  for (const i of itens) {
    const link = i.temDoc ? `[\`${i.nome}\`](./${i.nome}.md)` : `\`${i.nome}\``;
    const estado = i.temDoc ? '✅ documentado' : '⬜ pendente';
    s += `| \`${i.nome}\` | ${link} | ${estado} |\n`;
  }
  return s;
}

/* --------------------------------- main ----------------------------------- */

console.log('Gerando documentação de referência...');

const prisma = coletarPrisma();
const endpoints = coletarEndpoints();
const migracoes = coletarMigracoes();
const testes = coletarTestes();
const areas = areasMobile();
const modulos = modulosBackend();
const metricas = coletarMetricas();

escrever('docs/05-referencia-dados/modelo-de-dados.md', docModeloDeDados(prisma));
escrever('docs/05-referencia-dados/dicionario-de-dados.md', docDicionario(prisma));
escrever('docs/05-referencia-dados/migracoes.md', docMigracoes(migracoes));
escrever('docs/05-referencia-dados/api-http.md', docApi(endpoints));
escrever('docs/06-qualidade/catalogo-de-testes.md', docCatalogoTestes(testes));
escrever(
  'docs/08-gestao/estado-e-metricas.md',
  docMetricas(metricas, {
    metricas,
    endpoints,
    prisma,
    migracoes,
    testes,
    areas,
    modulos,
  }),
);

// Índices do Atlas com painel de cobertura (documentado vs pendente).
const itensBackend = modulos.map((m) => ({
  nome: m,
  temDoc: existsSync(join(ROOT, 'docs/03-atlas-backend', `${m}.md`)),
}));
const itensMobile = areas.map((a) => ({
  nome: a,
  temDoc: existsSync(join(ROOT, 'docs/04-atlas-mobile', `${a}.md`)),
}));
escrever(
  'docs/03-atlas-backend/README.md',
  docIndiceAtlas(
    'Atlas do Backend',
    itensBackend,
    'docs/03-atlas-backend',
    'Um documento por módulo do backend (`backend/src/`). Padrão em [`_modelo-modulo.md`](./_modelo-modulo.md).',
  ),
);
escrever(
  'docs/04-atlas-mobile/README.md',
  docIndiceAtlas(
    'Atlas do Mobile',
    itensMobile,
    'docs/04-atlas-mobile',
    'Um documento por área de tela do app (`mobile/src/screens/`). Padrão em [`_modelo-tela.md`](./_modelo-tela.md).',
  ),
);

console.log('Documentação de referência gerada com sucesso.');
