# ADR 0010 — Novos tipos de incidência de escala (atraso, saída antecipada, retorno tardio, advertência)

- **Status:** Aceito
- **Contexto:** As incidências de escala (ADR 0007) nasceram com um único
  evento — **não retorno do intervalo**. Na operação surgem outros eventos
  disciplinares recorrentes que o gestor quer registrar e acompanhar por pessoa:
  **atraso** (chegou tarde), **saída antecipada** (saiu antes), **retorno
  tardio** (voltou tarde do intervalo, mas voltou) e **advertência** (registro
  disciplinar formal). O modelo já é genérico por `tipo`, então não faz sentido
  criar tabelas por evento.
- **Decisão:**
  1. **Somar valores ao enum** `TipoIncidenciaEscala` (`ATRASO`,
     `SAIDA_ANTECIPADA`, `RETORNO_TARDIO`, `ADVERTENCIA`) via migração **aditiva**
     (`9za_incidencia_tipos`, `ALTER TYPE ... ADD VALUE IF NOT EXISTS`). Sem
     tabelas nem colunas novas. A unicidade `(colaboradorId, tipo, data)` permite
     **um de cada tipo por dia** por pessoa.
  2. **Metadados por tipo** numa fonte única de domínio (`META_TIPO_INCIDENCIA`):
     `rotulo` (pt-BR), `penalizaDisciplina`, `autoDetectavel` e `usaHorarios`. O
     mobile espelha o mesmo mapa. A analítica do perfil (partição `porTipo`,
     linha do tempo, risco) já itera **todos** os tipos, então generaliza sem
     mudança de lógica.
  3. **Auto-detecção só do não-retorno.** Apenas `NAO_RETORNO_INTERVALO` é
     derivável do ponto dos fiscais (`autoDetectavel=true`); os demais são
     **lançamentos manuais** (a UI abre um seletor de tipo). A advertência não
     usa horários (`usaHorarios=false`).
  4. **Impacto no score (Disciplina).** **Todos** os tipos são disciplinares hoje
     (`penalizaDisciplina=true`). O perfil passa a penalizar a Disciplina pela
     **soma ponderada de TODAS as incidências disciplinares** do período
     (`contarIncidenciasPonderadas` sobre `TIPOS_DISCIPLINARES`), não só o
     não-retorno. Cada incidência pesa igual (constante `PENAL_POR_INCIDENCIA`);
     justificar reduz o peso conforme o motivo (reusa ADR 0009 — atestado 2%,
     outros 10%). A contagem crua segue no histórico.
  5. **Justificativa e ranking uniformes.** Justificar/reabrir e o ranking valem
     para qualquer tipo; o ranking aceita um `tipo` opcional para **comparar um
     evento específico** entre pessoas.
- **Consequências:**
  - ✅ Novos eventos entram só somando ao enum + espelho, sem migração estrutural
    (confirma a aposta do ADR 0007).
  - ✅ Visão disciplinar mais completa por pessoa (perfil com desglose por tipo)
    e comparação por evento (ranking por tipo).
  - ✅ Aditivo e retrocompatível: dados existentes seguem como
    `NAO_RETORNO_INTERVALO`; quem não lança os novos tipos não vê mudança.
  - ⚠️ O peso é **igual por tipo** (uma advertência pesa como um atraso). Se no
    futuro quisermos calibrar por gravidade (ex.: advertência mais pesada), o
    ponto único é `META_TIPO_INCIDENCIA` + a penalidade da Disciplina — sem tocar
    o esquema.
  - ⚠️ Tipos com campos muito próprios continuam limitados a colunas opcionais
    (mesma ressalva do ADR 0007).
