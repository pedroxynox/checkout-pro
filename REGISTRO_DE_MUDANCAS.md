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
