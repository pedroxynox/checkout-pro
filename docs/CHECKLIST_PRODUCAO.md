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
- [ ] **Migrações aplicadas** via `prisma migrate deploy` (idealmente como
      **Pre-Deploy Command** no Render), garantindo o schema atualizado antes de a
      nova versão entrar no ar.

## 2. Infra de produção

- [ ] **Plano pago do Gemini:** a cota gratuita (~20 req/min) é insuficiente para
      ~15 fiscais simultâneos (gera `RESOURCE_EXHAUSTED`). Ativar faturamento no
      Google AI Studio.
- [ ] **PostgreSQL persistente:** o plano free do Render expira em ~30 dias e pode
      **causar perda de dados**. Migrar para um plano pago/estável.
- [ ] **Endurecer o deploy:** rodar as migrações no **Pre-Deploy Command** e deixar
      o Start Command apenas com `node dist/main.js`. Isso evita que o *advisory
      lock* do Prisma (em deploys encavalados) trave a porta em silêncio.
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
