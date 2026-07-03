# ADR 0003 — Lógica de domínio pura + Property-Based Testing

- **Status:** Aceito
- **Contexto:** Regras de negócio (metas, jornada, escala, autorização,
  arrecadação) precisam ser corretas e testáveis sem infraestrutura.
- **Decisão:** Cada módulo isola a lógica em `*.domain.ts` **puro** (sem Nest,
  Prisma, bcrypt nem JWT). Essas funções são validadas com **fast-check**
  (≥100 iterações), anotadas com `// Feature: ..., Property N: ...`.
- **Consequências:**
  - ✅ Alta testabilidade e confiança; testes determinísticos e rápidos.
  - ✅ Facilita raciocinar sobre invariantes (ex.: unicidade de login).
  - ⚠️ Exige disciplina para não vazar I/O ao domínio.
