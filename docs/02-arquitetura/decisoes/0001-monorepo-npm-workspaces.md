# ADR 0001 — Monorepo com npm workspaces (backend + mobile)

- **Status:** Aceito
- **Contexto:** Um único produto precisa de API (NestJS) e app (Expo/RN + web).
- **Decisão:** Monorepo com dois workspaces npm independentes (`backend/`,
  `mobile/`), compilados e testados separadamente. Não compartilham código.
- **Consequências:**
  - ✅ Deploy independente (API e Web como serviços distintos no Render).
  - ✅ Ferramentas próprias por pacote (Jest, ESLint, TS strict em cada um).
  - ⚠️ Contratos (tipos, catálogo de permissões) são **espelhados manualmente**
    entre os pacotes (ver ADR 0002).
