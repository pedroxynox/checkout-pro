# ADR 0008 — Contratos de experiência: estado derivado + tabela de decisões

- **Status:** Aceito
- **Contexto:** A seção **Contratos** acompanha o contrato de experiência
  brasileiro (máx. 90 dias = 45 + 45) dos **operadores**: tempo de casa, marcos
  de 45/90 dias, alertas de vencimento e a decisão de aprovar/reprovar em cada
  marco. Precisávamos decidir onde e como guardar esse ciclo de vida sem
  contaminar o cadastro nem introduzir estado redundante (fonte de bugs de
  sincronização).
- **Decisão:**
  1. **`dataAdmissao` (opcional) em `Colaborador`** é a fonte única do **tempo**:
     dias de casa e marcos (admissão + 45 / + 90) são derivados dela. Aditivo;
     fichas antigas ficam sem data até o gestor preenchê-la. **Não** se aplica o
     guard de `Data_Inicial_Sistema` a esse campo — admissões **históricas**
     (anteriores ao início do sistema) são legítimas.
  2. As **decisões** (aprovar/reprovar 45/90) **não** se derivam de uma data;
     são dados novos e vão para uma tabela dedicada **`DecisaoContrato`**
     (`colaboradorId`, `marco`, `resultado`, auditoria de quem/quando), única
     por `(colaboradorId, marco)` — regravar atualiza a linha (upsert). Segue o
     padrão de IDs polimórficos sem FK rígida (ADR 0005).
  3. O **estado** do contrato (SEM_ADMISSAO / EXPERIÊNCIA / EFETIVADO /
     ENCERRADO) é **sempre derivado** de `dataAdmissao` + decisões, por funções
     **puras** (`contratos.domain`), testadas por propriedade (fast-check).
     Nunca é persistido.
  4. **Regras** (aprovadas com o gestor):
     - Reprovar em qualquer marco → **ENCERRADO** (ação sempre explícita; nunca
       reprova sozinho).
     - Passar de 90 dias sem reprovação → **EFETIVADO por decurso de prazo**
       (lei brasileira), mas segue sinalizando "decisão em atraso" até a decisão
       do marco de 90 ser registrada. O mesmo vale para o marco de 45 vencido
       sem decisão (permanece em EXPERIÊNCIA + "decisão em atraso").
     - O marco de 90 só pode ser decidido após o de 45 ser **APROVADO**.
  5. **Alertas** por **cron diário** (08:00 BRT), avisando os gestores quando um
     marco está a ≤ 5 dias de vencer ou já venceu sem decisão. Como roda uma vez
     por dia, o contador 5→0 emerge naturalmente; um `Set` em memória (resetado
     à meia-noite) é a rede de segurança contra reenvio — **não** é o padrão
     `count === limite` do umbral de incidências (aquele é dirigido por evento).
  6. O perfil do colaborador ganha a seção **"Tempo de casa"**, puramente
     **informativa**: **não** afeta o Score de Saúde.
- **Por que não reusar a tabela genérica de incidências (ADR 0007):** a
  `IncidenciaEscala` modela eventos de escala por data (não-retorno etc.); as
  decisões de contrato têm semântica e colunas próprias (marco, resultado,
  auditoria) e um ciclo de vida distinto. Uma tabela dedicada mantém cada
  domínio coeso. A regra "sem tabelas novas" do roadmap era para **evoluir o
  módulo de incidências com novos tipos**, não uma proibição global.
- **Autorização:** duas funcionalidades novas na fonte única
  (`acessos.domain.ts`, espelhada no app): `CONTRATOS_VISUALIZAR` (gerente,
  gerente-desenvolvedor e supervisor) e `CONTRATOS_GERIR` (gerente e
  gerente-desenvolvedor). Definir a admissão também é possível pelo cadastro de
  operadores (`OPERADORES_CRUD`).
- **Consequências:**
  - ✅ Fonte de verdade única; estado sempre consistente (derivado), sem risco
    de dessincronização.
  - ✅ Toda a matemática é pura e testável por propriedade; migração aditiva.
  - ✅ Reaproveita cron + notificações a gestores já existentes.
  - ✅ Novas fases/regras futuras entram no domínio puro sem tabela nova.
  - ⚠️ Uma tabela nova (`decisoes_contrato`) — justificada por ser um domínio
    distinto; avaliar consolidação só se surgirem outros "eventos de contrato".
