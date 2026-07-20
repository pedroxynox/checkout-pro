> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** operação — runbook de incidentes em produção

# Runbook de incidentes — Check-out PRO

O que fazer quando algo falha em produção. Cada cenário segue o formato
**sintoma → diagnóstico → ação**. Use junto com o
[Checklist de produção](checklist-producao.md), o [`deploy.md`](deploy.md) e as
[variáveis de ambiente](variaveis-de-ambiente.md).

---

## Onde ver logs e status

| Fonte | O que mostra |
|---|---|
| **Render → serviço `checkout-pro-api` → Logs** | Logs em tempo real da API (boot, migrações no *pre-deploy*, erros de runtime). |
| **Render → serviço → Events** | Histórico de deploys, reinícios e falhas de build/pre-deploy. |
| **`GET /health`** | Liveness: 200 se o processo está de pé. |
| **`GET /health/ready`** | Readiness: 200 se o banco responde; **503** se o PostgreSQL está indisponível. |
| **Render → banco `stok-center-db`** | Status, conexões e validade do plano do PostgreSQL. |
| **GitHub → aba Actions** | Resultado do CI (`ci.yml`), do guardião de docs (`docs.yml`) e do build do APK (`build-apk.yml`). |
| **App móvel** | Erros de rede aparecem como timeout após 60s (ver `mobile/src/api/config.ts`). |

---

## 1. API lenta na primeira requisição

- **Sintoma:** a primeira requisição após um período ocioso demora ou o app
  mostra timeout; depois normaliza.
- **Diagnóstico:** desde jul/2026 o serviço web usa o plano pago `starter`, que
  **não hiberna** — o antigo *cold start* do plano free (e o workflow
  `keep-alive` que o mascarava) **não se aplicam mais**. Uma lentidão inicial
  agora aponta para outra causa: um **deploy em andamento** (reinício do
  serviço, ver aba **Events**) ou o **banco indisponível** (cenário 2).
- **Ação:**
  1. Verifique em **Events** se há um deploy/reinício em curso; aguarde concluir.
  2. Cheque `GET /health/ready` — se responder **503**, trate como o cenário 2
     (banco indisponível).
  3. Se persistir sem deploy em curso, inspecione os **Logs** do serviço.

---

## 2. Banco de dados indisponível

- **Sintoma:** `GET /health/ready` responde **503**; operações que leem/gravam
  falham; o app mostra erros ao carregar dados.
- **Diagnóstico:**
  - Verifique o status do banco `stok-center-db` no Render.
  - **Esgotamento de conexões:** o plano `basic-256mb` tem um limite de conexões
    modesto. O backend fixa o pool via `DATABASE_CONNECTION_LIMIT` (padrão `10`);
    se o banco recusar conexões, confira esse teto e as sessões abertas (psql,
    migrações, seed) no painel do banco.
  - Confirme se `DATABASE_URL` no serviço aponta para o banco correto (é
    injetada automaticamente pelo `render.yaml`).
- **Ação:**
  1. Se o banco está fora, verifique o painel do Render e restaure/reative a
     instância `stok-center-db`; atualize a conexão se necessário.
  2. Se o erro for recusa por excesso de conexões, reduza `DATABASE_CONNECTION_LIMIT`
     ou encerre sessões ociosas; reavalie o teto ao subir de plano/instâncias.
  3. Reaplique as migrações se necessário: `npx prisma migrate deploy` (roda no
     *pre-deploy* de cada deploy).
  4. Em banco novo/vazio, rode o seed **uma vez**: `npx prisma db seed`.

---

## 3. Erro 500 (Internal Server Error)

- **Sintoma:** endpoints respondem 500; o app exibe falha genérica.
- **Diagnóstico:**
  1. Abra os **Logs** do serviço no Render e localize o stack trace no horário
     do erro.
  2. Verifique se um deploy recente coincide com o início dos erros (aba
     **Events**).
  3. Cheque se o boot passou pela validação de ambiente — se uma variável
     obrigatória faltar, a API **nem sobe** (mensagem `Configuração de ambiente
     inválida`), o que é diferente de 500.
- **Ação:**
  1. Se for regressão de um deploy, faça *rollback* para o deploy anterior no
     Render enquanto investiga.
  2. Reproduza localmente com `npm run verify` (ver
     [`instalacao-local.md`](instalacao-local.md)).
  3. Corrija, abra PR (o CI valida) e faça novo deploy.

---

## 4. Notificação push não chega

- **Sintoma:** usuários não recebem avisos fora do app.
- **Diagnóstico:** **não há push real integrado** no momento — só existem
  notificações **in-app** (ver o item de melhorias futuras no
  [Checklist de produção](checklist-producao.md)). Portanto, "push que não
  chega" é comportamento esperado, não uma falha.
- **Ação:**
  1. Confirme que a expectativa é de notificação in-app (dentro do app), que
     depende da conexão WebSocket de notificações estar ativa.
  2. Se as notificações in-app também não aparecem, verifique a conectividade
     com a API (reinício/deploy ou banco — cenários 1 e 2) e o namespace de
     notificações.
  3. Push externo (FCM/Expo) é trabalho futuro; abra tarefa se for requisito.

---

## 5. Assistente (Gemini) respondendo 503 / instável

- **Sintoma:** o chat do assistente demora e depois falha, ou avisa que está
  sobrecarregado; em picos, erro de limite.
- **Diagnóstico:**
  - O cliente Gemini já faz **reintento automático com backoff** para respostas
    **429** (limite) e **503** (sobrecarga), respeitando o `retryDelay`
    sugerido, e cada tentativa tem timeout. Falha persistente indica cota
    esgotada ou instabilidade do provedor.
  - A cota **gratuita** (~20 req/min) é insuficiente para ~15 fiscais
    simultâneos e gera `RESOURCE_EXHAUSTED`.
  - Se `GEMINI_API_KEY` não estiver definida, o assistente responde
    "não configurado" (não é 503).
- **Ação:**
  1. Confirme `GEMINI_API_KEY` definida no painel do serviço (secreta,
     `sync: false`).
  2. Para 429/`RESOURCE_EXHAUSTED` recorrente, **ative o faturamento** no Google
     AI Studio (sair da cota gratuita).
  3. Para 503 esporádico, aguarde: o reintento automático costuma resolver;
     verifique o status do provedor se persistir.
  4. Confira o `GEMINI_MODEL` (padrão `gemini-2.5-flash`) — modelos
     descontinuados perdem cota.

---

## 6. CI do guardião da documentação falhando

- **Sintoma:** o workflow **Guardião da Documentação** (`docs.yml`) falha no
  push/PR e bloqueia o merge.
- **Diagnóstico:** duas causas possíveis (o log do job indica qual):
  1. **Referência desatualizada:** alguém mudou o código (rotas, tabelas,
     testes…) e não regenerou os documentos automáticos — o guardião regenera e
     compara com o commit.
  2. **Atlas não acompanhou o código:** arquivos de um módulo
     (`backend/src/<modulo>/` ou `mobile/src/screens/<area>/`) mudaram, mas o
     documento correspondente do Atlas não foi atualizado no mesmo conjunto de
     alterações.
- **Ação:**
  1. Para (1): rode `npm run docs:gen` localmente e faça commit dos arquivos
     gerados. Valide com `npm run docs:check`.
  2. Para (2): atualize o documento do Atlas do módulo/área alterado e inclua-o
     no mesmo PR.
  3. **Escape de emergência** (usar com parcimônia): incluir `[skip-docs]` na
     mensagem do último commit pula o guardião.

> **Não edite manualmente** os arquivos gerados nem rode `gerar-docs.mjs` para
> "consertar" à mão fora do fluxo — deixe o `docs:gen`/`docs:check` cuidarem
> disso.

---

## Escalonamento

Se um incidente persistir após as ações acima (ex.: indisponibilidade
prolongada do provedor, perda de arquivos por storage efêmero), acione a
**Engenharia** responsável e registre o incidente com o trecho de log relevante
e o horário. Priorize os itens bloqueantes do
[Checklist de produção](checklist-producao.md).
