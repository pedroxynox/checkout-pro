# ADR 0013 — Infra paga no Render e teto explícito do pool de conexões

- **Status:** Aceito
- **Data:** 2026-07-20
- **Contexto:** Até jul/2026 o Check-out PRO rodava inteiramente no **plano
  gratuito do Render**: o serviço web hibernava após ~15 min de ociosidade
  (*cold start* de ~30–60s, mascarado por um workflow de *keep-alive* que
  pingava `/health`) e o PostgreSQL gratuito **expirava em ~30 dias**, com risco
  de perda de dados. Essa base limitava estabilidade, latência e continuidade —
  independentemente de qualquer otimização de código (cache, índices etc.). A
  decisão de escalonamento priorizou **primeiro a infraestrutura**, antes de
  introduzir componentes como cache distribuído/Redis.
- **Decisão:**
  1. **Serviço web no plano pago `starter`** (~US$7/mês): não hiberna, elimina o
     *cold start*. Em consequência, o workflow `keep-alive.yml` foi **removido**
     (deixou de ter função e só gerava ruído e consultas desnecessárias).
  2. **PostgreSQL no plano pago `basic-256mb`** (o pago mais barato): persistente,
     sem a expiração de ~30 dias.
  3. **Teto explícito do pool de conexões do Prisma:** o `basic-256mb` tem um
     limite de conexões modesto. O `PrismaService` passou a aplicar
     `connection_limit` (e `pool_timeout`) à `DATABASE_URL`, controlado pela
     variável `DATABASE_CONNECTION_LIMIT` (padrão **10**), dimensionado para
     **uma única instância** web. Sem esse teto, a fórmula padrão do Prisma —
     somada a migrações, seed e sessões manuais — poderia esgotar o banco.
  4. O `render.yaml` foi **sincronizado** com os planos pagos, para que o
     Blueprint reflita a realidade (infra como código) e não reverta os planos
     ao ser reaplicado.
- **Consequências:**
  - ✅ Estabilidade: sem hibernação e sem expiração do banco; a API responde
     sem *cold start*.
  - ✅ Proteção do banco: pool com teto explícito, ajustável por ambiente sem
     alterar código.
  - ✅ Menos ruído operacional: um workflow a menos e um cenário de incidente
     (cold start) que deixou de existir.
  - ⚠️ **Instância única:** a estratégia atual assume **uma** instância web.
     Antes de escalar horizontalmente (várias instâncias), será preciso resolver
     as premissas *single-instance* — em especial o **adapter de Socket.IO**
     (hoje os gateways `/fiscais` e `/notificacoes` fazem broadcast/rooms em
     memória) e o **estado em memória** de alguns serviços. Só então um
     **Render Key Value (Redis)** se justifica — como adapter e store
     compartilhado, não como cache.
  - ⚠️ **Storage ainda efêmero:** o disco do Render continua efêmero **mesmo no
     plano pago** (sem *Render Disk* montado). As fotos de checklist gravadas por
     `LocalDiskStorage` se perdem entre deploys — a migração para um storage de
     objetos **S3-compatível** é a próxima prioridade.
  - 🔧 O teto de `10` foi escolhido de forma conservadora; um **teste de carga**
     deve validar o ponto de saturação de uma instância antes de decidir subir de
     plano ou escalar horizontalmente.
