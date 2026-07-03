# ADR 0005 — Identificadores polimórficos sem chave estrangeira rígida

- **Status:** Aceito (com risco reconhecido)
- **Contexto:** `Ausencia.pessoaId` e `EscalaEntry.funcionarioId` referenciam
  pessoas que podem ser operador, fiscal ou gerente; operadores não têm
  `Usuario`.
- **Decisão:** Manter esses campos como identificadores **sem FK rígida**,
  adicionando `colaboradorId` (nullable) para o vínculo canônico durante a
  transição.
- **Consequências:**
  - ✅ Flexibilidade para conviver com dados históricos sem migração destrutiva.
  - ⚠️ Sem integridade referencial garantida pelo banco nesses vínculos; a
    consistência depende do código.
