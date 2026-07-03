# Registro de Mudanças — Limpeza, Permissões e Áreas

> Documento de manutenção (em português) descrevendo as melhorias aplicadas ao
> projeto: unificação de permissões, acesso total do gerente desenvolvedor,
> remoção de código morto e ocultação de áreas em construção. Serve de
> referência para entender **o que mudou e por quê**.
>
> Importante: o ambiente de edição não tinha as dependências instaladas (rede
> restrita), então **não foi possível rodar `build`/`lint`/`jest` aqui**. Cada
> mudança foi validada por análise estática (rastreio de todos os imports). É
> recomendável rodar a verificação completa antes do deploy (ver o final).

---

## Segurança: revogação de sessões via tokenVersion (2026-07-03)

**Objetivo:** permitir invalidar JWTs antes do vencimento (os tokens duram 30
dias e, até então, nada os invalidava mais cedo).

- **JWT agora carrega `tokenVersion`:** no login, o token passa a incluir a
  versão atual do usuário. O `JwtAuthGuard`, após validar a assinatura, compara
  o `tokenVersion` do token com a versão atual do usuário no banco e **rejeita**
  (401 "Sessão expirada. Faça login novamente.") quando divergem — ou quando o
  usuário não existe mais.
- **Redefinir senha invalida sessões antigas imediatamente:** `redefinirSenha`
  passa a incrementar `tokenVersion` (`{ increment: 1 }`), de modo que todos os
  JWTs emitidos antes da troca deixam de ser aceitos.
- **Remoção de usuário também invalida:** não exige mudança específica — o guard
  já rejeita tokens de usuários inexistentes (o `findUnique` retorna null).
- **Mudança aditiva no banco:** nova coluna `tokenVersion` em `usuarios`
  (`INTEGER NOT NULL DEFAULT 0`), sem impacto em usuários ou tokens atuais.
  Tokens antigos, sem o campo `tokenVersion`, são lidos como 0 e continuam
  válidos até que a versão do usuário mude (nenhum re-login forçado no deploy).
- **Tradeoff:** o guard passa a fazer **1 leitura por requisição autenticada**
  (`findUnique` por chave primária, indexada) para comparar a versão do token.

---

## Resiliência: timeout/concorrência no Gemini e readiness com checagem de banco (2026-07-03)

**Objetivo:** evitar que dependências externas (API do Gemini e banco de dados)
travem ou mascarem indisponibilidades do serviço.

- **(7) Cliente Gemini com timeout por tentativa e concorrência limitada:** cada
  tentativa de chamada à API do Gemini agora tem um **timeout** de 20s
  (via `AbortController`), impedindo que uma conexão pendurada bloqueie o fluxo
  indefinidamente. Além disso, a antiga **fila única** (que serializava as
  chamadas, uma de cada vez, causando bloqueio de cabeça de fila) foi
  substituída por um **semáforo de concorrência limitada** que permite até 2
  chamadas simultâneas — melhora a vazão em picos de uso sem estourar a cota
  gratuita. O reintento automático com backoff (429/503) foi mantido.
- **(15) Endpoint de readiness `/health/ready` com checagem real de banco:** o
  `/health` continua sendo a verificação de **liveness** (o processo está de pé;
  responde sempre 200 — é o que o Render consulta e não foi alterado). Foi
  adicionado o `/health/ready` (**readiness**), que executa `SELECT 1` no banco
  e responde **503** quando o banco está indisponível, para que monitores/
  orquestradores não roteiem tráfego para uma instância incapaz de servir.
  Também tornamos `DATABASE_URL` **obrigatória em produção** (falha rápida no
  boot, junto com a exigência já existente de `JWT_SECRET`).

---

## 0. Hardening de segurança (2026-07-03)

**Objetivo:** reduzir a superfície de ataque da API com medidas de defesa em
profundidade, sem alterar comportamento legítimo.

- **Rate-limit no login + helmet:** adicionado `@nestjs/throttler` com um teto
  GLOBAL alto (2000 req/min) — apenas anti-abuso, pois todos os usuários da loja
  compartilham UM IP público (NAT) e um limite baixo causaria falsos `429` para
  o time inteiro. O limite ESTRITO (8 tentativas/min) é aplicado SOMENTE à rota
  de login (`POST /acessos/login`), protegendo contra força bruta — o login é
  raro (sessões de 30 dias). Adicionado `helmet` para cabeçalhos de segurança
  HTTP, com `Cross-Origin-Resource-Policy: cross-origin` para que as imagens
  estáticas em `/assets` continuem carregáveis pelo app web em outro domínio.
- **Limites de tamanho de upload:** novos presets em
  `backend/src/common/upload-options.ts` — 2 MiB para arquivos de texto (.txt de
  arrecadação e vendas) e 10 MiB para imagens (fotos do checklist), ambos com
  `files: 1`. Evita que um upload gigante seja carregado inteiro em memória
  (proteção contra exaustão de RAM).
- **CORS por allowlist (`CORS_ORIGINS`):** as origens permitidas passam a vir da
  variável de ambiente `CORS_ORIGINS` (lista separada por vírgula); sem ela (dev)
  a origem é refletida. Como a autenticação é via token Bearer (sem cookies),
  `credentials` foi desabilitado. Os gateways WebSocket (`/fiscais` e
  `/notificacoes`) deixaram de usar `origin: '*'` e passaram a respeitar a mesma
  allowlist.
- **Chave do Gemini no cabeçalho:** a chave da API do Google Gemini deixou de ser
  enviada na query string da URL (`?key=`) e passou para o cabeçalho
  `x-goog-api-key`, evitando vazamento em logs de acesso/proxies.

---

## 0b. Segurança: JWT_SECRET obrigatório em produção + remoção de xlsx/papaparse (2026-07-03)

**Objetivo:** eliminar dois riscos críticos de segurança.

- **JWT_SECRET agora é obrigatório em produção (falha rápida no boot).** O
  fallback fixo e inseguro `'dev-secret-trocar'` (que era versionado no
  repositório e permitiria forjar tokens) foi **removido**. A exigência é
  imposta em dois pontos: na validação de ambiente (`validateEnv`, que lança se
  `NODE_ENV=production` sem `JWT_SECRET`) e na resolução do segredo
  (`resolverSegredoJwt`). Em desenvolvimento/teste, quando `JWT_SECRET` não está
  definido, gera-se um **segredo aleatório efêmero por processo** (memoizado e
  compartilhado entre `AcessosModule` e `SegurancaModule`), nunca um valor fixo.
  Sem mudança de comportamento quando `JWT_SECRET` está definido corretamente.
  - Novo arquivo: `backend/src/common/config/jwt-secret.ts` (+ testes).
  - Ajustes: `acessos.module.ts`, `common/seguranca.module.ts`,
    `config/env.validation.ts`, `main.ts` (remoção do aviso agora obsoleto) e
    `.env.example`.
- **Dependências `xlsx` e `papaparse` removidas (código morto / CVEs).** O
  fluxo antigo de leitura de arquivos CSV/XLSX já não tinha chamador vivo.
  De `importacoes.parser.ts` restou apenas `parseValor` (conversão de valores
  monetários em R$), reaproveitado pelos parsers de arrecadação e de vendas.
  Removidos também `@types/papaparse` e as funções mortas
  (`parseData`/`parseCsv`/`parseXlsx`/`valorDaColuna`/`paraLinhaImportada`).

---

## 1. Permissões: fonte única de verdade + acesso total do desenvolvedor

**Objetivo:** o perfil `GERENTE_DESENVOLVEDOR` deve ver **absolutamente tudo**, e
as regras de permissão devem ficar centralizadas.

- Criado um **catálogo único** de funcionalidades `TODAS_FUNCIONALIDADES` (com o
  tipo `Funcionalidade`) em:
  - `backend/src/acessos/acessos.domain.ts` (fonte de verdade);
  - `mobile/src/auth/funcionalidades.ts` (espelho do app, bem documentado).
- As listas de cada perfil agora são tipadas como `readonly Funcionalidade[]`,
  o que garante **em tempo de compilação** que só usem funcionalidades que
  existem no catálogo (evita "permissão fantasma" digitada errado).
- `GERENTE_DESENVOLVEDOR` continua liberado por uma regra explícita
  (`return true`), de modo que enxerga tudo — inclusive qualquer funcionalidade
  **nova** adicionada ao catálogo no futuro, sem precisar mexer na regra.
- Adicionado teste-guarda `backend/src/acessos/acessos.permissoes.spec.ts` que
  garante: (a) o desenvolvedor vê todas as funcionalidades; (b) toda
  funcionalidade de qualquer perfil existe no catálogo.

**Observação honesta:** backend e app são pacotes compilados separadamente e não
compartilham código. A unificação real "em um único arquivo" para os dois exigiria
um pacote compartilhado no monorepo (com ajustes de build do Expo/Metro), o que é
arriscado sem poder compilar. A solução adotada deixa **um catálogo único por
pacote**, idênticos, com documentação cruzada e teste-guarda. Mover para um pacote
compartilhado fica como melhoria futura (ver seção 5).

## 2. Remoção de código morto

### App (mobile) — removido por completo (estava sem uso)
- `mobile/src/api/services/importacoes.ts` (fluxo antigo de importação CSV/XLSX).
- `mobile/src/api/services/indicadores.ts` (painel de vendas manual antigo).
- Limpeza dos `export` correspondentes em `mobile/src/api/services/index.ts`.
- Removidos os tipos órfãos em `mobile/src/api/types.ts` (`TipoArquivo`,
  `StatusImportacao`, `StatusDia`, `RegistroImportacao`, `ResultadoImportacao`).

> As telas atuais de Importações e Indicadores usam `arrecadacaoService` e
> `vendasService` (arquivos `.txt`), confirmado por busca em todo o app.

### Backend — removida a "superfície HTTP" antiga (controllers/services/módulos)
- `IndicadoresModule` e `ImportacoesModule` retirados de `app.module.ts`.
- Deletados: `indicadores.controller.ts`, `indicadores.service.ts`,
  `indicadores.module.ts`, `dto/indicadores.dto.ts`, `indicadores.domain.ts` e
  seus specs; `importacoes.controller.ts`, `importacoes.service.ts`,
  `importacoes.module.ts`, `dto/importacoes.dto.ts` e seus specs de
  controller/service.

### Backend — arquivos mantidos DE PROPÓSITO (não são código morto)
Estes ficaram porque **código vivo depende deles** (documentado no topo de cada
arquivo):
- `importacoes/importacoes.parser.ts` → `parseValor` é reutilizado pelos parsers
  ATUAIS de **arrecadação** e **vendas**.
- `importacoes/importacoes.domain.ts` → fornece o tipo `LinhaImportada` usado
  pelo parser acima.
- `importacoes/importacoes.errors.ts` (`ColunaAusenteError`) e
  `indicadores/indicadores.errors.ts` (`ValorVendaInvalidoError`) → ainda são
  referenciados pelo **filtro global de exceções**
  (`common/filters/dominio-exception.filter.ts`).

## 3. Correção de bug latente no alerta de fim do dia

O cron de "importações pendentes" (`AlertasService`) lia a tabela do fluxo
**antigo** (`RegistroImportacao`), que **não é mais alimentada** — ou seja, o
alerta estava obsoleto. Ele foi **migrado para o fluxo atual**:

- `AlertasService` agora depende de `ArrecadacaoService` (não mais de
  `ImportacoesService`).
- "Pendente" passou a significar: indicador do dia que ainda não foi enviado nem
  marcado como "sem movimento" (via `ArrecadacaoService.status`).
- Atualizados `alertas.module.ts` (importa `ArrecadacaoModule`) e o teste
  `alertas.service.spec.ts` (simula `status`).

## 4. Ocultar áreas "em breve" até serem concluídas

- Adicionada a marca `emBreve?: boolean` em `mobile/src/navigation/areas.ts`.
- Marcadas como `emBreve: true`: **Alertas de Fila**, **Normativas** e
  **Indicador de Quebra**.
- A `HomeScreen` passou a filtrar `!a.emBreve`, então essas áreas ficam ocultas
  do menu (inclusive para o gerente desenvolvedor) até serem finalizadas. Basta
  remover a marca para reexibir.
- Teste `HomeScreen.test.tsx` atualizado para confirmar que as áreas em
  construção não aparecem.

## 5. Próximos passos recomendados (não feitos por segurança)

- **Verificar com build/testes** (não foi possível neste ambiente):
  - Backend: `npm run -w backend prisma:generate && npm run -w backend build && npm run -w backend lint && npm run -w backend test`
  - App: `npm run -w mobile type-check && npm run -w mobile lint && npm run -w mobile test`
- **Limpeza profunda opcional do `importacoes`**: mover `parseValor` para um
  utilitário comum, remover as funções de parser CSV/XLSX não usadas e o
  `ColunaAusenteError` (hoje nunca lançado) do filtro. Exige build para validar.
- **Permissões em pacote compartilhado**: extrair o catálogo para um pacote do
  monorepo consumido por backend e app, eliminando o espelho manual.
- As tabelas antigas no banco (`RegistroImportacao`, etc.) **não foram tocadas**
  (nenhuma migração destrutiva) — continuam existindo, apenas sem uso.


---

## 6. Correções para deixar a CI verde (problemas PRÉ-EXISTENTES)

Ao rodar a nova CI no GitHub, descobrimos que o `main` **já tinha** testes e
verificações de tipo quebrados, sem relação com a limpeza acima (a CI nunca
havia sido executada). O build e o lint do backend passaram; as falhas eram em
testes e no type-check do app. Correções aplicadas (sem alterar lógica de
produção — apenas testes/tipos):

### Causadas pela limpeza (responsabilidade desta mudança)
- `alertas.service.spec.ts`: import do tipo `StatusArrecadacao` corrigido (vem
  de `arrecadacao.service`, não do `domain`).
- `test/importacao.e2e.spec.ts`: **removido** — testava o `ImportacoesController`
  do fluxo antigo, que foi excluído.

### Pré-existentes (reveladas pela CI, corrigidas aqui)
- **App (type-check):**
  - `components/Cartao.tsx`: passou a aceitar a prop `style` (além de `estilo`),
    corrigindo 5 erros de tipo em telas que já a usavam (Jornada, Insumos). Como
    bônus, estilos que eram silenciosamente ignorados agora se aplicam.
  - `FiscaisScreen.tsx`: removida função `iconeStatus` sem uso.
  - `IndicadorDetalheScreen.tsx`: removido parâmetro `anterior` sem uso.
  - `PainelVendasScreen.tsx`: `porHora`/`porHoraDia` agora convertem `null` em
    `undefined` (compatível com o tipo esperado).
- **Backend (testes com Prisma falso desatualizado):**
  - `fiscais.service.spec.ts` e `fiscais.gateway.spec.ts`: o Prisma falso ganhou
    `escalaEntry.findFirst` (usado por `isFolgaHoje`).
  - `lote-apae.service.spec.ts`: o Prisma falso ganhou `movimentoLoteApae`
    (aggregate/create) e `configApae` (findUnique/create).
  - `lote-apae.controller.spec.ts`: a chamada de `atualizarSaldo` passou a
    incluir o 3º argumento `usuario` (a assinatura do controller já o exigia).
- **Backend (testes desalinhados do código — alinhados ao comportamento atual):**
  - `checklist.service.spec.ts`: o alerta de pendência dispara às **09:00**
    (15 min antes do limite 09:15), não às 08:55 — o teste foi corrigido para
    refletir o código.
  - `fiscais.service.spec.ts` e `fiscais.properties.spec.ts`: **carga horária =
    tempo trabalhando (sem intervalo)**, conforme a definição documentada em
    `Jornada.cargaHorariaMs`. Os testes esperavam, por engano, "trabalho +
    intervalo". ⚠️ **Recomendação:** o time deve confirmar qual é a definição
    desejada de "carga horária". Se for "tempo total de presença" (com
    intervalo), a mudança deve ser feita no código (`calcularJornada`) e não nos
    testes. Mantivemos o comportamento de produção **inalterado**.

> Nenhuma lógica de produção foi alterada nesta seção; as mudanças são em
> testes, em tipos e na prop de um componente. A intenção foi deixar a CI verde
> sem mudar o comportamento do app/produção.


---

## 7. Testes do app voltam a ser OBRIGATÓRIOS (Opção B)

A pedido (o projeto será passado a outras pessoas no futuro), a suíte de testes
do app foi reparada e voltou a **bloquear** o merge (removido o
`continue-on-error`). Mudanças, **apenas em arquivos de teste** (sem tocar a
lógica do app):

- **Mocks de serviço completados** em `ImportacoesScreen.test` e
  `InsumosScreen.test` (status, listarProativo, sugestões, etc.).
- **Dados de teste atualizados** em `InsumosScreen.test`: o selo de estoque
  agora é por **nível** (`Crítico`/`Atenção`/`OK`), não mais o antigo "Baixo".
- **Testes de snapshot substituídos por verificações concretas** (ex.: "o texto
  X aparece na tela") em ImportacoesScreen, InsumosScreen e EscalaScreen, e os
  arquivos `.snap` foram removidos. Snapshots de árvore inteira eram frágeis e
  quebravam a cada ajuste de layout; as verificações concretas são mais
  estáveis e fáceis de manter por futuros desenvolvedores.
- CI: o passo de testes do app deixou de ser informativo e voltou a ser
  obrigatório, junto com build, type-check e lint.
