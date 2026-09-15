> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-15 · **Cobre:** `backend/src/ferias/`

# Módulo: `ferias`

## 1. Propósito
Férias (e afastamentos programados) de um colaborador como uma **inativação NÃO
rígida**: enquanto o período está vigente, a pessoa some da escala do dia e não
gera falta automática — mas continua `ativo` (não é desligamento).

## 2. Responsabilidades e limites
- **Faz:** cadastra um período de férias `[início, fim]` para um colaborador
  (validando o período e a não-sobreposição com férias já cadastradas); lista as
  férias **em curso e futuras** (todas ou de uma pessoa) com a marca de
  vigência; expõe **quem está de férias num dia** (fonte única de exclusão da
  escala); cancela um período; avisa a equipe ao registrar.
- **Não faz** (fica em outro módulo): a escala em si e a "equipe do dia" (ficam
  em [`fiscais`](fiscais.md), que **consome** este módulo para excluir quem está
  de férias); as faltas/ausência a prazo (ficam em [`operadores`](operadores.md));
  a detecção automática de falta (fica em [`ponto`](ponto.md), que não marca
  falta de quem não está escalado); o desligamento definitivo (`ativo=false` +
  `desligadoEm`, em [`colaboradores`](colaboradores.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `ferias.controller.ts` | Rotas HTTP (registrar/listar/remover) | 77 |
| `ferias.service.ts` | Regras de aplicação: período, sobreposição, duração, avisos | 235 |
| `ferias.domain.ts` | Regras puras: está de férias, sobreposição, validação, duração, encerrada | 117 |
| `ferias.errors.ts` | Erros de domínio (mapeados para HTTP) | 49 |
| `ferias.module.ts` | Ligações (DI); exporta o `FeriasService` | 20 |
| `dto/ferias.dto.ts` | Validação de entrada das rotas | 54 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `ferias`](../05-referencia-dados/api-http.md).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /ferias` | `OPERADORES_CRUD` | Cadastra um período de férias de um colaborador (gestão). |
| `GET /ferias` | `OPERADORES_AUSENCIAS` | Lista as férias **em curso e futuras** (todas ou `?colaboradorId=`), com `vigente` na `?referencia=` (hoje por padrão). `?incluirEncerradas=true` traz também o histórico. |
| `DELETE /ferias/:id` | `OPERADORES_CRUD` | Cancela (remove) um período de férias (gestão). |

## 5. Serviços e funções

### `FeriasService`

#### `registrarFerias(colaboradorId, inicio, fim, dados?, autor?)`
- **Recebe:** a ficha, o intervalo inclusivo e uma observação opcional.
- **Devolve:** `FeriasRegistrada` — o registro criado **mais `dias`** (a duração
  em dias corridos). O valor vem da própria validação do domínio, que antes o
  calculava e descartava, deixando o app sem alternativa a não ser recontar.
- **Efeitos:** valida o período (domínio); confirma que o colaborador existe;
  rejeita sobreposição com férias já cadastradas do mesmo colaborador; cria o
  registro (datas truncadas a 00:00 UTC); avisa todos (best-effort). **Não toca
  em `Colaborador.ativo`.**
- **Erros:** `PeriodoFeriasInvalidoError`, `ColaboradorFeriasNaoEncontradoError`,
  `FeriasSobrepostaError`.

#### `listarFerias({ colaboradorId?, referencia?, incluirEncerradas? })`
Lista as férias **em curso e futuras**, com o nome/matrícula resolvidos e a marca
`vigente` (o período engloba a `referencia`, hoje por padrão). Mais recentes
primeiro.

Cada item traz também `encerrada` (o período já terminou na referência). Junto com
`vigente`, dá os três estados sem o app comparar datas: `vigente` → em curso;
`encerrada` → passada; nenhuma das duas → programada. `encerrada` só pode vir
verdadeira com `incluirEncerradas`, já que sem ele os encerrados não entram.

Períodos **já encerrados** (`fim` anterior à referência) ficam **fora** da lista:
ela é uma ferramenta de operação — "quem está de férias e quem vai entrar" — e
sem esse corte cresceria indefinidamente. O último dia **ainda aparece** (o fim é
inclusivo). O registro **não é apagado**: é ele que faz os dias passados
continuarem aparecendo como férias na escala e nos relatórios. Passe
`incluirEncerradas` para ver o histórico completo (uso administrativo).

#### `colaboradoresDeFeriasNoDia(dia)`
Devolve o `Set<colaboradorId>` de quem tem período vigente no dia (`inicio <= dia
<= fim`). **É a fonte única do dado**, consumida por todos os construtores de
escala (ver §9). Cada consumidor decide o que fazer com ele: a escala de fiscais
e o Quadro de Operadores **removem** a pessoa do dia; a escala publicada e a
grade semanal a **marcam** como férias.

⚠️ A chave é o `Colaborador.id`. Quem compara com outro id (o fiscal bate ponto
com `Fiscal.id`) precisa converter — é por isso que `escaladosDoDia` filtra por
`colaboradorId` e não por `pessoaId`.

#### `removerFerias(id)`
Remove um período (404 `FeriasNaoEncontradaError` se não existir).

## 6. Lógica de domínio (funções puras)
- `estaDeFerias(periodos, dia)` → verdadeiro se algum período engloba o dia.
- `diaDentroDoPeriodo(dia, periodo)` → comparação em dia civil (ignora a hora).
  Delega a `diaDentroDoPeriodo` de [`common/datas`](common.md), fonte única
  partilhada com atestados (a marca `vigente`); aqui fica só a assinatura que
  recebe o período como objeto.
- `periodosSobrepoem(a, b)` → dois períodos compartilham ao menos um dia
  (impede cadastrar férias em cima de férias).
- `validarPeriodoFerias(inicio, fim)` → rejeita intervalo invertido ou longo
  demais (`MAX_DIAS_FERIAS = 366`); devolve os dias corridos quando ok.
- `diasDeFerias(periodo)` → duração em **dias corridos**, contando os dois
  extremos (domingo, feriado e folga contam: são dias de férias como qualquer
  outro). Delega a `contarDiasCorridos` de [`common/datas`](common.md), então
  escrita e leitura usam a mesma conta.
- `feriasEncerrada(periodo, referencia)` → o período já terminou (o `fim` é
  anterior ao dia de referência). É o corte da listagem operacional.
- `inicioDoDiaUtc(data)` → trunca para a meia-noite UTC (rótulo do dia).

## 7. Estados e enums
Sem enums próprios. O "estado" é derivado: um colaborador está **de férias** num
dia quando existe um período `FeriasColaborador` que o engloba — calculado pela
função pura `estaDeFerias`, nunca persistido como flag.

## 8. Dados que o módulo toca
- **Escreve:** `FeriasColaborador` (cria/remove).
- **Lê:** `FeriasColaborador`, `Colaborador` (nome/matrícula e existência).
- **Não persiste a duração:** `dias` é **derivado** de `inicio`/`fim` na leitura,
  sem coluna nem migração. É função pura das datas (que já são gravadas truncadas
  a 00:00 UTC), então não pode divergir, e nada consulta férias por duração — ao
  contrário de `Atestado.dias`, que é persistido porque a regra do INSS o **soma**
  numa janela de 60 dias.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService` (avisos, opcional).
- **É usado por** (todos os consumidores de `colaboradoresDeFeriasNoDia`):
  - [`fiscais`](fiscais.md) — `escaladosDoDia` e a escala consolidada excluem quem
    está de férias; por consequência, a detecção automática de falta
    ([`ponto`](ponto.md)) também não marca falta de quem está de férias, pois ela
    parte dos escalados;
  - [`operadores`](operadores.md) — o Quadro de Operadores (roster do dia, grade
    semanal e tablero ao vivo). **Foi o último a entrar:** por anos este quadro
    montava a sua própria lista sem consultar férias, e mostrava a pessoa como
    "Trabalha" durante o período;
  - [`escala-exportacao`](escala-exportacao.md) — a escala publicada, onde as
    férias viram o status `FERIAS`;
  - [`ponto`](ponto.md) — a revalidação das ocorrências automáticas usa "de
    férias no dia" como motivo para remover uma falta já lançada.

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
6. **A lista mostra só o que ainda importa.** Férias encerradas saem da listagem
   (a tela é operacional, não um arquivo), mas **nada é apagado** — a escala e os
   relatórios dos dias passados continuam corretos.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `ferias.domain.spec.ts` | Está de férias, sobreposição, validação e período encerrado (inclui property-based) | 13 |
| `ferias.service.spec.ts` | Registro, sobreposição, quem está de férias no dia, vigência, corte das encerradas, remoção, a **duração em dias** (ao registrar, ao listar e num único dia) e as marcas `vigente`/`encerrada` (os três estados e o último dia ainda não encerrado) | 14 |
| `../fiscais/escalados-ferias.spec.ts` | `escaladosDoDia` exclui quem está de férias | 2 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ **Férias não passa por nenhum guard de ciclo de folha**, ao contrário de
  atestado e ausência a prazo: não grava uma linha por dia, é um intervalo único
  que a escala **lê**. A consequência é que registrar/cancelar férias retroativas
  muda o que um ciclo já fechado mostra. O app **avisa** quando o período alcança
  um ciclo fechado (sem bloquear); se algum dia isso precisar travar, o guard é
  `exigirCiclosAbertos` de [`ciclo-folha`](ciclo-folha.md).
- ⚠️ A exclusão da escala semanal (tela "Escala") só é aplicada quando há uma
  **data concreta** (`dataISO`); a grade semanal genérica (sem data) não conhece
  férias, pois elas são por dia — a "equipe do dia" e o cron, que operam por
  data, aplicam a exclusão corretamente.
- 🔧 As férias não criam linhas em `Ausencia` (não são falta). Se no futuro o
  RH quiser vê-las no painel de faltas como "férias", será preciso uni-las na
  leitura — hoje são fontes separadas de propósito (ausência esperada ≠ falta).
- ⚠️ **A exclusão não é central: cada construtor de escala precisa lembrar de
  aplicá-la.** A [ADR 0015](../02-arquitetura/decisoes/0015-ferias-inativacao-nao-rigida.md)
  apostou numa "fonte única" (`escaladosDoDia`), mas existem quatro construtores
  de "quem trabalha hoje", e o Quadro de Operadores nunca foi ligado — por anos
  mostrou quem estava de férias como "Trabalha". Já corrigido, mas o risco
  estrutural continua: uma tela nova que monte a sua própria lista repetirá o bug.
- ✅ **Férias atribuídas depois limpam as faltas automáticas daqueles dias.** A
  exclusão de `escaladosDoDia` é *prospectiva* (evita novas faltas), então uma
  falta já lançada antes das férias existirem ficava pendurada na tela. Quem a
  remove é a **revalidação** do Relógio Ponto, que trata "de férias no dia" como
  motivo para a ocorrência automática deixar de ser verdade — ver regra 13 de
  [`ponto`](ponto.md). Vale para o ciclo de folha aberto, o que cobre a
  atribuição retroativa. As faltas **manuais** do gestor não são tocadas.
