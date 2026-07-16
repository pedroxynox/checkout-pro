# Requirements Document

## Introduction

Esta funcionalidade permite colocar o Check-out PRO "em zero" para começar a operar a partir de uma data inicial definida (padrão **01/07/2026**). Ela reúne dois recursos complementares:

1. **Reinício operacional limpo (zerar dados de movimento):** uma operação administrativa que apaga todos os dados transacionais/operacionais (vendas, arrecadação, movimentos de estoque, sacolas APAE, jornada/escala por data, notificações, checklists, dados de fluxos legados), **conservando** as pessoas (logins, colaboradores, operadores, fiscais), as escalas de cadastro, as definições de insumos e a configuração/metas.
2. **Data inicial do sistema:** uma configuração global (singleton) que define a data a partir da qual é permitido cadastrar/editar registros e a partir da qual os calendários da aplicação começam. Registros com data anterior à data inicial são rejeitados.

O reinício é disparado por um endpoint + botão de administrador restrito ao perfil `ADMINISTRADOR`, com confirmação explícita na interface, e é executado de forma idempotente e transacional (tudo ou nada), reportando um resumo de quantos registros foram apagados por entidade.

**Restrição operacional importante:** o apagamento real em produção é executado pelo próprio usuário (gestor) através do botão já publicado no app. O time de desenvolvimento constrói e testa a função **sem acesso ao banco de dados produtivo** — a entrega é a função pronta, testada e publicada, não a execução do apagamento em produção.

## Glossary

- **Sistema:** A aplicação Check-out PRO (backend NestJS + Prisma/PostgreSQL e app móvel Expo).
- **Modulo_ResetOperacional:** O componente de backend responsável por executar o reinício operacional (zerar dados de movimento), seguindo o padrão controller → service → domain.
- **Modulo_DataInicial:** O componente de backend responsável por armazenar, ler e validar a Data_Inicial_Sistema.
- **Data_Inicial_Sistema:** Configuração global singleton que define a data a partir da qual registros podem ser cadastrados/editados e a partir da qual os calendários começam. Valor padrão: **2026-07-01**. Editável pelo gestor sem redeploy.
- **Dados_de_Movimento:** Registros transacionais/operacionais que devem ser apagados no reinício (ver Requisito 2).
- **Dados_de_Cadastro:** Registros de pessoas, escalas de cadastro, definições de insumos e configuração/metas que devem ser conservados no reinício (ver Requisito 3).
- **Resumo_de_Reinicio:** Estrutura retornada pela operação de reinício contendo a contagem de registros apagados por entidade.
- **ErroDominio:** Classe base dos erros de domínio do projeto; cada erro declara o próprio `statusHttp` (padrão 400).
- **ErroDataAnteriorInicial:** Erro de domínio (extends `ErroDominio`) lançado quando um registro com data anterior à Data_Inicial_Sistema é submetido; responde 400/422.
- **ADMINISTRADOR:** Perfil de acesso total do sistema, único autorizado a executar o reinício operacional e a editar a Data_Inicial_Sistema.
- **ADMIN_DADOS:** Funcionalidade da allowlist (`acessos.domain.ts`) que controla o acesso às operações administrativas de dados, restrita ao `ADMINISTRADOR` via `@Funcionalidade('ADMIN_DADOS')` + `PerfilGuard`.

## Requirements

### Requirement 1 — Disparo do reinício operacional (autorização e confirmação)

**User Story:** Como ADMINISTRADOR, quero disparar o reinício operacional por um endpoint protegido acionado por um botão com confirmação, para que os dados de movimento sejam apagados apenas de forma intencional e autorizada.

#### Acceptance Criteria

1. O Modulo_ResetOperacional DEVE expor um endpoint de reinício protegido pela funcionalidade `ADMIN_DADOS` por meio de `@Funcionalidade('ADMIN_DADOS')` combinado com `PerfilGuard`.
2. QUANDO uma requisição de reinício é recebida de um usuário com perfil `ADMINISTRADOR`, O Modulo_ResetOperacional DEVE executar o reinício operacional.
3. SE uma requisição de reinício é recebida de um usuário sem a funcionalidade `ADMIN_DADOS`, ENTÃO O Modulo_ResetOperacional DEVE recusar a operação com um erro de domínio de status 403 e NÃO apagar nenhum registro.
4. SE uma requisição de reinício é recebida sem o marcador de confirmação explícita exigido, ENTÃO O Modulo_ResetOperacional DEVE recusar a operação com um erro de domínio de status 400 e NÃO apagar nenhum registro.
5. QUANDO o gestor aciona o botão de reinício na interface, O Sistema DEVE exigir uma confirmação explícita antes de enviar a requisição ao endpoint.

### Requirement 2 — Escopo dos dados a apagar (Dados_de_Movimento)

**User Story:** Como gestor, quero que o reinício apague exatamente os dados de movimento definidos, para que o sistema fique zerado sem perder cadastros e configuração.

#### Acceptance Criteria

1. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE apagar todos os registros de vendas das entidades `vendas_diarias` e `vendas_hora`.
2. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE apagar todos os registros de arrecadação das entidades `registros_arrecadacao` e `arrecadacao_sem_movimento`.
3. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE apagar todos os registros das entidades `movimentos_estoque`, `requisicoes` e `sugestoes_pedido`, e DEVE definir `insumos.saldo = 0` para todos os insumos.
4. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE apagar todos os registros das entidades `movimentos_lote_apae` e `lotes_apae`.
5. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE apagar todos os registros de jornada e escala por data das entidades `registros_ponto_fiscal`, `ausencias` e `incidencias_escala`.
6. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE apagar todos os registros das entidades `notificacoes`, `mensagens_assistente`, `fechamentos_concluidos` e `checklists`.
7. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE apagar todos os registros das entidades de fluxo legado `registros_operacionais` e `registros_importacao`.

### Requirement 3 — Escopo dos dados a conservar (Dados_de_Cadastro)

**User Story:** Como gestor, quero que o reinício conserve pessoas, escalas de cadastro, definições de insumos e configuração, para que eu não precise recadastrar nada ao começar do zero.

#### Acceptance Criteria

1. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE conservar todos os registros das entidades de pessoas `usuarios`, `colaboradores`, `colaborador_identificadores`, `operadores` e `fiscais`.
2. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE conservar todos os registros das entidades de escala de cadastro `escala_entries` e `operador_turnos`.
3. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE conservar todos os registros das definições de insumos nas entidades `insumos`, `fardos` e `pedidos_recorrentes`, alterando apenas o campo `saldo` de `insumos` conforme o Requisito 2.3.
4. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE conservar todos os registros das entidades de configuração e metas `config_apae`, `config_vendas`, `metas_indicador` e `metas_mensais`.
5. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE conservar o registro da Data_Inicial_Sistema.

### Requirement 4 — Idempotência, transacionalidade e resumo

**User Story:** Como ADMINISTRADOR, quero que o reinício seja atômico, repetível e informe o que apagou, para que eu tenha certeza do estado final e do efeito da operação.

#### Acceptance Criteria

1. QUANDO o reinício operacional é executado, O Modulo_ResetOperacional DEVE executar todas as remoções e o zeramento de saldo dentro de uma única transação de banco de dados.
2. SE ocorre um erro durante o reinício operacional, ENTÃO O Modulo_ResetOperacional DEVE reverter todas as alterações e retornar um erro de domínio, deixando os dados no estado anterior à operação.
3. QUANDO o reinício operacional é executado uma segunda vez consecutiva sobre um sistema já zerado, O Modulo_ResetOperacional DEVE concluir sem erro e produzir um estado idêntico ao do primeiro reinício.
4. QUANDO o reinício operacional conclui com sucesso, O Modulo_ResetOperacional DEVE retornar um Resumo_de_Reinicio contendo a contagem de registros apagados para cada entidade listada no Requisito 2.

### Requirement 5 — Configuração da data inicial do sistema

**User Story:** Como gestor, quero definir e editar a data inicial do sistema, para que a operação comece em uma data específica sem depender de redeploy.

#### Acceptance Criteria

1. ENQUANTO nenhum valor tiver sido definido pelo gestor, O Modulo_DataInicial DEVE retornar a Data_Inicial_Sistema padrão igual a 2026-07-01.
2. O Modulo_DataInicial DEVE armazenar a Data_Inicial_Sistema como uma configuração global singleton, seguindo o padrão dos modelos de configuração existentes (`config_apae`, `config_vendas`).
3. QUANDO um usuário com a funcionalidade `ADMIN_DADOS` submete uma nova Data_Inicial_Sistema válida, O Modulo_DataInicial DEVE persistir o novo valor e registrar quem o atualizou.
4. SE um usuário sem a funcionalidade `ADMIN_DADOS` tenta editar a Data_Inicial_Sistema, ENTÃO O Modulo_DataInicial DEVE recusar a operação com um erro de domínio de status 403.
5. QUANDO a Data_Inicial_Sistema é solicitada por qualquer parte autorizada do Sistema, O Modulo_DataInicial DEVE retornar o valor vigente.

### Requirement 6 — Validação de data mínima nos endpoints de carga/edição

**User Story:** Como gestor, quero que o sistema recuse registros com data anterior à data inicial, para que não existam dados fora do período de operação válido.

#### Acceptance Criteria

1. SE um endpoint de carga ou edição recebe um registro cuja data é anterior à Data_Inicial_Sistema, ENTÃO O Sistema DEVE recusar a operação lançando `ErroDataAnteriorInicial` (extends `ErroDominio`) com status 400 ou 422 e NÃO persistir o registro.
2. QUANDO um endpoint de carga ou edição recebe um registro cuja data é igual ou posterior à Data_Inicial_Sistema, O Sistema DEVE aceitar a data como válida para prosseguir com o processamento.
3. O Sistema DEVE aplicar a validação de data mínima nos endpoints de upload de arrecadação, upload de vendas, ausências, incidências de escala, ponto de fiscal e checklist.
4. QUANDO `ErroDataAnteriorInicial` é lançado, O Sistema DEVE retornar uma mensagem em português indicando a data mínima permitida.

### Requirement 7 — Data mínima nos calendários do app móvel

**User Story:** Como usuário do app, quero que os seletores de data não permitam escolher datas anteriores à data inicial, para que eu não tente cadastrar dados inválidos.

#### Acceptance Criteria

1. ONDE um seletor de data (date picker) é exibido no app móvel para carga ou edição de registros, O Sistema DEVE definir a data mínima selecionável igual à Data_Inicial_Sistema.
2. QUANDO o app móvel carrega a Data_Inicial_Sistema, O Sistema DEVE utilizá-la como limite inferior dos calendários de carga/edição.

### Requirement 8 — Restrições de arquitetura e entrega (não funcionais)

**User Story:** Como responsável técnico, quero que a funcionalidade siga os padrões do projeto, para que permaneça manutenível, segura e verificável.

#### Acceptance Criteria

1. O Modulo_ResetOperacional e o Modulo_DataInicial DEVEM seguir o padrão controller → service → domain, com DTOs validados por class-validator.
2. O Sistema DEVE definir a permissão do reinício e da edição da data inicial exclusivamente pela funcionalidade `ADMIN_DADOS` na fonte única `acessos.domain.ts`.
3. ONDE o schema do banco precisar de alteração para a Data_Inicial_Sistema, O Sistema DEVE utilizar apenas migrações aditivas, sem migrações destrutivas.
4. O Sistema DEVE validar a lógica de domínio pura (a validação "data ≥ data inicial" e a lista de entidades a limpar) por meio de testes de propriedade com fast-check executando no mínimo 100 iterações.
5. O reinício operacional DEVE ser uma operação de dados em tempo de execução autorizada e confirmada, e NÃO uma migração destrutiva de schema.

### Requirement 9 — Restrição operacional de execução em produção

**User Story:** Como gestor, quero executar eu mesmo o apagamento em produção pelo botão do app, para que o time de desenvolvimento não precise de acesso ao banco de dados produtivo.

#### Acceptance Criteria

1. O Sistema DEVE permitir que o gestor execute o reinício operacional em produção por meio do botão já publicado no app, sem exigir acesso ao banco de dados produtivo pelo time de desenvolvimento.
2. O time de desenvolvimento DEVE entregar a função de reinício construída, testada e publicada (branch a partir de `main` → PR → CI verde), sem executar o apagamento no banco de dados produtivo.
