# ADR 0006 — Fluxo de arquivos `.txt` substitui o antigo CSV/XLSX

- **Status:** Aceito
- **Contexto:** O fluxo original de importação (CSV/XLSX, módulos `indicadores`
  e `importacoes`) foi substituído por parsers `.txt` próprios
  (`arrecadacao`, `vendas`).
- **Decisão:** A UI usa exclusivamente o fluxo `.txt`. A superfície HTTP antiga
  foi removida; **mantiveram-se de propósito** utilitários ainda referenciados
  por código vivo: `importacoes.parser` (`parseValor`), `importacoes.domain`
  (tipo `LinhaImportada`) e os `*.errors.ts` (usados pelo filtro global).
- **Acoplamento a observar:** `vendas` grava `VendaDiaria`, que é a **fonte dos
  percentuais** dos indicadores de cancelamento/devolução. Alterar o upload de
  vendas afeta os indicadores.
- **Consequências:**
  - ✅ Parsers sob medida para o layout real de cada relatório.
  - ⚠️ Coexistência de código vivo/deprecado aumenta a carga cognitiva;
    candidato a limpeza profunda quando validada a não-dependência.
