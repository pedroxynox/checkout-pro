# Documento de Requisitos — Cadastro Unificado de Colaboradores

## Introdução

Hoje as pessoas (operadores e fiscais) estão espalhadas em vários lugares do sistema, ligadas por **nome em texto livre**: `Operador`, `OperadorTurno` (escala), `Fiscal`, `Usuario` (login do app) e o campo `nome` de `RegistroArrecadacao`. Isso torna frágil o cruzamento de dados (erros de digitação, acentos, homônimos, mudança de nome) e **impede ter um perfil único** com todo o histórico de cada pessoa.

Este recurso cria uma entidade **canônica de pessoa** — o **Colaborador** — com **matrícula** como identificador de registro, e uma tabela de **identificadores** que mapeia os diferentes códigos usados nos arquivos (`login`/`cod_operador` e `matrícula`) para o mesmo Colaborador. Com isso, todos os movimentos (troco, recargas, cancelamentos, cupons, devoluções), a escala e as faltas passam a ser atribuídos por identificador, habilitando um **perfil completo por colaborador** e um **cadastro/painel de gestão** manual.

Restrição mantida: **apenas fiscais (e gestores) têm acesso ao app** (login). Operadores são cadastrados e têm seus movimentos rastreados, mas **não** acessam o aplicativo.

O sistema é escrito integralmente em Português do Brasil.

## Glossário

- **Colaborador**: Pessoa canônica da operação (operador, fiscal ou gestor). Fonte única de verdade para identidade, escala, faltas e estatísticas.
- **Matrícula**: Identificador de registro único do colaborador. Chave canônica do cadastro.
- **Código de operador (login)**: Código alternativo do operador que aparece nos arquivos de Troco, Recargas e Cancelamento de Itens (`LOGIN_USUARIO`, `LOGIN`, `COD_OPERADOR` — todos o mesmo valor para a mesma pessoa). **Pode ser diferente da matrícula.**
- **Identificador**: Par (tipo, valor) que aponta para um Colaborador. Tipos: `MATRICULA`, `LOGIN`. Permite resolver qualquer arquivo, independentemente de qual código ele traz.
- **Movimento**: Qualquer registro operacional atribuível a uma pessoa: troco solidário, recargas, cancelamento de itens, cancelamento de cupom, devolução, falta, ponto/jornada.
- **Turno do operador**: Classificação de jornada — `ABERTURA`, `INTERMEDIARIO`, `FECHAMENTO` ou `APOIO` (entra antes das 14h e cumpre ~6h de carga). Definido no cadastro.
- **Perfil do colaborador**: Tela com todos os movimentos e estatísticas de uma pessoa, por período.
- **Recargas como ponte**: O arquivo de Recargas traz `LOGIN` **e** `MATRICULA` na mesma linha; ao importá-lo, o sistema aprende automaticamente o vínculo `login ↔ matrícula`.
- **Fila de não reconhecidos**: Lista de movimentos cujo identificador não casou com nenhum colaborador, para revisão manual (sem vincular silenciosamente).

---

## Requisito 1 — Cadastro manual de operador

**História de Usuário:** Como gestor, quero cadastrar operadores um a um, informando todos os seus dados, para ter o registro completo de cada operador e poder atribuir seus movimentos corretamente.

### Critérios de Aceitação

1. O Sistema DEVE permitir cadastrar um operador informando: **nome**, **matrícula**, **código de operador (login)**, **gênero** (para avatar), **turno** (ABERTURA, INTERMEDIARIO, FECHAMENTO ou APOIO), **horários** de entrada/saída Seg–Qui e Sex–Sáb, e **dia de folga** semanal.
2. O Sistema DEVE exigir **matrícula única**; ao tentar cadastrar matrícula já existente, DEVE rejeitar com mensagem clara.
3. O Sistema DEVE permitir que o **código de operador (login)** seja informado e DEVE rejeitar se o mesmo login já estiver vinculado a outro colaborador.
4. QUANDO o operador for cadastrado, O Sistema DEVE criar o Colaborador (funcao = OPERADOR) e seus identificadores (`MATRICULA` e, se informado, `LOGIN`).
5. O Sistema NÃO DEVE criar login/acesso ao app para operadores (apenas fiscais/gestores têm acesso).
6. O campo **login** PODE ficar vazio no cadastro; nesse caso o vínculo `login ↔ matrícula` poderá ser aprendido depois pelo arquivo de Recargas.

## Requisito 2 — Painel de gestão e edição do colaborador

**História de Usuário:** Como gestor, quero um painel para consultar e alterar a qualquer momento os dados de um operador, para manter o cadastro correto ao longo do tempo.

### Critérios de Aceitação

1. O Sistema DEVE exibir uma seção chamada **Colaboradores** com a lista de TODOS os colaboradores cadastrados (operadores e fiscais), com busca por nome ou matrícula e filtro por função/turno/ativo. Tocar em um colaborador abre o seu **perfil** (Requisito 5).
2. O Sistema DEVE permitir **editar** todos os dados cadastrais de um colaborador (nome, login, turno, horários, folga, gênero).
3. QUANDO a matrícula ou o login forem alterados, O Sistema DEVE manter a unicidade e atualizar os identificadores correspondentes.
4. O Sistema DEVE permitir **inativar** um colaborador (preservando o histórico de movimentos) e **reativar**.
5. As ações de cadastro/edição/inativação DEVEM exigir a funcionalidade de gestão de operadores (perfil gestor), reaproveitando a autorização existente.

## Requisito 3 — Identificadores e resolução de movimentos

**História de Usuário:** Como sistema, preciso resolver cada movimento ao colaborador certo independentemente de qual código o arquivo traz, para que as estatísticas sejam confiáveis.

### Critérios de Aceitação

1. O Sistema DEVE manter, por colaborador, um conjunto de identificadores do tipo `MATRICULA` e `LOGIN`.
2. QUANDO um movimento trouxer **matrícula**, O Sistema DEVE resolver o colaborador pela matrícula.
3. QUANDO um movimento trouxer apenas **código de operador (login)**, O Sistema DEVE resolver o colaborador pelo identificador `LOGIN`.
4. QUANDO o arquivo de Recargas trouxer `LOGIN` e `MATRICULA` juntos, O Sistema DEVE registrar/confirmar o vínculo `login ↔ matrícula` no colaborador correspondente (ponte automática).
5. QUANDO nenhum identificador casar, O Sistema NÃO DEVE vincular silenciosamente; DEVE registrar o movimento e adicioná-lo à **fila de não reconhecidos** para revisão.
6. O Sistema DEVE permitir, na revisão, **associar** um movimento não reconhecido a um colaborador existente (criando o identificador correspondente) ou criar um novo colaborador a partir dele.

## Requisito 4 — Atribuição dos movimentos por arquivo

**História de Usuário:** Como gestor, quero que cada arquivo atribua corretamente operador e fiscal, para refletir a realidade de quem fez o quê.

### Critérios de Aceitação

1. QUANDO um arquivo de **Troco Solidário** é importado, O Sistema DEVE atribuir cada linha ao **operador** pelo código de operador (`LOGIN_USUARIO`).
2. QUANDO um arquivo de **Recargas de Celular** é importado, O Sistema DEVE atribuir cada linha ao **operador** pela **matrícula** e usar o `LOGIN` para manter a ponte `login ↔ matrícula`.
3. QUANDO um arquivo de **Cancelamento de Itens** é importado, O Sistema DEVE atribuir cada linha ao **operador** pelo código de operador (`COD_OPERADOR`), preservando a **quantidade de itens**.
4. QUANDO um arquivo de **Cancelamento de Cupom** é importado, O Sistema DEVE atribuir o cancelamento ao **operador** pela `MATRICULA_OPERADOR` e registrar o **fiscal que autorizou** pela `MATRICULA_USO_AUTORIZACAO`, preservando o **motivo**.
5. QUANDO um arquivo de **Devoluções** é importado, O Sistema DEVE atribuir cada linha ao **fiscal** que lançou, pela matrícula contida em `USUARIO_LANÇAMENTO`.
6. O Sistema DEVE preservar o **nome bruto** e o **código bruto** lidos do arquivo em cada movimento, para auditoria, mesmo após a vinculação.

## Requisito 5 — Perfil completo do colaborador

**História de Usuário:** Como gestor, quero abrir o perfil de um operador e ver todos os seus movimentos e estatísticas, para acompanhar seu desempenho de ponta a ponta.

### Critérios de Aceitação

1. O Sistema DEVE exibir, no perfil de um **operador**, por período selecionável: troco solidário (total), recargas (total), cancelamento de itens (total e quantidade), cancelamento de cupom (total e motivos) — com **comparação à meta** quando aplicável.
2. O Sistema DEVE exibir, no perfil, o **histórico de faltas** (com a analítica inteligente existente: taxa, padrão, tendência, risco) e a **escala** do colaborador.
3. O Sistema DEVE exibir, no perfil de um **fiscal**, suas estatísticas próprias: **cupons autorizados** e **devoluções lançadas** (quantidade e valor), além de jornada/ponto já existentes.
4. O Sistema DEVE permitir abrir o perfil a partir da seção **Colaboradores** e a partir dos rankings de indicadores.
5. O perfil DEVE usar exclusivamente movimentos **vinculados por identificador** (não por comparação de nome).
6. Cada indicador DEVE aparecer SEMPRE no perfil, exibindo **0** quando não houver movimento no período (nunca ocultar um indicador por estar zerado).
7. O perfil DEVE incluir o **controle de faltas** com **gráficos inteligentes**: faltas por mês (tendência) e por dia da semana (padrão), além do nível de risco (semáforo) e da taxa de absenteísmo.
8. Os indicadores e as faltas DEVEM ser apresentados com **gráficos**, reutilizando os componentes existentes (`GraficoBarrasVerticais`, `GraficoPizza`), sem novas dependências.

## Requisito 6 — Fiscais no cadastro unificado

**História de Usuário:** Como gestor, quero que os fiscais também façam parte do cadastro unificado, mantendo seu acesso ao app, para tratar toda a equipe de forma consistente.

### Critérios de Aceitação

1. O Sistema DEVE representar fiscais como Colaborador (funcao = FISCAL) com **matrícula** própria.
2. O Sistema DEVE manter o vínculo do fiscal com seu `Usuario` (login do app) quando existir, sem alterar a regra de que **apenas fiscais/gestores acessam o app**.
3. O Sistema DEVE reconhecer o fiscal nas devoluções e nas autorizações de cupom pela sua **matrícula** — que é **a mesma matrícula** usada para cadastrá-lo como Colaborador (confirmado).

## Requisito 7 — Migração e compatibilidade

**História de Usuário:** Como responsável pelo sistema, quero migrar sem perder dados nem quebrar o que já funciona, para que a transição seja segura.

### Critérios de Aceitação

1. O Sistema DEVE criar os colaboradores a partir dos dados existentes (`OperadorTurno`, `Operador`, `Fiscal`) na migração, sem exigir recadastro manual do que já existe.
2. O Sistema DEVE manter os campos e telas atuais funcionando durante a transição (compatibilidade retroativa), migrando as referências por nome para `colaboradorId` de forma incremental.
3. O Sistema DEVE recalcular/religar os movimentos históricos de `RegistroArrecadacao` aos colaboradores por identificador quando possível, deixando os não resolvidos na fila de revisão.
4. NENHUMA rota, navegação ou regra de negócio existente DEVE ser quebrada pela introdução do cadastro unificado.
