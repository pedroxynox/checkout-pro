> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/checklist/`

# Módulo: `checklist`

## 1. Propósito
Checklists diários de abertura e fechamento comprovados por foto (na prática, o
print do checklist feito no app externo), com janelas fixas de execução,
controle de pontualidade, métricas de cumprimento, histórico e detecção de foto
repetida (anti-fraude).

## 2. Responsabilidades e limites
- **Faz:** disponibiliza o checklist do dia; recebe o upload da imagem (valida e
  grava no object storage) e marca "FEITO" com pontualidade; expõe status,
  janelas fixas, estado rico (auditoria/pontualidade), métricas do mês,
  histórico (N dias e mês) e a regra de alerta; detecta foto repetida e notifica
  a equipe/gestores.
- **Não faz** (fica em outro módulo): a validação da data mínima em si (delega ao
  `ValidacaoDataService` de [`data-inicial`](data-inicial.md)); o armazenamento
  do arquivo (fica no `storage`/object storage); o envio efetivo das
  notificações (fica em `notificacoes`); o disparo agendado dos alertas (crons,
  que apenas consomem `verificarAlerta`/`verificarLembreteInicio`).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `checklist.controller.ts` | Rotas HTTP (garantir, imagem, estado, métricas, histórico) | 163 |
| `checklist.service.ts` | Regras de aplicação: envio, estado, métricas, histórico | 583 |
| `checklist.domain.ts` | Regras puras: imagem, janelas, status visual, alerta | 240 |
| `checklist.errors.ts` | Erros de domínio (não-imagem, dia passado) | 46 |
| `checklist.module.ts` | Ligações (DI) do módulo | 22 |
| `dto/checklist.dto.ts` | Validação de entrada (tipo, data) | 17 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `checklist`](../05-referencia-dados/api-http.md#checklist). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /checklist/:tipo` | `CHECKLIST` | Disponibiliza (cria se ausente) o checklist do dia. |
| `POST /checklist/:tipo/imagem` | `CHECKLIST` | Envia a imagem, valida, grava e marca "FEITO" com pontualidade. |
| `GET /checklist/estado` | `CHECKLIST` | Estado rico dos dois checklists do dia (auditoria/pontualidade). |
| `GET /checklist/metricas` | `CHECKLIST` | Métricas de cumprimento do mês (% no prazo, racha). |
| `GET /checklist/historico` | `CHECKLIST` | Histórico dos últimos N dias (padrão 14). |
| `GET /checklist/historico-mes` | `CHECKLIST` | Histórico do mês da data informada (calendário). |
| `GET /checklist/:tipo/status` | `CHECKLIST` | Status simples do checklist do dia (`PENDENTE`/`FEITO`). |
| `GET /checklist/:tipo/janela` | `CHECKLIST` | Janela fixa de execução do tipo (em texto `HH:mm`). |

> Toda a classe `ChecklistController` exige `CHECKLIST`. As rotas `status` e
> `janela` (com `:tipo`) constam no código mas podem não aparecer na lista
> canônica se esta contar só as principais; a fonte de verdade é a
> [API HTTP](../05-referencia-dados/api-http.md#checklist).

## 5. Serviços e funções

### `ChecklistService`

#### `garantirChecklistDoDia(tipo, data)`
Valida a data mínima (via `ValidacaoDataService`), normaliza para o início do
dia e cria o checklist `PENDENTE` se ainda não existir (chave `tipo_data`).

#### `enviarImagem(tipo, data, arquivo, usuarioId, enviadoEm?)`
- **Efeitos:** rejeita não-imagem (`ArquivoNaoImagemError`) e data mínima;
  bloqueia dia já passado (`ChecklistDiaPassadoError`); calcula a pontualidade
  (dentro da janela do tipo, no mesmo dia); faz `upsert` marcando `FEITO`,
  gravando URL/hash da imagem, `noPrazo`, autor e horário; dispara (best-effort)
  o aviso de foto repetida e o aviso de checklist concluído (sucesso/atraso).
- **Erros:** `ArquivoNaoImagemError`, `ChecklistDiaPassadoError`,
  `ErroDataAnteriorInicial` (via validação de data).

#### `status(tipo, data)` · `janela(tipo)`
Status simples do dia (`PENDENTE` se não existir); e a janela fixa do tipo.

#### `estado(data)`
Estado rico dos dois checklists: status visual (pontual/atrasado/pendente/não
feito), janela em texto, quem/quando enviou, imagem, pontualidade e se a foto é
repetida (hash presente em mais de um checklist).

#### `metricas(data)`
Métricas do mês da data: dias de operação (Seg–Sáb até hoje), total esperado
(2/dia), feitos, no prazo, % no prazo e a **racha** de dias recentes com abertura
e fechamento no prazo.

#### `historico(dias = 14)` · `historicoMes(data)`
Histórico por dia (últimos N dias ou o mês civil), montando abertura+fechamento
por dia com status visual; dias futuros do mês corrente saem `PENDENTE`.

#### `verificarAlerta(tipo, agora)` · `verificarLembreteInicio(tipo, agora)`
Delegam a `deveAlertar`/`deveLembrarInicio` — usados pelos crons para decidir o
disparo do alerta de pendência (15 min antes do limite) e do lembrete de início.

#### Funções privadas
- `avisarChecklistEnviado(...)` / `avisarFotoRepetida(...)` — notificações
  best-effort.
- `resolverNomeDe(...)` / `montarDiaHistorico(...)` — auxiliares do histórico.
- Auxiliares de tempo: `agoraBrasilia()`, `minutosRelativos(...)` (fuso
  `America/Sao_Paulo`).

## 6. Lógica de domínio (funções puras)
- `ehImagem(arquivo)` → allowlist fechada de MIME/extensão (recusa
  `image/svg+xml` para evitar XSS).
- `extensaoImagemSegura(arquivo)` → extensão canônica **segura** derivada do tipo
  validado (nunca confia no nome do cliente).
- `janela(tipo)` / `janelaTexto(tipo)` / `dentroDaJanela(tipo, minutos)` →
  janelas fixas 08:15–09:15 (abertura) e 13:15–14:15 (fechamento).
- `minutosDoDia(instante)` → minutos desde a meia-noite (UTC).
- `derivarStatusVisual(status, noPrazo, minutosAgora, tipo)` →
  `FEITO_NO_PRAZO`/`ATRASADO`/`NAO_FEITO`/`PENDENTE`.
- `statusChecklist(imagemValida)` / `aplicarEnvio(statusAtual, arquivo)` →
  "FEITO" ⇔ imagem válida.
- `deveAlertar(tipo, minutos, status)` → alerta 15 min antes do limite
  (09:00/14:00) se pendente.
- `deveLembrarInicio(tipo, minutos, status)` → lembrete 5 min antes da janela
  (08:10/13:10) se pendente.

## 7. Estados e enums
- `TipoChecklist`: `ABERTURA` · `FECHAMENTO`.
- `StatusChecklist` (persistido): `PENDENTE` · `FEITO`.
- `StatusVisual` (derivado): `FEITO_NO_PRAZO` · `ATRASADO` · `PENDENTE` ·
  `NAO_FEITO`.

## 8. Dados que o módulo toca
- **Escreve:** `Checklist` (status, imagem, hash, pontualidade, autor).
- **Lê:** `Checklist`, `Usuario` (nome de quem enviou), `ConfigSistema`
  (indiretamente, via validação de data).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` (opcional),
  `ValidacaoDataService` de [`data-inicial`](data-inicial.md), object storage
  (`OBJECT_STORAGE`), `common/datas` e `common/upload-options`.
- **É usado por:** o app (telas de checklist, calendário, métricas) e os cron
  jobs de alerta/lembrete.

## 10. Regras de negócio-chave
1. **"FEITO" só com imagem válida** (allowlist de imagem rasterizada; SVG é
   recusado por segurança).
2. **Extensão de gravação é segura**, derivada do tipo validado — nunca reutiliza
   o nome do cliente.
3. **Pontualidade** por janela fixa: abertura 08:15–09:15, fechamento
   13:15–14:15; fora da janela conta como atraso.
4. **Não se preenche dia passado** (`ChecklistDiaPassadoError`).
5. **Data ≥ Data_Inicial_Sistema** é exigida antes de gravar.
6. **Anti-fraude**: foto com hash repetido gera aviso aos gestores.
7. **Notificações são best-effort**: nunca quebram o envio da imagem.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `checklist.service.spec.ts` | Janelas, "FEITO", dia passado, não-imagem, alerta, aviso sucesso/atraso | 8 |
| `checklist.controller.spec.ts` | Upload/armazenamento, rejeições, delegação do histórico-mês | 5 |
| `checklist.properties.spec.ts` | Propriedades: status por imagem, envio, extensão segura, alerta | 5 |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `checklist.service.ts` (583 linhas) concentra envio, estado, métricas e
  histórico; candidato a extrair um serviço de leitura/relatórios.
- ⚠️ As janelas e horários de alerta são **fixos no código** (`checklist.domain.ts`);
  mudança de horário exige deploy (não é configurável).
- ⚠️ A pontualidade depende do fuso `America/Sao_Paulo` calculado via
  `Intl.DateTimeFormat`; ambientes sem os dados de fuso podem divergir.
