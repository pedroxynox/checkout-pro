# ADR 0007 — Incidências de escala em tabela genérica por `tipo`

- **Status:** Aceito
- **Contexto:** Precisamos registrar e analisar eventos de escala por **data**
  (o primeiro é "não retornou do intervalo"), com previsão de novos eventos no
  futuro (ex.: saída antecipada, atraso na volta, etc.). `EscalaEntry` modela a
  plantilla **semanal** (por dia da semana), não eventos datados.
- **Decisão:** Criar **uma única** tabela `IncidenciaEscala` genérica,
  discriminada por um enum `TipoIncidenciaEscala`, em vez de uma tabela por tipo
  de evento. A unicidade é `(colaboradorId, tipo, data)`. O horário **esperado**
  é derivado da escala (`intervaloMin`); para fiscais, o horário **real** pode
  ser detectado do ponto (`RegistroPontoFiscal`). Seguimos o padrão de IDs
  polimórficos sem FK rígida (ver ADR 0005): `colaboradorId` (ficha canônica) e
  `funcionarioId?` (Fiscal, quando aplicável).
- **Consequências:**
  - ✅ Novos tipos de incidência entram apenas adicionando um valor ao enum, sem
    nova tabela nem migração estrutural.
  - ✅ Consultas, ranking e o resumo do perfil ficam uniformes por `tipo`.
  - ✅ Detecção automática (fiscais) reaproveita o log de ponto já existente.
  - ⚠️ Campos específicos de um tipo convivem como colunas opcionais; se um tipo
    futuro exigir muitos campos próprios, reavaliar (tabela satélite/JSON).
