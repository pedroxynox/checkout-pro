> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/contratos/`

# Módulo: `contratos`

## 1. Propósito
Contratos de experiência (45 + 45 dias) dos operadores: deriva o estado do
contrato (experiência/efetivado/encerrado) de forma determinística a partir da
data de admissão e das decisões, alimenta os cards e o resumo da carteira, e
avisa os gestores quando um contrato está prestes a vencer.

## 2. Responsabilidades e limites
- **Faz:** define/atualiza a data de admissão; registra decisões de marco
  (aprovar/reprovar); **deriva** o estado e a urgência (nunca grava estado
  redundante); monta os cards, o resumo da carteira e a seção "Tempo de casa"
  do perfil; avalia e envia (cron diário) os alertas de vencimento e de decisão
  em atraso.
- **Não faz** (fica em outro módulo): cadastro do colaborador em si
  (fica em [`colaboradores`](colaboradores.md)); o envio técnico das
  notificações (fica em `notificacoes`); o encerramento operacional do
  colaborador ("excluir do quadro", em [`colaboradores`](colaboradores.md));
  os contratos de **jornada** data-driven (fica em [`tipos-contrato`](tipos-contrato.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `contratos.controller.ts` | Rotas HTTP (listar, resumo, detalhe, admissão, decisão) | 99 |
| `contratos.service.ts` | Regras de aplicação: Prisma + delega a decisão ao domínio | 407 |
| `contratos.domain.ts` | Regras puras: deriva estado, urgência, alerta e carteira | 342 |
| `contratos.errors.ts` | Erros de domínio (mapeados para HTTP) | 60 |
| `contratos.module.ts` | Ligações (DI) do módulo | 22 |
| `contratos-alertas.service.ts` | Cron diário (08:00 BRT) de alertas aos gestores | 105 |
| `dto/contratos.dto.ts` | Validação de entrada das rotas | 55 |

## 4. Endpoints (rotas HTTP)
> A lista canônica está na [API HTTP → `contratos`](../05-referencia-dados/api-http.md#contratos). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /contratos` | `CONTRATOS_VISUALIZAR` | Lista os cards de contrato dos operadores (busca/etiqueta/incluirSemAdmissao). |
| `GET /contratos/resumo` | `CONTRATOS_VISUALIZAR` | Contagens agregadas para o topo da seção. |
| `GET /contratos/:colaboradorId` | `CONTRATOS_VISUALIZAR` | Resumo do contrato de um colaborador (tempo de casa). |
| `PATCH /contratos/:colaboradorId/admissao` | `CONTRATOS_GERIR` | Define/atualiza a data de admissão. |
| `POST /contratos/:colaboradorId/decisao` | `CONTRATOS_GERIR` | Registra (ou regrava) a decisão de um marco. |

## 5. Serviços e funções

### `ContratosService`

#### `listar(filtros, hoje?)`
- **Recebe:** filtros (busca, etiqueta, incluirSemAdmissao) e a data de
  referência.
- **Devolve:** `ContratoCard[]` ordenados por urgência, marco mais próximo e nome.
- **Efeitos:** lê operadores ativos + decisões e deriva cada card via
  `derivarResumoContrato`.

#### `resumo(hoje?)`
Reconstrói os resumos a partir dos cards e agrega a carteira (`resumirCarteira`).

#### `definirAdmissao(colaboradorId, dataAdmissaoISO)`
- **Efeitos:** valida a data e o colaborador; grava `dataAdmissao`. **Não** aplica
  o guard de Data_Inicial_Sistema (admissões históricas são legítimas).
- **Erros:** `DadosContratoInvalidosError`, `ColaboradorContratoNaoEncontradoError`.

#### `registrarDecisao(colaboradorId, marco, resultado, autor, observacao?)`
- **Efeitos:** exige admissão e transição válida; `upsert` idempotente por
  (colaborador, marco) com auditoria.
- **Erros:** `ColaboradorContratoNaoEncontradoError`, `AdmissaoNaoDefinidaError`,
  `DecisaoMarcoInvalidaError`.

#### `resumoDoColaborador(colaboradorId, hoje?)`
Monta a seção "Tempo de casa" do perfil (informativa; não afeta o score).

#### `avaliarAlertasDoDia(hoje?)`
Avalia os alertas de todos os operadores com admissão definida (consumido pelo
cron; não envia nada por si).

### `ContratosAlertasService.verificarContratos()` (cron 08:00 BRT)
Avalia os alertas do dia e notifica os gestores (`CONTRATOS_VISUALIZAR`), com um
`Set` de anti-duplicação resetado à meia-noite. `NotificacoesService` é opcional
(ausente em testes).

## 6. Lógica de domínio (funções puras)
- `derivarResumoContrato(entrada, hoje)` → função central: a partir de admissão
  + decisões, deriva estado, etiqueta, marcos, próximo marco, dias e flags.
- `avaliarAlerta(resumo)` → `VENCIMENTO` (≤ 5 dias) ou `DECISAO_ATRASO` (com
  prioridade), ou `null`.
- `classificarUrgencia(resumo)` → semáforo `INATIVO`/`OK`/`ATENCAO`/`CRITICO`.
- `podeDecidirMarco(marco, decisoes)` → o marco de 90 só após aprovar o de 45;
  nada após uma reprovação.
- `resumirCarteira(resumos)` → contagens agregadas.
- Auxiliares de data: `diffEmDias`, `adicionarDias`, `calcularDiasDeCasa`.

## 7. Estados e enums
- `EstadoContrato`: `SEM_ADMISSAO` · `EXPERIENCIA` · `EFETIVADO` · `ENCERRADO`.
  Transições (automáticas, derivadas):
  - `SEM_ADMISSAO → EXPERIENCIA` ao definir a admissão;
  - `EXPERIENCIA → EFETIVADO` a partir do dia 91 (ou aprovação explícita do 90);
  - `EXPERIENCIA/… → ENCERRADO` por reprovação explícita (casos históricos).
- `MarcoContrato`: `MARCO_45` · `MARCO_90`. `ResultadoDecisao`: `APROVADO` ·
  `REPROVADO`.
- `UrgenciaContrato`: `INATIVO` · `OK` · `ATENCAO` · `CRITICO`.

## 8. Dados que o módulo toca
- **Escreve:** `Colaborador.dataAdmissao`, `DecisaoContrato` (upsert com autor).
- **Lê:** `Colaborador` (operadores ativos), `DecisaoContrato`.
- O estado do contrato **não é persistido** — sempre derivado (ver ADR 0008).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`; `NotificacoesService` (opcional, para o cron);
  `primeiroNome` de `fiscais.domain`.
- **É usado por:** o app (seção Contratos), o perfil do colaborador
  ([`colaboradores`](colaboradores.md), que reusa o serviço) e o cron de alertas.

## 10. Regras de negócio-chave
1. **Estado sempre derivado** de admissão + decisões — nunca gravado (fonte
   única de verdade).
2. **Ciclo automático**: o marco de 45 é aprovado por decurso; a efetivação
   acontece sozinha no dia 91 — sem decisão manual obrigatória.
3. **Aviso de vencimento**: nos 5 dias antes de completar 90 dias, um alerta
   por dia; "decisão em atraso" tem prioridade sobre o vencimento.
4. **Reprovação explícita encerra** o contrato (mantida via API para casos
   históricos).
5. **Decisão condicionada**: o marco de 90 só após aprovar o de 45; nada após
   reprovação (`podeDecidirMarco`).
6. **Admissão histórica é permitida** (sem guard de data inicial do sistema).
7. **Escopo = operadores** (o contrato de experiência aplica-se à frente de caixa).

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `contratos.service.spec.ts` | `definirAdmissao`, `registrarDecisao` e derivação dos cards | 10 |
| `contratos.properties.spec.ts` | Propriedades do ciclo automático (property-based) | 10 |
| `contratos-alertas.service.spec.ts` | Cron de alertas e montagem das mensagens | 5 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Nome ambíguo:** este módulo trata do **contrato de experiência**;
  o catálogo de **contratos de jornada** (regras data-driven) fica em
  [`tipos-contrato`](tipos-contrato.md). Não confundir.
- 🔧 `resumo()` recalcula todos os cards para depois reagregar; poderia reusar os
  `ResumoContrato` já derivados em vez de reconstruí-los.
- 🔧 O campo `marcoEmAtraso` continua no modelo, mas o ciclo hoje é automático
  (nunca gera atraso em EXPERIÊNCIA); mantido para compatibilidade dos alertas.
