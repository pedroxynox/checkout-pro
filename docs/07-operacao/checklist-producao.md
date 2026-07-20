# Checklist de Produção — Check-out PRO

Guia de prontidão para colocar (e manter) a aplicação em produção com segurança.
Marque cada item antes de liberar um deploy para os usuários finais.

> Contexto: API NestJS (`backend/`) hospedada no Render, com PostgreSQL gerenciado
> e assistente de IA via Google Gemini. Operação com ~15 fiscais simultâneos.

---

## 1. Configuração obrigatória no Render (BLOQUEANTE)

Sem estes itens a aplicação **não sobe** ou fica insegura/instável:

- [ ] **`JWT_SECRET`** definido (longo e aleatório, ex.: `openssl rand -hex 32`).
      Sem ele **a API não inicializa em produção** (falha rápida no boot) — não há
      mais segredo padrão inseguro.
- [ ] **`DATABASE_URL`** definido e apontando para o PostgreSQL de produção.
      Também é obrigatório: **a API não sobe** sem ele.
- [ ] **`CORS_ORIGINS`** definido com as origens permitidas (ex.:
      `https://checkout-pro-web.onrender.com`), separadas por vírgula. Se vazio, a
      API reflete a origem da requisição — inadequado para produção.
- [ ] **`GEMINI_API_KEY`** definido (assistente Cluby). Sem ela, o assistente
      responde "não configurado".
- [ ] **`SENHA_INICIAL`** definido no painel do serviço (não versionado; no
      `render.yaml` está como `sync: false`). É a senha inicial dos usuários do
      seed — troque após o primeiro login.
- [ ] **Migrações aplicadas** via `prisma migrate deploy`. Já configuradas como
      **Pre-Deploy Command** no `render.yaml` (`npx prisma migrate deploy && npx
      prisma db seed`), garantindo o schema atualizado antes de a nova versão
      entrar no ar.

## 2. Infra de produção

- [ ] **Plano pago do Gemini:** a cota gratuita (~20 req/min) é insuficiente para
      ~15 fiscais simultâneos (gera `RESOURCE_EXHAUSTED`). Ativar faturamento no
      Google AI Studio.
- [x] **PostgreSQL persistente:** migrado para o plano pago `basic-256mb` (jul/2026),
      sem a expiração de ~30 dias do plano free. O backend fixa o pool de conexões
      via `DATABASE_CONNECTION_LIMIT` (padrão `10`) para respeitar o limite modesto
      desse plano.
- [x] **Endurecer o deploy:** migrações rodam no **Pre-Deploy Command** e o Start
      Command ficou apenas com `node dist/main.js` (configurado no `render.yaml`).
      Isso evita que o *advisory lock* do Prisma (em deploys encavalados) trave a
      porta em silêncio.
- [ ] **Storage de arquivos persistente:** o disco do Render é efêmero **mesmo no
      plano pago** (apagado a cada deploy; não há *Render Disk* montado). As fotos
      de checklist (`LocalDiskStorage`) se perdem entre deploys — migrar para um
      storage de objetos S3-compatível é a próxima prioridade.
- [ ] **Remover o serviço web duplicado** no Render (existem 2 serviços web —
      manter apenas um).
- [ ] **Health check de readiness:** opcionalmente apontar o health check do Render
      para `GET /health/ready` (verifica prontidão, incluindo o banco) em vez do
      liveness simples.

## 3. Melhorias futuras (não bloqueantes)

- [ ] **Catálogo de permissões compartilhado:** unificar de fato o catálogo entre
      backend e mobile (atenção: mexe no build do Expo).
- [ ] **Push notifications reais:** integrar FCM/Expo (`expo-notifications` +
      `pushToken` + `expo-server-sdk`). Hoje só há notificações in-app.
- [ ] **Limpeza de modelos deprecados / coluna `Insumo.saldo`:** migração
      destrutiva pendente — hoje preserva-se o histórico, então avaliar impacto
      antes de remover.
