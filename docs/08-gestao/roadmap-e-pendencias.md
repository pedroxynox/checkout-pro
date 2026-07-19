> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** prioridades, pendências de infraestrutura, áreas ocultas e dívidas técnicas

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
3. **Banco de dados em plano estável.** O PostgreSQL no plano gratuito do Render
   é um **risco operacional** (pode expirar/ficar indisponível). Migrar para um
   plano **pago/persistente** de baixo custo.
4. **Migrações no Pre-Deploy.** Rodar `prisma migrate deploy` na etapa de
   **Pre-Deploy**, e não no Start Command (para que um advisory lock não impeça o
   servidor de abrir a porta). Ensaiar o procedimento completo de deploy e
   rollback.
5. **Plano de IA (Gemini) para uso multiusuário.** A cota gratuita do Gemini não
   é adequada para concorrência sustentada. Habilitar um **tier pago** antes do
   uso intensivo. Enquanto a Cluby estiver desativada, considerar **remover a
   variável `GEMINI_API_KEY`** do painel do Render para encerrar qualquer custo
   de IA.

---

## P1 — Decisões de produto

6. **Definir o rumo das três áreas ocultas.** Hoje estão escondidas do menu
   (marcadas como "em breve"): **Alertas de Fila**, **Normativas** e **Indicador
   de Quebra**. É preciso decidir, para cada uma, se **conclui** ou **retira**.
   São apenas telas de placeholder (`EmDesenvolvimento`), sem backend; ao
   concluir, remove-se a marca `emBreve` em `mobile/src/navigation/areas.ts` e
   implementa-se a tela real + o serviço.
   - Detalhes por área no Atlas do mobile:
     [Alertas de Fila](../04-atlas-mobile/alertasFila.md) ·
     [Normativas](../04-atlas-mobile/normativas.md) ·
     [Indicador de Quebra](../04-atlas-mobile/quebra.md).
7. **Normativas em escala exigem RAG.** Para as Normativas funcionarem de verdade
   (busca e consulta de documentos/procedimentos), é preciso construir a
   ingestão/**RAG** com **pgvector** e **object storage**. Não reativar o piloto
   codificado à mão como se fosse solução de escala.
8. **Preparar a entrega ao cliente.** Criar um `reset:cliente` + seed mínimo
   (separado do seed de demonstração) e retirar os dados do piloto **antes da
   entrega**.

---

## P2 — Dívidas técnicas e evolução

9. **Concluído — deduplicação persistente dos alertas de TAC.** Antes dependia da
   memória do processo (um reinício ou uma segunda instância podiam reenviar o
   mesmo aviso). Agora a tabela `AlertaTacEnviado` (migração `9zq`) faz reserva
   atômica por índice único `(pessoaId, dia, etapa)`: sobrevive a reinícios e
   coordena múltiplas instâncias.
10. **Concluído (parcial) — formatação Prettier.** Os quatro arquivos históricos
    foram formatados em PR isolado. Fica como dívida menor decidir se
    normalizamos os **9 arquivos de domínio** que o Prettier 3.9.5 aponta por
    deriva de versão (o CI os normaliza no ato via `eslint --fix`, sem quebrar a
    validação).
11. **Multi-tenancy parqueado.** Quando for retomado: introduzir `lojaId`,
    isolamento por linha/RLS e testes de vazamento entre lojas. Feriados por
    localização/unidade dependem disso.

### Dívidas técnicas recorrentes (das seções "Riscos" do Atlas)

Padrões que aparecem em vários módulos e merecem atenção contínua:

- **Serviços grandes (candidatos a fatiar).** Alguns services concentram muitas
  responsabilidades e são candidatos a extrair sub-serviços conforme crescerem —
  por exemplo [`fiscais`](../03-atlas-backend/fiscais.md),
  [`central-jornada`](../03-atlas-backend/central-jornada.md),
  [`ponto`](../03-atlas-backend/ponto.md),
  [`operadores`](../03-atlas-backend/operadores.md),
  [`colaboradores`](../03-atlas-backend/colaboradores.md),
  [`incidencias`](../03-atlas-backend/incidencias.md) e
  [`assistente`](../03-atlas-backend/assistente.md).
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
  [`assistente`](../03-atlas-backend/assistente.md) (montagem de contexto),
  [`usuarios`](../03-atlas-backend/usuarios.md) e
  [`permissoes`](../03-atlas-backend/permissoes.md).
- **Armazenamento de arquivos não durável.** O `LocalDiskStorage` grava em disco
  local, que se perde em hospedagem efêmera; a migração para S3 é o próximo passo
  natural — ver [`storage`](../03-atlas-backend/storage.md).
- **Regras e listas fixas no código.** Feriados nacionais, janelas de checklist e
  preços (ex.: sacola APAE) estão embutidos no código; mudá-los exige deploy — ver
  [`feriados`](../03-atlas-backend/feriados.md),
  [`checklist`](../03-atlas-backend/checklist.md) e
  [`lote-apae`](../03-atlas-backend/lote-apae.md).
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
