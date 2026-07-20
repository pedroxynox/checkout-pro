> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `backend/src/ferias/`

# Módulo: `ferias`

## 1. Propósito
Férias (e afastamentos programados) de um colaborador como uma **inativação NÃO
rígida**: enquanto o período está vigente, a pessoa some da escala do dia e não
gera falta automática — mas continua `ativo` (não é desligamento).

## 2. Responsabilidades e limites
- **Faz:** cadastra um período de férias `[início, fim]` para um colaborador
  (validando o período e a não-sobreposição com férias já cadastradas); lista as
  férias (todas ou de uma pessoa) com a marca de vigência; expõe **quem está de
  férias num dia** (fonte única de exclusão da escala); cancela um período;
  avisa a equipe ao registrar.
- **Não faz** (fica em outro módulo): a escala em si e a "equipe do dia" (ficam
  em [`fiscais`](fiscais.md), que **consome** este módulo para excluir quem está
  de férias); as faltas/ausência a prazo (ficam em [`operadores`](operadores.md));
  a detecção automática de falta (fica em [`ponto`](ponto.md), que não marca
  falta de quem não está escalado); o desligamento definitivo (`ativo=false` +
  `desligadoEm`, em [`colaboradores`](colaboradores.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `ferias.controller.ts` | Rotas HTTP (registrar/listar/remover) | 69 |
| `ferias.service.ts` | Regras de aplicação: período, sobreposição, avisos | 195 |
| `ferias.domain.ts` | Regras puras: está de férias, sobreposição, validação | 87 |
| `ferias.errors.ts` | Erros de domínio (mapeados para HTTP) | 49 |
| `ferias.module.ts` | Ligações (DI); exporta o `FeriasService` | 20 |
| `dto/ferias.dto.ts` | Validação de entrada das rotas | 43 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `ferias`](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /ferias` | `OPERADORES_CRUD` | Cadastra um período de férias de um colaborador (gestão). |
| `GET /ferias` | `OPERADORES_AUSENCIAS` | Lista as férias (todas ou `?colaboradorId=`), com `vigente` na `?referencia=` (hoje por padrão). |
| `DELETE /ferias/:id` | `OPERADORES_CRUD` | Cancela (remove) um período de férias (gestão). |

## 5. Serviços e funções

### `FeriasService`

#### `registrarFerias(colaboradorId, inicio, fim, dados?, autor?)`
- **Recebe:** a ficha, o intervalo inclusivo e uma observação opcional.
- **Devolve:** a `FeriasColaborador` criada.
- **Efeitos:** valida o período (domínio); confirma que o colaborador existe;
  rejeita sobreposição com férias já cadastradas do mesmo colaborador; cria o
  registro (datas truncadas a 00:00 UTC); avisa todos (best-effort). **Não toca
  em `Colaborador.ativo`.**
- **Erros:** `PeriodoFeriasInvalidoError`, `ColaboradorFeriasNaoEncontradoError`,
  `FeriasSobrepostaError`.

#### `listarFerias({ colaboradorId?, referencia? })`
Lista as férias (todas ou de um colaborador), com o nome/matrícula resolvidos e
a marca `vigente` (o período engloba a `referencia`, hoje por padrão). Mais
recentes primeiro.

#### `colaboradoresDeFeriasNoDia(dia)`
Devolve o `Set<colaboradorId>` de quem tem período vigente no dia (`inicio <= dia
<= fim`). **É a fonte única de exclusão** consumida por
`FiscaisService.escaladosDoDia` e pela escala consolidada.

#### `removerFerias(id)`
Remove um período (404 `FeriasNaoEncontradaError` se não existir).

## 6. Lógica de domínio (funções puras)
- `estaDeFerias(periodos, dia)` → verdadeiro se algum período engloba o dia.
- `diaDentroDoPeriodo(dia, periodo)` → comparação em dia civil (ignora a hora).
- `periodosSobrepoem(a, b)` → dois períodos compartilham ao menos um dia
  (impede cadastrar férias em cima de férias).
- `validarPeriodoFerias(inicio, fim)` → rejeita intervalo invertido ou longo
  demais (`MAX_DIAS_FERIAS = 366`); devolve os dias corridos quando ok.
- `inicioDoDiaUtc(data)` → trunca para a meia-noite UTC (rótulo do dia).

## 7. Estados e enums
Sem enums próprios. O "estado" é derivado: um colaborador está **de férias** num
dia quando existe um período `FeriasColaborador` que o engloba — calculado pela
função pura `estaDeFerias`, nunca persistido como flag.

## 8. Dados que o módulo toca
- **Escreve:** `FeriasColaborador` (cria/remove).
- **Lê:** `FeriasColaborador`, `Colaborador` (nome/matrícula e existência).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` (avisos, opcional).
- **É usado por:** [`fiscais`](fiscais.md) — `escaladosDoDia` e a escala
  consolidada excluem quem está de férias; por consequência, a detecção
  automática de falta ([`ponto`](ponto.md)) também não marca falta de quem está
  de férias, pois ela parte dos escalados.

## 10. Regras de negócio-chave
1. **Inativação NÃO rígida:** férias não alteram `ativo` nem geram falta; apenas
   removem a pessoa da escala do período (some da "equipe do dia" e da detecção
   automática).
2. **Período inclusivo** em ambos os extremos, rotulado em meia-noite UTC.
3. **Sem sobreposição:** um colaborador não pode ter dois períodos que se
   cruzam (evita duplicidade/ambiguidade).
4. **Só a gestão registra/cancela** (`OPERADORES_CRUD`); a leitura é liberada a
   quem vê a escala (`OPERADORES_AUSENCIAS`).
5. **Avisos são best-effort:** nunca impedem o registro.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `ferias.domain.spec.ts` | Está de férias, sobreposição e validação (inclui property-based) | 9 |
| `ferias.service.spec.ts` | Registro, sobreposição, quem está de férias no dia, vigência e remoção | 7 |
| `../fiscais/escalados-ferias.spec.ts` | `escaladosDoDia` exclui quem está de férias | 2 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ A exclusão da escala semanal (tela "Escala") só é aplicada quando há uma
  **data concreta** (`dataISO`); a grade semanal genérica (sem data) não conhece
  férias, pois elas são por dia — a "equipe do dia" e o cron, que operam por
  data, aplicam a exclusão corretamente.
- 🔧 As férias não criam linhas em `Ausencia` (não são falta). Se no futuro o
  RH quiser vê-las no painel de faltas como "férias", será preciso uni-las na
  leitura — hoje são fontes separadas de propósito (ausência esperada ≠ falta).
