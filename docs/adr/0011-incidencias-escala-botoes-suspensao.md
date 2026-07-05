# ADR 0011 — Marcação de ocorrências: botões na Escala + suspensão no perfil

- **Status:** Aceito (revisa parte do ADR 0010)
- **Contexto:** O ADR 0010 abriu 5 tipos de incidência com um seletor genérico
  tanto na Escala quanto no perfil, e o não-retorno era lançado por horário. Na
  operação real, o gestor quer marcar **falta** e **não-retorno** com **um
  toque** direto no colaborador da Escala (sem horário), e reservar o perfil
  para os atos disciplinares (**advertência** e **suspensão**). Os tipos
  intermediários (atraso, saída antecipada, retorno tardio) não são usados na
  prática.
- **Decisão:**
  1. **Escala — dois botões por colaborador:** **Falta** (registra a *ausência*
     de hoje via `POST /operadores/ausencias`) e **Sem retorno** (registra um
     `NAO_RETORNO_INTERVALO` de hoje, **sem horário**). Removidos da Escala o
     cartão de sugestões auto-detectadas e o modal de registro.
  2. **Não-retorno sem horário e só-leitura no perfil:** `usaHorarios=false` e
     `registro='ESCALA'`. No perfil do colaborador ele **apenas aparece** na
     linha do tempo (não é registrado nem editado ali).
  3. **Novo tipo `SUSPENSAO`** (migração aditiva `9zb_incidencia_suspensao`,
     `ALTER TYPE ... ADD VALUE`), `registro='PERFIL'` como a advertência. O
     registro no perfil fica **limitado** a advertência + suspensão
     (`TIPOS_PERFIL`), ambos sem horário.
  4. **Atraso, saída antecipada e retorno tardio viram legado:**
     `registro=null` — continuam no enum/domínio (dados/histórico e analítica),
     mas **não são mais oferecidos** para registro em nenhuma tela. Os valores
     do enum **não são removidos** (a convenção é migração aditiva; remover
     valor de enum no PostgreSQL exige recriação destrutiva do tipo). Podem ser
     reofertados no futuro apenas mudando `registro`.
  5. **Score inalterado na mecânica:** suspensão é disciplinar
     (`penalizaDisciplina`) e entra na soma ponderada
     (`contarIncidenciasPonderadas`); justificar segue reduzindo o peso (ADR
     0009). O local de registro (`registro`) é só de UX e não afeta o cálculo.
- **Consequências:**
  - ✅ Marcação mais rápida e alinhada ao fluxo real (um toque na Escala).
  - ✅ Perfil focado nos atos disciplinares (advertência/suspensão), com o
     não-retorno visível mas imutável ali.
  - ✅ Aditivo e retrocompatível: nada é apagado; incidências antigas seguem
     aparecendo e pesando no score.
  - ⚠️ Atraso/saída antecipada/retorno tardio ficam como valores de enum
     **ociosos** (legado), não removíveis sem migração destrutiva.
  - ⚠️ A auto-detecção do não-retorno pelo ponto deixa de ser exibida no app (o
     endpoint `/escala/incidencias/sugestoes` continua existindo); a marcação
     passa a ser manual pelo botão **Sem retorno**.
