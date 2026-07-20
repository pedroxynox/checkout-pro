# ADR 0016 — Atestados médicos: documento com CID e regra do INSS

- **Status:** Aceito
- **Data:** 2026-07-20
- **Contexto:** Antes, um "atestado" era apenas uma **falta justificada** com
  motivo `ATESTADO_MEDICO` (via ausência a prazo). Faltavam: registrar o **CID**
  da doença (ou "sem CID"), **identificar** o dia como atestado (e não como
  falta comum) na escala e nas faltas do dia, e acompanhar a **regra do INSS**
  (mesmo CID somando mais de 15 dias em 60 dias → encaminhar ao INSS). O gestor
  precisava de um fluxo próprio de atestado, não só de "justificar uma falta".
- **Decisão:**
  1. **Atestado como entidade própria** (`Atestado`): o documento inteiro
     (período + CID/`semCid` + observação, e `fotoUrl` prevista para o futuro).
     Ao lançar, GERA uma **falta JUSTIFICADA** (motivo `ATESTADO_MEDICO`,
     `aPrazo`) em cada dia corrido do período, vinculada por `atestadoId` e
     carimbada com o `cid` na tabela `ausencias` (convertendo faltas já
     existentes em vez de duplicar). Reaproveita toda a maquinaria de faltas
     (escala, ciclo de folha, score — atestado pesa 2%, ADR 0009).
  2. **CID com autocompletar:** catálogo CID-10 **curado** no backend
     (`cid10.catalogo.ts`), com busca por código ou descrição. O campo aceita
     também um CID digitado livremente; marcar **"sem CID"** é explícito
     (distingue de "não preenchido"). O catálogo pode ser ampliado depois sem
     mudar a interface de busca.
  3. **Regra do INSS (pura e testada):** soma os dias do **mesmo CID** numa
     janela de **60 dias** e avisa a gestão **uma única vez**, no momento em que
     o total cruza **15 dias** (encaminhar ao INSS / auxílio-doença).
  4. **Identificação visual:** o roster do dia ganhou o status **ATESTADO**
     (além de TRABALHA/FOLGA/FALTA) e a lista de faltas expõe `atestado`/`cid`,
     para a escala e as "faltas do dia" mostrarem "Atestado" (não "Falta").
- **Consequências:**
  - ✅ Atestado deixa de ser "uma falta justificada a mais": tem CID, período e
     é identificado como atestado onde importa.
  - ✅ Acompanhamento automático da regra do INSS por CID.
  - ✅ Reaproveita o fluxo de faltas (sem duplicar cálculo de score/escala).
  - ⚠️ **Operacionalmente o atestado descobre o posto** (a pessoa sai do
     expediente); a cobertura da escala segue sendo decisão do gestor.
  - ✅ O status ATESTADO aparece no roster de operadores **e** na escala
     consolidada de fiscais (a linha do fiscal mostra "Atestado" + CID).
  - 🔜 **Foto/anexo do atestado** fica para quando houver storage de objetos
     (S3): o disco do servidor é efêmero.
  - 🔧 O catálogo CID-10 é uma seleção curada dos motivos comuns; o catálogo
     completo do DATASUS pode ser carregado depois.
