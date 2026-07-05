# ADR 0009 — Justificativa (abono) de ocorrências de escala

- **Status:** Aceito
- **Contexto:** Faltas (`Ausencia`) e não-retornos de intervalo
  (`IncidenciaEscala`) impactam negativamente o Score de Saúde do colaborador
  (Assiduidade e Disciplina). Na operação, ~10 pessoas registram faltas no app,
  mas **só o gestor sabia "de cabeça" quem tinha sido justificado** — não havia
  como abonar uma ocorrência depois de registrada nem rastrear quem justificou.
- **Decisão:**
  1. **Estado de justificativa** persistido em ambas as tabelas (aditivo):
     `statusJustificativa` = **PENDENTE** (default) / **JUSTIFICADA** /
     **INJUSTIFICADA**, `motivoJustificativa`, `observacaoJustificativa` e
     **auditoria** (`justificadaPorId/Nome`, `justificadaEm`). Em `Ausencia`
     também guardamos **quem registrou** a falta (`registradaPorId/Nome`).
     Três estados (não um booleano) para distinguir "ainda não analisada" de
     "analisada e confirmada como injustificada" — habilitando o painel de
     pendentes.
  2. **Peso derivado do motivo (função pura, ver `common/justificativas.ts`):**
     PENDENTE/INJUSTIFICADA pesam **integral (1)**; JUSTIFICADA por
     **ATESTADO_MEDICO** pesa **2%**; JUSTIFICADA por qualquer outro motivo pesa
     **10%**. O score usa a soma **ponderada** (Assiduidade via `taxaPonderada`;
     Disciplina via `contarNaoRetornos` ponderado); a **contagem crua** continua
     no histórico/relatórios (realidade preservada). Como o score é calculado ao
     consultar, **justificar recalcula na hora**, inclusive de forma retroativa.
  3. **Autorização:** justificar reusa **`OPERADORES_AUSENCIAS`** — quem lança
     faltas pode justificar, **incluindo o fiscal**. A auditoria (`justificadaPorNome`)
     dá a transparência de "quem justificou", visível a toda a equipe.
  4. **Reversível:** reabrir (PENDENTE) limpa motivo e auditoria; JUSTIFICADA
     exige motivo; INJUSTIFICADA não tem motivo. Endpoints
     `PATCH /operadores/ausencias/:id/justificativa` e
     `PATCH /escala/incidencias/:id/justificativa`. Painel de transparência via
     `GET /operadores/ausencias` (com `?pendentes=true`).
- **Consequências:**
  - ✅ Faltas/não-retornos justificados quase não penalizam o score, mas o
    histórico segue mostrando tudo (nada some).
  - ✅ Transparência total: estado + quem registrou + quem justificou.
  - ✅ Migração aditiva, domínio puro (peso) testado por propriedade,
    retrocompatível (sem justificativa = PENDENTE = comportamento anterior).
  - ⚠️ Os pesos (2% / 10%) são regra de negócio calibrada; se precisarem ser
    configuráveis por loja no futuro, mover para `config_sistema`.
