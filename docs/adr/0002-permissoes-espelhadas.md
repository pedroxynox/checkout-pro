# ADR 0002 — Catálogo de permissões espelhado (não compartilhado)

- **Status:** Aceito (com dívida técnica reconhecida)
- **Contexto:** A autorização é uma *allowlist por funcionalidade*. Backend e
  mobile precisam da mesma lista, mas não compartilham código (ADR 0001).
- **Decisão:** Manter a **fonte única de verdade** em
  `backend/src/acessos/acessos.domain.ts` (`TODAS_FUNCIONALIDADES` +
  `decidirAutorizacao`) e um **espelho manual** documentado em
  `mobile/src/auth/funcionalidades.ts`. A autorização real é sempre a do
  backend (guards); o mobile só decide o que aparece na tela. Um *test-guarda*
  (`acessos.permissoes.spec.ts`) valida a coerência do lado backend.
- **Alternativa descartada (por ora):** pacote compartilhado no monorepo —
  exigiria ajustes de build do Expo/Metro; risco alto sem poder compilar.
- **Consequências:**
  - ✅ Simples, sem tocar o build do Expo.
  - ⚠️ Risco de divergência do espelho do mobile. **Melhoria futura:** extrair
    para um pacote compartilhado.
