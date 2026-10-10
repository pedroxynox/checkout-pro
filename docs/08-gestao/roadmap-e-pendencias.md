> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-10-10 · **Cobre:** prioridades, pendências de infraestrutura, áreas ocultas e dívidas técnicas

# Roadmap e pendências

Este documento reúne as **prioridades e pendências conhecidas** do Check-out PRO.
Ele consolida e **traduz para o português** as fontes de handoff originalmente
escritas em espanhol (o snapshot canônico do projeto, o resumo da última rodada
de trabalho e o steering de estado) e cruza essas informações com as seções
"Riscos, dívidas e pendências" do Atlas.

> **Números do projeto** (testes, tabelas, rotas) não são repetidos aqui: veja a
> fonte única [Estado e métricas](estado-e-metricas.md). O histórico do que já
> foi entregue está em [Histórico de mudanças](historico-de-mudancas.md).

---

## Princípios que orientam as prioridades

- **Objetivo atual:** ter **uma loja 100% operacional e estável** antes de
  escalar para várias lojas.
- **Multi-tenancy não é prioridade** agora — permanece parqueado.
- **Merge, deploy e configuração externa são estados diferentes.** Um código
  mesclado na `main` não significa que já está no ar; confirme sempre por logs e
  pelo endpoint `/health/ready`.

---

## P0 — Bloqueiam a operação/entrega estável

Prioridade máxima; a maioria é de **infraestrutura e configuração**, não de
defeito de produto.

1. **Notificações push no Android (Firebase/FCM).** O backend já envia push real
   pelo Expo Push Service e guarda os tokens. Para o aviso chegar com o app
   **fechado** no Android, falta vincular as credenciais **FCM** ao projeto
   Expo/EAS e **recompilar e publicar um novo APK**.
2. **Validar o OCR/ML Kit com comprovantes reais.** O leitor do comprovante do
   ponto no aparelho (ML Kit) precisa ser testado em um **Android real**, com
   fotos verdadeiras, e o interpretador (parser) ajustado com amostras reais.
3. **Ensaiar deploy e rollback.** As migrações já rodam no **Pre-Deploy**
   (`preDeployCommand: npx prisma migrate deploy` no `render.yaml`) e o Start
   Command abre o servidor direto (`node dist/main.js`). Falta **ensaiar** o
   procedimento completo, incluindo o rollback de uma migração.

> **Concluídos e retirados desta lista:** o PostgreSQL saiu do plano gratuito para
> o `basic-256mb` persistente e o serviço web para o `starter`, que não hiberna
> (jul/2026, [ADR 0013](../02-arquitetura/decisoes/0013-infra-paga-e-pool-de-conexoes.md));
> e o item do plano pago do Gemini deixou de existir — a assistente de IA (Cluby)
> foi **removida do produto** em out/2026, junto com a variável `GEMINI_API_KEY`.

---

## P1 — Decisões de produto

4. **Definir o rumo das três áreas ocultas.** Hoje estão escondidas do menu
   (marcadas como "em breve"): **Alertas de Fila**, **Normativas** e **Indicador
   de Quebra**. É preciso decidir, para cada uma, se **conclui** ou **retira**.
   São apenas telas de placeholder (`EmDesenvolvimento`), sem backend; ao
   concluir, remove-se a marca `emBreve` em `mobile/src/navigation/areas.ts` e
   implementa-se a tela real + o serviço.
   - Detalhes por área no Atlas do mobile:
     [Alertas de Fila](../04-atlas-mobile/alertasFila.md) ·
     [Normativas](../04-atlas-mobile/normativas.md) ·
     [Indicador de Quebra](../04-atlas-mobile/quebra.md).
5. **Normativas sem IA.** O produto não usa mais inteligência artificial (a
   Cluby foi removida), então a ideia antiga de busca por IA (RAG/pgvector) saiu de
   cena. Se as Normativas forem concluídas, o caminho é uma **biblioteca de
   documentos** com busca comum por título/palavra e arquivos num **storage de
   objetos**.
6. **Preparar a entrega ao cliente.** Criar um `reset:cliente` + seed mínimo
   (separado do seed de demonstração) e retirar os dados do piloto **antes da
   entrega**.

---

## P2 — Dívidas técnicas e evolução

7. **Concluído — deduplicação persistente dos alertas de TAC.** Antes dependia da
   memória do processo (um reinício ou uma segunda instância podiam reenviar o
   mesmo aviso). Agora a tabela `AlertaTacEnviado` (migração `9zq`) faz reserva
   atômica por índice único `(pessoaId, dia, etapa)`: sobrevive a reinícios e
   coordena múltiplas instâncias.
8. **Concluído (parcial) — formatação Prettier.** Os quatro arquivos históricos
    foram formatados em PR isolado. Fica como dívida menor decidir se
    normalizamos os **9 arquivos de domínio** que o Prettier 3.9.5 aponta por
    deriva de versão (o CI os normaliza no ato via `eslint --fix`, sem quebrar a
    validação).
9. **Multi-tenancy parqueado.** Quando for retomado: introduzir `lojaId`,
    isolamento por linha/RLS e testes de vazamento entre lojas. Feriados por
    localização/unidade dependem disso.

### Horário e escala: etapa 3 (ADR 0026)

**Etapas 1 e 2 concluídas.** O horário exibido e o horário **cobrado** são os da
ficha; a regra conservadora "vale a hora mais tardia" e o arquivo
`hora-esperada-fiscal.ts` deixaram de existir. A troca foi autorizada pela
**Conferência de escala** rodada em produção: 7 de 11 fiscais tinham a cópia semanal
de 40 minutos a 1 hora mais tardia que a ficha, e era por isso que o atraso real
delas não aparecia. Ver
[ADR 0026](../02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md).

Ficou para a **etapa 3** — retirar a tabela `EscalaEntry`. Nada lê mais um horário
dela, mas ela guarda duas coisas sem outro lugar, e **as duas precisam ser resolvidas
antes**:

1. **Dar um lar a `intervaloMin`.** É a duração do intervalo do turno, e a ficha não
   tem esse campo. Usam-na as sugestões de "não retornou do intervalo"
   ([`incidencias`](../03-atlas-backend/incidencias.md), dois pontos de leitura).
   Candidatos: um campo na ficha, ou o tipo de contrato de jornada — que é onde a
   duração da jornada já mora.
2. **Dar um lar ao vínculo `Fiscal → Colaborador`.** O `colaboradorId` gravado na
   cópia é hoje o único jeito de reconhecer a ficha de um fiscal que teve a conta de
   acesso desvinculada. Sem ele essa pessoa desaparece da escala — e, se estiver
   **desligada**, escapa do filtro que tira os desligados do quadro. Isto se resolve
   junto com o épico de aposentar o modelo `Fiscal`.
3. **Cortar o passo da ficha omissa na regra de folga** (`FolgaService`). É a última
   decisão que ainda depende da cópia: quando a ficha não tem dia de folga, a cópia
   pode afirmar o descanso (ADR 0023). Cortar antes de as fichas estarem completas
   escalaria essas pessoas sete dias por semana. A Conferência de escala aponta
   quais são (`semFolgaNaFicha`); o pré-requisito é essa lista estar vazia.
4. **Só então apagar a tabela** e a coluna `especial` (hoje sempre `false`), e com
   elas `gerarEscalaSemanalFiscal`, `sincronizarEscalaFiscal` e a própria Conferência
   de escala na parte que compara com a cópia.
5. **Se o negócio precisar de horário pontual ou convocação**, construir como
   recurso de primeira classe: com **data de validade**, com **tela para ver e
   desfazer**, e vinculado à ficha. O mecanismo antigo não tinha nenhuma das três
   coisas, e foi por isso que virou um horário fantasma.

> **O item que morreu.** "A escala semanal derivada ignora o horário de domingo da
> ficha" saiu da lista: só fazia sentido enquanto a cópia decidisse horário. O
> domingo dos fiscais vem do rodízio G1/G2/G3 aplicado à ficha, e uma tabela por dia
> da semana nunca poderia representá-lo.

### Dívidas técnicas recorrentes (das seções "Riscos" do Atlas)

Padrões que aparecem em vários módulos e merecem atenção contínua:

- **Serviços grandes (candidatos a fatiar).** Alguns services concentram muitas
  responsabilidades e são candidatos a extrair sub-serviços conforme crescerem —
  por exemplo [`fiscais`](../03-atlas-backend/fiscais.md),
  [`central-jornada`](../03-atlas-backend/central-jornada.md),
  [`ponto`](../03-atlas-backend/ponto.md),
  [`operadores`](../03-atlas-backend/operadores.md),
  [`colaboradores`](../03-atlas-backend/colaboradores.md) e
  [`incidencias`](../03-atlas-backend/incidencias.md).
- **Fuso de Brasília fixo (UTC−3).** Vários módulos assumem o offset fixo (correto
  desde o fim do horário de verão em 2019, mas quebraria se ele voltasse) — ver
  [`common`](../03-atlas-backend/common.md), [`ponto`](../03-atlas-backend/ponto.md),
  [`fiscais`](../03-atlas-backend/fiscais.md) e
  [`checklist`](../03-atlas-backend/checklist.md).
- **Estado em memória por instância.** Controles como "já saudado" / anti-
  duplicação de avisos usam `Set` em memória, que não coordena múltiplas
  instâncias — ver [`alertas`](../03-atlas-backend/alertas.md) e
  [`feedforward`](../03-atlas-backend/feedforward.md).
- **Cobertura de teste ausente em alguns pontos.** Sem specs dedicados, por
  exemplo, em [`storage`](../03-atlas-backend/storage.md) (I/O do disco local),
  [`usuarios`](../03-atlas-backend/usuarios.md) e
  [`permissoes`](../03-atlas-backend/permissoes.md).
- **Armazenamento de arquivos não durável.** O `LocalDiskStorage` grava em disco
  local, que se perde em hospedagem efêmera; a migração para S3 é o próximo passo
  natural — ver [`storage`](../03-atlas-backend/storage.md).
- **Regras e listas fixas no código.** Feriados nacionais e janelas de checklist
  estão embutidos no código; mudá-los exige deploy — ver
  [`feriados`](../03-atlas-backend/feriados.md) e
  [`checklist`](../03-atlas-backend/checklist.md).
- **Modelos legados em transição.** `Operador`/`OperadorTurno`/`Fiscal` convivem
  com o Cadastro Unificado durante a migração — ver
  [ADR 0004](../02-arquitetura/decisoes/0004-cadastro-unificado-e-escala-opcao-a.md),
  [`operadores`](../03-atlas-backend/operadores.md) e
  [`fiscais`](../03-atlas-backend/fiscais.md). A remoção total da tabela fiscal
  legada (`RegistroPontoFiscal`) segue como follow-up.

---

## Regras críticas que não devem mudar sem decisão de produto

Estas regras foram acordadas com o dono do produto; alterá-las exige decisão
explícita (e releitura dos domínios-fonte):

- **Ponto/TAC:** extras `>=1h30` = risco; `>=1h40` = risco alto; TAC por extras só
  `>1h50`. Intervalo `<1h` ou `>3h` também gera TAC. Domingo/feriado: carga 7h20 e
  extras 100%; seg–qui 7h, sex–sáb 8h. Avisos apenas para `SUPERVISOR`, `GERENTE`
  e `ADMINISTRADOR`; envio best-effort (nunca bloqueia a batida).
- **Central de Jornada:** ciclo **26→25**; contrato `SEIS_X_UM_DOIS_X_UM`; inclui
  operador, supervisor e fiscal; saldo = extras 50 + extras 100 − horas devidas.
- **Feriados/contratos:** nacionais automáticos; estaduais/municipais manuais;
  Carnaval e Corpus Christi **não** automáticos. O contrato de experiência aplica
  a operadores ativos: até 90 dias, alerta nos 5 dias anteriores e efetivação
  automática no dia 91.

---

## Fontes deste documento

Consolidado e traduzido a partir de:

- [`docs/_legado/PROJECT_UNDERSTANDING.es.md`](../_legado/PROJECT_UNDERSTANDING.es.md) — snapshot canônico (espanhol).
- [`docs/_legado/RESUMEN_Y_PROXIMOS_PASOS.es.md`](../_legado/RESUMEN_Y_PROXIMOS_PASOS.es.md) — resumo da rodada de trabalho (espanhol).
- [`.kiro/steering/estado-e-pendientes.md`](../../.kiro/steering/estado-e-pendientes.md) — handoff operacional (espanhol).
- Seções "Riscos, dívidas e pendências" do [Atlas do backend](../03-atlas-backend/) e do [Atlas do mobile](../04-atlas-mobile/).
