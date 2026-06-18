# Documento de Requisitos

## Introdução

O **Aplicativo de Gestão de Frente de Caixa** é um aplicativo móvel destinado ao gerente e aos fiscais de frente de caixa do supermercado **Stok Center**, um supermercado de grande porte. O objetivo é automatizar e centralizar a gestão da operação da frente de caixa, abrangendo o controle de importações de dados diários, o acompanhamento de indicadores e metas (KPIs), o controle de insumos, o monitoramento de fiscais em tempo real com escala de trabalho, os checklists de abertura e fechamento, o cadastro de operadores com controle de ausências e a gestão de acessos e perfis.

A operação conta com 38 PDVs (Pontos de Venda), dos quais 10 a 25 ficam abertos por turno conforme o dia e o movimento. A equipe é composta por operadores de caixa (manhã, intermediário e fechamento), fiscais com horários fixos (abertura, intermediário e fechamento) e gerentes. Os dados operacionais são originados de dois sistemas de PDV (AcruxPDV e Consinco) e importados diariamente por meio de arquivos, de forma manual, sem integração em tempo real.

O aplicativo é escrito integralmente em Português (Português do Brasil), pois é destinado à operação de um supermercado brasileiro. Este documento organiza os requisitos em 7 módulos funcionais, além dos requisitos de acessos e perfis.

## Glossário

- **Frente de Caixa**: Área do supermercado onde estão localizados os caixas (PDVs) e onde ocorre o atendimento final ao cliente, incluindo registro de produtos e pagamento.
- **PDV (Ponto de Venda)**: Caixa físico onde os produtos são registrados e os pagamentos processados. O supermercado possui 38 PDVs no total.
- **Operador**: Funcionário responsável por operar um PDV, registrando produtos e recebendo pagamentos. Classificado por turno: manhã, intermediário ou fechamento.
- **Fiscal**: Funcionário responsável por supervisionar a frente de caixa, autorizar operações e atender ocorrências. Possui horário fixo e é classificado por turno: abertura, intermediário ou fechamento.
- **Gerente**: Funcionário responsável pela gestão geral da frente de caixa, com acesso completo ao aplicativo.
- **Turno**: Período de trabalho. Para operadores: manhã, intermediário e fechamento. Para fiscais: abertura, intermediário e fechamento. Para operadores, o turno é determinado pelo horário de entrada da escala: abertura (entrada antes das 10:00), intermediário (entrada das 10:00 às 12:59) e fechamento (entrada a partir das 13:00).
- **Escala**: Planejamento de horários de trabalho de operadores, fiscais e gerentes, considerando dia da semana, intervalos variáveis e folga semanal.
- **Cancelamento de Itens**: Indicador que mede o valor de itens cancelados durante o registro nos PDVs, expresso como percentual sobre as vendas.
- **Troco Solidário**: Valor arrecadado a partir do arredondamento ou doação espontânea de troco pelos clientes, atribuído ao operador.
- **Recargas de Celular**: Valor de recargas de telefonia móvel vendidas nos PDVs, atribuído ao operador.
- **Devoluções**: Indicador que mede o valor de devoluções de produtos, autorizadas por fiscais, expresso como percentual sobre as vendas.
- **Sacolas APAE**: Sacolas comercializadas em benefício da APAE, controladas por lote recebido, com cálculo de quantidade vendida e percentual vendido sobre o lote inicial.
- **APAE**: Associação de Pais e Amigos dos Excepcionais, entidade beneficiada pela venda das sacolas.
- **Painel de Vendas**: Funcionalidade onde o valor das vendas diárias é informado e acumulado por dia, semana e mês, servindo de base para o cálculo dos indicadores percentuais.
- **Meta**: Valor-alvo definido para um indicador, usado para classificar o desempenho atual (verde/amarelo/vermelho).
- **Insumo**: Material de consumo da frente de caixa, como sacolas, bobinas e panos.
- **Fardo**: Pacote (bundle) de sacolas identificado por código de barras, unidade de controle de estoque das sacolas.
- **Bobina**: Rolo de papel térmico utilizado nos PDVs para impressão de cupons.
- **Pano**: Material de limpeza utilizado na frente de caixa.
- **Checklist de Abertura**: Lista de verificação executada na abertura da operação, com janela de execução entre 08:15 e 09:15.
- **Checklist de Fechamento**: Lista de verificação executada no fechamento da operação, com janela de execução entre 13:15 e 14:15.
- **Ausência**: Registro de não comparecimento de um operador ou fiscal em determinado dia.
- **Importação**: Processo manual de upload de arquivos diários contendo dados operacionais oriundos dos sistemas de PDV.
- **AcruxPDV**: Um dos sistemas de PDV utilizados pelo supermercado, origem dos dados importados.
- **Consinco**: Um dos sistemas de PDV utilizados pelo supermercado, origem dos dados importados.
- **Perfil**: Conjunto de permissões de acesso associado a um tipo de usuário (gerente ou fiscal).
- **Sistema**: O Aplicativo de Gestão de Frente de Caixa como um todo.
- **Modulo_Importacoes**: Componente do Sistema responsável pelo controle de importações de arquivos diários.
- **Modulo_Indicadores**: Componente do Sistema responsável pela exibição de indicadores, metas e rankings.
- **Modulo_Insumos**: Componente do Sistema responsável pelo controle de estoque de insumos.
- **Modulo_Fiscais**: Componente do Sistema responsável pelo monitoramento de fiscais em tempo real e pela escala.
- **Modulo_Checklist**: Componente do Sistema responsável pelos checklists de abertura e fechamento.
- **Modulo_Operadores**: Componente do Sistema responsável pelo cadastro de operadores e controle de ausências.
- **Modulo_Acessos**: Componente do Sistema responsável pela autenticação, perfis e notificações.

---

## Módulo 1: Controle de Importações

### Requisito 1.1 — Importação diária de arquivos

**História de Usuário:** Como gerente de frente de caixa, quero importar diariamente os quatro arquivos de dados operacionais, para que os indicadores sejam alimentados com as informações atualizadas do dia.

#### Critérios de Aceitação

1. O Modulo_Importacoes DEVE permitir a importação de quatro tipos de arquivo: Cancelamento de Itens, Troco Solidário, Recargas de Celular e Devoluções.
2. QUANDO um arquivo de Cancelamento de Itens é importado, O Modulo_Importacoes DEVE registrar, para cada linha, a data, o nome do operador e o valor.
3. QUANDO um arquivo de Troco Solidário é importado, O Modulo_Importacoes DEVE registrar, para cada linha, a data, o nome do operador e o valor.
4. QUANDO um arquivo de Recargas de Celular é importado, O Modulo_Importacoes DEVE registrar, para cada linha, a data, o nome do operador e o valor.
5. QUANDO um arquivo de Devoluções é importado, O Modulo_Importacoes DEVE registrar, para cada linha, a data, o nome do fiscal e o valor.
6. SE um arquivo importado não contém as colunas esperadas (data, nome e valor), ENTÃO O Modulo_Importacoes DEVE rejeitar o arquivo e exibir uma mensagem descritiva indicando a coluna ausente.
7. QUANDO um arquivo é importado com sucesso, O Modulo_Importacoes DEVE associar cada registro a um operador ou fiscal previamente cadastrado pelo nome.
8. SE um nome presente no arquivo importado não corresponde a nenhum operador ou fiscal cadastrado, ENTÃO O Modulo_Importacoes DEVE listar o nome não reconhecido para revisão pelo gerente.

### Requisito 1.2 — Status diário de importação por arquivo

**História de Usuário:** Como gerente de frente de caixa, quero visualizar o status de importação de cada arquivo do dia, para que eu saiba rapidamente quais arquivos já foram importados e quais ainda faltam.

#### Critérios de Aceitação

1. O Modulo_Importacoes DEVE exibir, para cada um dos quatro tipos de arquivo do dia corrente, um status de importação como "importado" ou "pendente".
2. QUANDO um arquivo do dia corrente foi importado com sucesso, O Modulo_Importacoes DEVE exibir o status "importado" para o tipo de arquivo correspondente.
3. ENQUANTO um arquivo do dia corrente não tiver sido importado, O Modulo_Importacoes DEVE exibir o status "pendente" para o tipo de arquivo correspondente.

### Requisito 1.3 — Histórico de importações

**História de Usuário:** Como gerente de frente de caixa, quero consultar o histórico de importações, para que eu possa auditar quais arquivos foram importados, em que data, em que horário e por qual usuário.

#### Critérios de Aceitação

1. QUANDO um arquivo é importado com sucesso, O Modulo_Importacoes DEVE registrar no histórico o tipo de arquivo, a data de referência, a data e o horário da importação e o usuário que realizou a importação.
2. O Modulo_Importacoes DEVE exibir o histórico de importações ordenado da importação mais recente para a mais antiga.
3. QUANDO o gerente seleciona um intervalo de datas, O Modulo_Importacoes DEVE exibir apenas os registros de importação cuja data de referência esteja dentro do intervalo selecionado.

### Requisito 1.4 — Alerta de arquivo não importado

**História de Usuário:** Como gerente de frente de caixa, quero ser alertado quando um arquivo não for importado até o fim do dia, para que nenhum dado deixe de ser registrado.

#### Critérios de Aceitação

1. QUANDO o horário de fim do dia configurado é atingido e ao menos um dos quatro arquivos do dia corrente está com status "pendente", O Modulo_Importacoes DEVE enviar uma notificação ao login gerencial indicando quais arquivos estão pendentes.
2. O Modulo_Importacoes DEVE permitir que o gerente configure o horário de fim do dia utilizado para a verificação de arquivos pendentes.

---

## Módulo 2: Indicadores e Metas

### Requisito 2.1 — Painel de Vendas

**História de Usuário:** Como gerente de frente de caixa, quero informar as vendas diárias, para que o aplicativo acumule os totais e sirva de base para o cálculo dos indicadores percentuais.

#### Critérios de Aceitação

1. O Modulo_Indicadores DEVE permitir que o gerente informe o valor de vendas de um dia específico.
2. QUANDO o valor de vendas de um dia é informado, O Modulo_Indicadores DEVE acumular o total de vendas do dia, da semana e do mês correspondentes.
3. O Modulo_Indicadores DEVE exibir o total de vendas acumulado do dia, da semana e do mês.
4. SE o valor de vendas informado for menor que zero, ENTÃO O Modulo_Indicadores DEVE rejeitar o valor e exibir uma mensagem solicitando um valor maior ou igual a zero.
5. QUANDO um valor de vendas já informado para um dia é alterado, O Modulo_Indicadores DEVE recalcular os acumulados de dia, semana e mês correspondentes.

### Requisito 2.2 — Indicador de Cancelamento de Itens

**História de Usuário:** Como gerente de frente de caixa, quero acompanhar o indicador de cancelamento de itens em relação à meta, para que eu possa identificar e reduzir cancelamentos excessivos.

#### Critérios de Aceitação

1. O Modulo_Indicadores DEVE calcular o indicador de Cancelamento de Itens como o percentual do valor total de cancelamentos sobre o valor total de vendas do período selecionado.
2. O Modulo_Indicadores DEVE exibir o valor atual do indicador de Cancelamento de Itens e a respectiva meta de 0,75%.
3. ENQUANTO o valor atual do indicador de Cancelamento de Itens for menor ou igual à meta, O Modulo_Indicadores DEVE exibir o status na cor verde.
4. ENQUANTO o valor atual do indicador de Cancelamento de Itens for maior que a meta e menor ou igual ao limite amarelo configurado, O Modulo_Indicadores DEVE exibir o status na cor amarela.
5. ENQUANTO o valor atual do indicador de Cancelamento de Itens for maior que o limite amarelo configurado, O Modulo_Indicadores DEVE exibir o status na cor vermelha.
6. O Modulo_Indicadores DEVE exibir um ranking de operadores ordenado pelo valor de cancelamento de itens de cada operador no período selecionado.

### Requisito 2.3 — Indicador de Devoluções

**História de Usuário:** Como gerente de frente de caixa, quero acompanhar o indicador de devoluções por fiscal em relação à meta, para que eu possa controlar o nível de devoluções.

#### Critérios de Aceitação

1. O Modulo_Indicadores DEVE calcular o indicador de Devoluções como o percentual do valor total de devoluções sobre o valor total de vendas do período selecionado.
2. O Modulo_Indicadores DEVE exibir o valor atual do indicador de Devoluções e a respectiva meta de 0,05%.
3. ENQUANTO o valor atual do indicador de Devoluções for menor ou igual à meta, O Modulo_Indicadores DEVE exibir o status na cor verde.
4. ENQUANTO o valor atual do indicador de Devoluções for maior que a meta e menor ou igual ao limite amarelo configurado, O Modulo_Indicadores DEVE exibir o status na cor amarela.
5. ENQUANTO o valor atual do indicador de Devoluções for maior que o limite amarelo configurado, O Modulo_Indicadores DEVE exibir o status na cor vermelha.
6. O Modulo_Indicadores DEVE exibir um ranking de fiscais ordenado pelo valor de devoluções de cada fiscal no período selecionado.

### Requisito 2.4 — Indicador de Troco Solidário

**História de Usuário:** Como gerente de frente de caixa, quero acompanhar o indicador de troco solidário em relação à meta mensal, para que eu possa incentivar os operadores a aumentar a arrecadação.

#### Critérios de Aceitação

1. O Modulo_Indicadores DEVE calcular o indicador de Troco Solidário como a soma dos valores de troco solidário do período selecionado, expressa em reais.
2. O Modulo_Indicadores DEVE exibir o valor atual acumulado de Troco Solidário do mês e a respectiva meta de R$ 2.000,00 por mês.
3. ENQUANTO o valor atual acumulado de Troco Solidário do mês for maior ou igual à meta, O Modulo_Indicadores DEVE exibir o status na cor verde.
4. ENQUANTO o valor atual acumulado de Troco Solidário do mês for maior ou igual ao limite amarelo configurado e menor que a meta, O Modulo_Indicadores DEVE exibir o status na cor amarela.
5. ENQUANTO o valor atual acumulado de Troco Solidário do mês for menor que o limite amarelo configurado, O Modulo_Indicadores DEVE exibir o status na cor vermelha.
6. O Modulo_Indicadores DEVE exibir um ranking de operadores ordenado pelo valor de troco solidário de cada operador no período selecionado.

### Requisito 2.5 — Indicador de Recargas de Celular

**História de Usuário:** Como gerente de frente de caixa, quero acompanhar o indicador de recargas de celular em relação à meta, para que eu possa estimular o aumento das vendas de recarga.

#### Critérios de Aceitação

1. O Modulo_Indicadores DEVE calcular o indicador de Recargas de Celular como a soma dos valores de recargas do período selecionado, expressa em reais.
2. O Modulo_Indicadores DEVE exibir o valor atual acumulado de Recargas de Celular e a respectiva meta de R$ 2.000,00.
3. ENQUANTO o valor atual acumulado de Recargas de Celular for maior ou igual à meta, O Modulo_Indicadores DEVE exibir o status na cor verde.
4. ENQUANTO o valor atual acumulado de Recargas de Celular for maior ou igual ao limite amarelo configurado e menor que a meta, O Modulo_Indicadores DEVE exibir o status na cor amarela.
5. ENQUANTO o valor atual acumulado de Recargas de Celular for menor que o limite amarelo configurado, O Modulo_Indicadores DEVE exibir o status na cor vermelha.
6. O Modulo_Indicadores DEVE exibir um ranking de operadores ordenado pelo valor de recargas de celular de cada operador no período selecionado.

### Requisito 2.6 — Indicador de Sacolas APAE por lote

**História de Usuário:** Como gerente de frente de caixa, quero controlar as sacolas APAE por lote recebido, para que eu acompanhe a quantidade vendida e o percentual vendido sobre o lote inicial.

#### Critérios de Aceitação

1. O Modulo_Indicadores DEVE permitir que o gerente registre manualmente a quantidade inicial de sacolas APAE de um lote recebido.
2. QUANDO o gerente atualiza o saldo restante de sacolas APAE, O Modulo_Indicadores DEVE calcular a quantidade vendida como a diferença entre o saldo anterior e o saldo atual.
3. QUANDO o gerente atualiza o saldo restante de sacolas APAE, O Modulo_Indicadores DEVE calcular o percentual vendido como a quantidade total vendida do lote dividida pela quantidade inicial do lote recebido.
4. SE o saldo atual informado for maior que o saldo anterior, ENTÃO O Modulo_Indicadores DEVE rejeitar a atualização e exibir uma mensagem indicando que o saldo atual não pode ser maior que o saldo anterior.
5. QUANDO o saldo restante de sacolas APAE atinge zero e o gerente solicita a reinicialização do indicador, O Modulo_Indicadores DEVE encerrar o lote atual e iniciar um novo lote com quantidade vendida zerada.
6. QUANDO um lote de sacolas APAE é encerrado, O Modulo_Indicadores DEVE preservar no histórico a quantidade inicial, a quantidade total vendida e as datas de início e de encerramento do lote.
7. O Modulo_Indicadores DEVE exibir o histórico de lotes de sacolas APAE encerrados.

---

## Módulo 3: Controle de Insumos

### Requisito 3.1 — Controle de sacolas por fardo via código de barras

**História de Usuário:** Como fiscal de frente de caixa, quero registrar a retirada de sacolas escaneando o código de barras do fardo, para que o consumo seja rastreado por responsável, data e destino.

#### Critérios de Aceitação

1. QUANDO o fiscal escaneia o código de barras de um fardo de sacolas, O Modulo_Insumos DEVE registrar o responsável pela retirada, a data, o horário e o destino informado.
2. QUANDO uma retirada de fardo é registrada, O Modulo_Insumos DEVE reduzir o saldo de estoque de sacolas na quantidade correspondente ao fardo.
3. SE o código de barras escaneado não corresponde a um fardo cadastrado, ENTÃO O Modulo_Insumos DEVE exibir uma mensagem indicando que o fardo não foi reconhecido.
4. O Modulo_Insumos DEVE exibir o saldo de estoque de sacolas em tempo real.
5. SE o saldo de estoque de sacolas for menor ou igual ao limite mínimo configurado, ENTÃO O Modulo_Insumos DEVE emitir um alerta de estoque baixo.
6. O Modulo_Insumos DEVE exibir o histórico de consumo de sacolas para apoiar a previsão de compras.

### Requisito 3.2 — Controle de bobinas

**História de Usuário:** Como gerente de frente de caixa, quero controlar o estoque de bobinas e o consumo por PDV, para que eu evite a falta de papel nos caixas.

#### Critérios de Aceitação

1. O Modulo_Insumos DEVE exibir o saldo de estoque de bobinas em tempo real.
2. QUANDO o consumo de bobinas de um PDV é registrado, O Modulo_Insumos DEVE reduzir o saldo de estoque de bobinas na quantidade correspondente.
3. SE o saldo de estoque de bobinas for menor ou igual ao limite mínimo configurado, ENTÃO O Modulo_Insumos DEVE emitir um alerta de estoque baixo.
4. O Modulo_Insumos DEVE exibir o consumo de bobinas por PDV.

### Requisito 3.3 — Controle de panos e demais insumos

**História de Usuário:** Como gerente de frente de caixa, quero controlar o estoque de panos e demais insumos, para que eu mantenha os materiais de operação sempre disponíveis.

#### Critérios de Aceitação

1. O Modulo_Insumos DEVE exibir o saldo de estoque de panos e de cada insumo cadastrado em tempo real.
2. QUANDO o consumo de um insumo é registrado, O Modulo_Insumos DEVE reduzir o saldo de estoque do insumo na quantidade correspondente.
3. SE o saldo de estoque de um insumo for menor ou igual ao limite mínimo configurado, ENTÃO O Modulo_Insumos DEVE emitir um alerta de estoque baixo para o insumo correspondente.
4. O Modulo_Insumos DEVE permitir que o gerente cadastre novos tipos de insumo com seu respectivo limite mínimo de estoque.

---

## Módulo 4: Fiscais em Tempo Real e Escala

### Requisito 4.1 — Painel de fiscais em tempo real

**História de Usuário:** Como gerente de frente de caixa, quero visualizar o status de cada fiscal em tempo real, para que eu saiba quem está disponível, em intervalo ou em atendimento.

#### Critérios de Aceitação

1. O Modulo_Fiscais DEVE exibir, para cada fiscal em serviço, o status atual entre "disponível", "em intervalo" e "em atendimento".
2. QUANDO um fiscal altera seu status, O Modulo_Fiscais DEVE atualizar o status exibido no painel em tempo real.
3. O Modulo_Fiscais DEVE exibir o horário em que o status atual de cada fiscal foi definido.

### Requisito 4.2 — Check-in e check-out de fiscais

**História de Usuário:** Como fiscal de frente de caixa, quero realizar check-in e check-out, para que minha presença e meu horário de trabalho sejam registrados.

#### Critérios de Aceitação

1. QUANDO um fiscal realiza check-in, O Modulo_Fiscais DEVE registrar a data e o horário de entrada e definir o status do fiscal como "disponível".
2. QUANDO um fiscal realiza check-out, O Modulo_Fiscais DEVE registrar a data e o horário de saída e marcar o fiscal como fora de serviço.
3. SE um fiscal que já está com check-in ativo tenta realizar novo check-in, ENTÃO O Modulo_Fiscais DEVE exibir uma mensagem indicando que já existe um check-in ativo.
4. O Modulo_Fiscais DEVE exibir o histórico de check-in e check-out por fiscal.

### Requisito 4.3 — Escala de trabalho

**História de Usuário:** Como gerente de frente de caixa, quero cadastrar e consultar a escala de trabalho de fiscais, operadores e gerentes, para que os horários, intervalos e folgas sejam organizados conforme as regras de cada dia da semana.

#### Critérios de Aceitação

1. O Modulo_Fiscais DEVE permitir que o gerente cadastre a escala de um fiscal, operador ou gerente informando horário de entrada, horário de saída, duração do intervalo e dia da semana.
2. O Modulo_Fiscais DEVE permitir o cadastro de horários diferentes por dia da semana para o mesmo funcionário.
3. O Modulo_Fiscais DEVE permitir o cadastro de uma folga semanal por funcionário.
4. O Modulo_Fiscais DEVE permitir o cadastro de intervalo de duração variável por escala.
5. ONDE um funcionário possui horário especial individual, O Modulo_Fiscais DEVE permitir o cadastro de horários específicos que prevaleçam sobre a regra geral do turno.
6. O Modulo_Fiscais DEVE exibir a escala consolidada por dia da semana, indicando entrada, saída, intervalo e folga de cada funcionário.
7. Os funcionários (fiscais, operadores e gerentes) que não possuem folga em nenhum dia de segunda a sábado DEVEM ter folga fixa aos domingos.

---

## Módulo 5: Checklist de Abertura e Fechamento

### Requisito 5.1 — Registro de checklist por upload de imagem

**História de Usuário:** Como fiscal de frente de caixa, quero registrar o checklist enviando uma imagem do resultado, para que o checklist seja marcado como concluído.

#### Critérios de Aceitação

1. O Modulo_Checklist DEVE disponibilizar diariamente um checklist de abertura e um checklist de fechamento.
2. QUANDO uma imagem é enviada para um checklist, O Modulo_Checklist DEVE marcar o checklist correspondente como "Feito".
3. QUANDO uma imagem é enviada para um checklist, O Modulo_Checklist DEVE registrar a data, o horário e o usuário que realizou o envio.
4. SE o arquivo enviado não for uma imagem, ENTÃO O Modulo_Checklist DEVE rejeitar o envio e exibir uma mensagem indicando que apenas imagens são aceitas.
5. ENQUANTO nenhuma imagem tiver sido enviada para um checklist do dia, O Modulo_Checklist DEVE exibir o status do checklist como "pendente".

### Requisito 5.2 — Janelas de execução dos checklists

**História de Usuário:** Como gerente de frente de caixa, quero que os checklists tenham janelas de execução definidas, para que abertura e fechamento sejam realizados nos horários corretos.

#### Critérios de Aceitação

1. O Modulo_Checklist DEVE definir a janela de execução do checklist de abertura entre 08:15 e 09:15.
2. O Modulo_Checklist DEVE definir a janela de execução do checklist de fechamento entre 13:15 e 14:15.
3. O Modulo_Checklist DEVE exibir a janela de execução de cada checklist do dia.

### Requisito 5.3 — Alerta de checklist não realizado

**História de Usuário:** Como gerente de frente de caixa, quero ser alertado quando um checklist não for realizado dentro da janela, para que a tarefa não seja esquecida.

#### Critérios de Aceitação

1. QUANDO o horário 08:55 é atingido e o checklist de abertura do dia está com status "pendente", O Modulo_Checklist DEVE enviar uma notificação push.
2. QUANDO o horário 13:55 é atingido e o checklist de fechamento do dia está com status "pendente", O Modulo_Checklist DEVE enviar uma notificação push.
3. QUANDO uma notificação de checklist pendente é enviada, O Modulo_Checklist DEVE enviá-la a todos os fiscais que estão online naquele momento.
4. QUANDO uma notificação de checklist pendente é enviada, O Modulo_Checklist DEVE enviá-la ao login gerencial, independentemente de o gerente estar online.

---

## Módulo 6: Cadastro de Operadores e Ausências

### Requisito 6.1 — Cadastro de operadores

**História de Usuário:** Como gerente de frente de caixa, quero cadastrar todos os operadores por nome, para que os dados importados sejam vinculados às pessoas corretas.

#### Critérios de Aceitação

1. O Modulo_Operadores DEVE permitir que o gerente cadastre um operador informando o nome.
2. QUANDO um operador é cadastrado, O Modulo_Operadores DEVE tornar o nome do operador disponível para vinculação com os dados importados.
3. SE o gerente tenta cadastrar um operador com nome idêntico a um operador já cadastrado, ENTÃO O Modulo_Operadores DEVE exibir uma mensagem indicando que o nome já existe.
4. O Modulo_Operadores DEVE permitir que o gerente edite o nome de um operador cadastrado.
5. O Modulo_Operadores DEVE exibir a lista de operadores cadastrados.

### Requisito 6.2 — Registro de ausências

**História de Usuário:** Como gerente de frente de caixa, quero registrar ausências de operadores e fiscais por dia, para que eu acompanhe a frequência da equipe.

#### Critérios de Aceitação

1. O Modulo_Operadores DEVE permitir que o gerente registre uma ausência de um operador ou fiscal para um dia específico.
2. QUANDO uma ausência é registrada, O Modulo_Operadores DEVE armazenar o nome do operador ou fiscal e a data da ausência.
3. SE já existe uma ausência registrada para o mesmo operador ou fiscal na mesma data, ENTÃO O Modulo_Operadores DEVE exibir uma mensagem indicando que a ausência já foi registrada para a data.
4. O Modulo_Operadores DEVE permitir que o gerente remova uma ausência registrada.

### Requisito 6.3 — Relatório de ausências por pessoa

**História de Usuário:** Como gerente de frente de caixa, quero gerar um relatório de ausências por pessoa em um período, para que eu visualize a quantidade de ausências de cada operador e fiscal.

#### Critérios de Aceitação

1. QUANDO o gerente seleciona um período, O Modulo_Operadores DEVE gerar um relatório que apresenta, para cada operador e fiscal, a quantidade de ausências dentro do período.
2. O Modulo_Operadores DEVE incluir no relatório apenas as ausências cuja data esteja dentro do período selecionado.
3. O Modulo_Operadores DEVE exibir o relatório de ausências ordenado pela quantidade de ausências, da maior para a menor.

### Requisito 6.4 — Cadastro inicial da equipe (fiscais e gerentes pré-cadastrados)

**História de Usuário:** Como gerente de frente de caixa, quero que o aplicativo já venha com os fiscais e gerentes atuais pré-cadastrados (cadastro inicial / seed), para que a equipe existente esteja disponível desde o primeiro acesso, sem necessidade de cadastrá-la manualmente.

#### Critérios de Aceitação

1. QUANDO o Sistema é inicializado pela primeira vez, O Modulo_Operadores DEVE criar como cadastro inicial (seed) os fiscais e gerentes relacionados nos critérios a seguir.
2. O Modulo_Operadores DEVE pré-cadastrar os seguintes fiscais do turno de abertura, cada um com o turno "abertura": Carmen Felicia, Fabiana Sirlei Sarafim e Josiane Cardoso.
3. O Modulo_Operadores DEVE pré-cadastrar os seguintes fiscais do turno intermediário, cada um com o turno "intermediário": Sheila Vieira, Auri Nellys Coronado de Garcia e Raquel Silva de Oliveira Beneton.
4. O Modulo_Operadores DEVE pré-cadastrar os seguintes fiscais do turno de fechamento, cada um com o turno "fechamento": Karen Barro, Betzabeth Elisa Castellano Reyes, Maryolis Alexandra Lanza Lamar e Yannelit Subero.
5. QUANDO um fiscal é pré-cadastrado, O Modulo_Operadores DEVE registrar o nome do fiscal e o respectivo turno (abertura, intermediário ou fechamento).
6. O Modulo_Operadores DEVE pré-cadastrar os seguintes gerentes, cada um com o perfil GERENTE: Pedro Munoz e Arlete Pacheco Fernandes.
7. QUANDO o gerente Pedro Munoz ou a gerente Arlete Pacheco Fernandes é pré-cadastrado, O Modulo_Operadores DEVE associar o perfil GERENTE conforme definido no Requisito 7.2.
8. ONDE a fiscal Josiane Cardoso é pré-cadastrada, O Modulo_Operadores DEVE marcá-la como possuidora de escala especial individual, cujas regras detalhadas são definidas conforme o Requisito 4.3.5.

> **Nota sobre nomes oficiais:** Os nomes "Pedro Yepez" e "Karen Mendoza" utilizados anteriormente referem-se às mesmas pessoas agora cadastradas com os nomes oficiais completos "Pedro Munoz" e "Karen Barro", respectivamente. Adicionalmente, o nome "Carmen Moreno" utilizado anteriormente refere-se à mesma pessoa agora cadastrada com o nome oficial "Carmen Felicia" (fiscal de abertura).
9. SE um fiscal ou gerente do cadastro inicial já existe no Sistema, ENTÃO O Modulo_Operadores DEVE preservar o registro existente sem duplicá-lo durante a inicialização.
10. O Modulo_Operadores DEVE permitir que a lista de operadores (caixas) e as escalas completas de trabalho sejam cadastradas posteriormente pelo gerente, após o cadastro inicial da equipe.
11. QUANDO cada fiscal e cada gerente é pré-cadastrado, O Modulo_Operadores DEVE criar para cada um deles um usuário com login individual e exclusivo, conforme o Requisito 7.1, de modo que cada fiscal e cada gerente listado tenha o seu próprio login.

### Requisito 6.5 — Cadastro inicial de operadores

**História de Usuário:** Como gerente de frente de caixa, quero que o aplicativo já venha com os operadores (caixas) atuais pré-cadastrados (cadastro inicial / seed), para que as ausências e os dados importados sejam vinculados às pessoas corretas desde o primeiro acesso, sem necessidade de cadastrá-los manualmente.

#### Critérios de Aceitação

1. QUANDO o Sistema é inicializado pela primeira vez, O Modulo_Operadores DEVE criar como cadastro inicial (seed) os 39 operadores relacionados no critério 6.5.2.
2. O Modulo_Operadores DEVE pré-cadastrar os seguintes 39 operadores: VALDIR JOSE; NAIROBI LUYANDO; LAURISMAR DEL CARMEN SOJO GUEVARA; NARIA PIRES; FRANCILEUDA MARQUES; EDECI SANTA LUCIA; PATRICIA DE OLIVEIRA; HIAGO FERNANDO VIEIRA; TAINA MARTINELLI TERRES; JOANA PONTES; TAINA IARA DENOVAC BITENCOURT; STEFANIE DRUZIAN WALTRICK; SILVANA DE FREITAS SANTOS; ROSMELY DE LA COROMOTO GUZMAN VIERA; MARLENIS CAROLINA PERDOMO GUZMAN; MARIANGEL ANDREINA SOTILLO CEDENO; MARIA ANGELES YNOJOSA TOVAR; JAIRO RODRIGUES MOURA; ELIZIANE SALGADO CASTURIAGA; CARMEN MARIA ASTUDILLO LOPEZ; ARLENIS BATISTA GARLOBO; ALEJANDRA SARAHY PINO BORROME; OLGA MARIA CHIRINOS CADENA; GLORIA MARIA TOVAR BETHERMY; FRANCIELE SILVEIRA DOS SANTOS; ELIAS DOS SANTOS CAMARGO; DAVID ENRIQUE GARCIA RAMIREZ; ERICK LEONARDO BRITO ZAPATA; ENEIDA JOMARA SILVA RODRIGUES; ORLIANNYS DEL CARMEN ROMERO AGUILERA; AILIN OCHOA; YESENIA DEVERA; YUDISBEL MERINO TROCHE; MATHEUS HENRIQUE DA SILVA GIACOMO; SONIA MARIA RODRIGUES JUSTINO; FELIPE GUSTAVO DOS SANTOS VICENTE; TAYLA RESPLANDE SILVA; BARBARA FABIANA BATISTA; CAMILA RIBEIRO DA COSTA.
3. QUANDO um operador é pré-cadastrado, O Modulo_Operadores DEVE registrar o nome do operador conforme relacionado no critério 6.5.2.
4. QUANDO uma ausência é registrada para um operador, O Modulo_Operadores DEVE vinculá-la a um operador do cadastro inicial pelo nome, conforme o Requisito 6.2.
5. QUANDO um dado é importado e associado a um operador pelo nome, O Modulo_Importacoes DEVE vinculá-lo a um operador do cadastro inicial, conforme o Requisito 1.1.
6. SE um operador do cadastro inicial já existe no Sistema, ENTÃO O Modulo_Operadores DEVE preservar o registro existente sem duplicá-lo durante a inicialização.

> **Nota:** Patricia Del Valle Palmares Fernandez foi desligada e removida do cadastro inicial. Os nomes "Paola Rio", "Claudia Bertushi" e "Nancy Coromoto Fuentes Lopez" são sempre ignorados e não devem ser cadastrados nem incluídos nas escalas.

### Requisito 6.6 — Classificação e contagem de operadores por turno

**História de Usuário:** Como gerente de frente de caixa, quero ver na seção de operadores a contagem de operadores por turno (abertura, intermediário e fechamento), para acompanhar a distribuição da equipe por período em um determinado dia.

#### Critérios de Aceitação

1. O Modulo_Operadores DEVE classificar o turno de um operador, para um determinado dia, com base no horário de entrada da escala do operador naquele dia.
2. ONDE o horário de entrada do operador é anterior às 10:00, O Modulo_Operadores DEVE classificar o operador no turno "abertura".
3. ONDE o horário de entrada do operador é igual ou posterior às 10:00 e anterior às 13:00, O Modulo_Operadores DEVE classificar o operador no turno "intermediário".
4. ONDE o horário de entrada do operador é igual ou posterior às 13:00, O Modulo_Operadores DEVE classificar o operador no turno "fechamento".
5. O Modulo_Operadores DEVE exibir, na seção de operadores, a contagem de operadores por turno (abertura, intermediário e fechamento) para o dia/escala selecionado.
6. O Modulo_Operadores DEVE exibir o total de operadores trabalhando no dia/escala selecionado.
7. O Modulo_Operadores DEVE considerar na contagem apenas os operadores que estão trabalhando no dia, excluindo os que estão em folga, em férias ou desligados.

---

## Módulo 7: Acessos e Perfis

### Requisito 7.1 — Login individual

**História de Usuário:** Como fiscal de frente de caixa, quero acessar o aplicativo com um login individual, para que minhas ações sejam identificadas e protegidas.

#### Critérios de Aceitação

1. O Modulo_Acessos DEVE exigir autenticação por login individual antes de conceder acesso às funcionalidades do Sistema.
2. QUANDO um usuário informa credenciais válidas, O Modulo_Acessos DEVE conceder acesso conforme o perfil associado ao usuário.
3. SE um usuário informa credenciais inválidas, ENTÃO O Modulo_Acessos DEVE negar o acesso e exibir uma mensagem de credenciais inválidas.
4. O Modulo_Acessos DEVE atribuir a cada usuário (fiscal ou gerente) um login individual e exclusivo, não compartilhado entre usuários.
5. QUANDO um usuário (fiscal ou gerente) é autenticado, O Modulo_Acessos DEVE autenticá-lo por meio do seu próprio login individual e das suas credenciais exclusivas.
6. O Modulo_Acessos NÃO DEVE permitir que um mesmo login seja compartilhado entre dois ou mais usuários.

### Requisito 7.2 — Perfis de acesso

**História de Usuário:** Como gerente de frente de caixa, quero que existam perfis de gerente e de fiscal, para que cada tipo de usuário tenha o nível de acesso adequado.

#### Critérios de Aceitação

1. O Modulo_Acessos DEVE oferecer dois perfis: gerente e fiscal.
2. ONDE o usuário possui o perfil de gerente, O Modulo_Acessos DEVE conceder acesso completo a todas as funcionalidades do Sistema.
3. ONDE o usuário possui o perfil de fiscal, O Modulo_Acessos DEVE conceder acesso às funcionalidades operacionais definidas para o perfil de fiscal.
4. SE um usuário com perfil de fiscal tenta acessar uma funcionalidade restrita ao perfil de gerente, ENTÃO O Modulo_Acessos DEVE negar o acesso e exibir uma mensagem de permissão insuficiente.

### Requisito 7.3 — Notificações

**História de Usuário:** Como usuário do aplicativo, quero receber notificações push e dentro do aplicativo, para que eu seja informado de alertas e pendências relevantes.

#### Critérios de Aceitação

1. O Modulo_Acessos DEVE suportar o envio de notificações push e notificações dentro do aplicativo.
2. QUANDO uma notificação é gerada por qualquer módulo, O Modulo_Acessos DEVE entregá-la ao usuário destinatário por notificação push e por notificação dentro do aplicativo.
3. O Modulo_Acessos DEVE exibir o histórico de notificações recebidas por usuário.


---

## Apêndice A — Escalas de Trabalho dos Operadores

> **Nota:** As escalas indicam apenas o **horário de entrada** e o **horário de saída** de cada operador. O intervalo de 2 horas é implícito e está compreendido entre esses dois horários. Este apêndice será estendido com a escala de cada dia da semana (de segunda a sábado) à medida que o gerente as fornecer. As escalas representam os horários fixos padrão de cada dia da semana (segunda a sábado).

### Segunda-feira

#### Operadores trabalhando

| Operador | Entrada | Saída |
|----------|---------|-------|
| VALDIR JOSE | 06:50 | 15:50 |
| NAIROBI LUYANDO | 06:50 | 15:50 |
| LAURISMAR DEL CARMEN SOJO GUEVARA | 06:50 | 15:50 |
| NARIA PIRES | 09:00 | 18:00 |
| FRANCILEUDA MARQUES | 09:00 | 18:00 |
| EDECI SANTA LUCIA | 09:00 | 18:00 |
| PATRICIA DEL VALLE PALMARES FERNANDEZ | 10:00 | 19:00 |
| PATRICIA DE OLIVEIRA | 10:00 | 19:00 |
| HIAGO FERNANDO VIEIRA | 10:00 | 19:00 |
| TAINA MARTINELLI TERRES | 12:00 | 18:00 |
| JOANA PONTES | 13:00 | 19:00 |
| TAINA IARA DENOVAC BITENCOURT | 13:50 | 22:50 |
| STEFANIE DRUZIAN WALTRICK | 13:50 | 22:50 |
| SILVANA DE FREITAS SANTOS | 13:50 | 22:50 |
| ROSMELY DE LA COROMOTO GUZMAN VIERA | 13:50 | 22:50 |
| MARLENIS CAROLINA PERDOMO GUZMAN | 13:50 | 22:50 |
| MARIANGEL ANDREINA SOTILLO CEDENO | 13:50 | 22:50 |
| MARIA ANGELES YNOJOSA TOVAR | 13:50 | 22:50 |
| JAIRO RODRIGUES MOURA | 13:50 | 22:50 |
| ELIZIANE SALGADO CASTURIAGA | 13:50 | 22:50 |
| CARMEN MARIA ASTUDILLO LOPEZ | 13:50 | 22:50 |
| ARLENIS BATISTA GARLOBO | 13:50 | 22:50 |
| ALEJANDRA SARAHY PINO BORROME | 13:50 | 22:50 |
| OLGA MARIA CHIRINOS CADENA | 16:00 | 22:00 |
| GLORIA MARIA TOVAR BETHERMY | 16:50 | 22:50 |
| FRANCIELE SILVEIRA DOS SANTOS | 16:50 | 22:50 |
| ELIAS DOS SANTOS CAMARGO | 16:50 | 22:50 |

#### Fiscais e Gerentes em FOLGA

- Josiane Cardoso
- Karen Barro
- Maryolis Alexandra Lanza Lamar

#### Operadores em FOLGA

- DAVID ENRIQUE GARCIA RAMIREZ
- ERICK LEONARDO BRITO ZAPATA
- ENEIDA JOMARA SILVA RODRIGUES
- ORLIANNYS DEL CARMEN ROMERO AGUILERA
- AILIN OCHOA
- YESENIA DEVERA
- YUDISBEL MERINO TROCHE
- MATHEUS HENRIQUE DA SILVA GIACOMO
- SONIA MARIA RODRIGUES JUSTINO
- FELIPE GUSTAVO DOS SANTOS VICENTE


### Terça-feira (16/06/26)

> **Nota:** Paola Rio e Claudia Bertushi são sempre ignoradas e não constam das escalas. Tayla Resplande Silva está em férias neste dia.

#### Fiscais e Gerentes

| Nome | Entrada | Saída |
|------|---------|-------|
| FABIANA SIRLEI SARAFIM | 06:50 | 15:50 |
| JOSIANE CARDOSO | 08:00 | 17:00 |
| PEDRO MUNOZ | 09:00 | 18:00 |
| SHEILA VIEIRA | 11:00 | 20:00 |
| AURI NELLYS CORONADO DE GARCIA | 12:00 | 21:00 |
| KAREN BARRO | 13:50 | 22:50 |
| ARLETE PACHECO FERNANDES | 13:50 | 22:50 |

#### Operadores trabalhando

| Operador | Entrada | Saída |
|----------|---------|-------|
| VALDIR JOSÉ | 06:50 | 15:50 |
| NAIROBI LUYANDO | 06:50 | 15:50 |
| MATHEUS HENRIQUE DA SILVA GIACOMO | 06:50 | 15:50 |
| LAURISMAR DEL CARMEN SOJO GUEVARA | 06:50 | 15:50 |
| FELIPE GUSTAVO DOS SANTOS VICENTE | 06:50 | 15:50 |
| ENEIDA JOMARA SILVA RODRIGUES | 06:50 | 15:50 |
| AILIN OCHOA | 06:50 | 15:50 |
| YESENIA DEVERA | 08:00 | 17:00 |
| NARIA PIRES | 09:00 | 18:00 |
| EDECI SANTA LUCIA | 09:00 | 18:00 |
| PATRICIA DE OLIVEIRA | 10:00 | 19:00 |
| HIAGO FERNANDO VIEIRA | 10:00 | 19:00 |
| ORLIANNYS DEL CARMEN ROMERO AGUILERA | 11:00 | 20:00 |
| TAINA MARTINELLI TERRES | 12:00 | 18:00 |
| SONIA MARIA RODRIGUES JUSTINO | 13:00 | 22:00 |
| JOANA PONTES | 13:00 | 19:00 |
| YUDISBEL MERINO TROCHE | 13:50 | 22:50 |
| YANNELIT SUBERO | 13:50 | 22:50 |
| STEFANIE DRUZIAN WALTRICK | 13:50 | 22:50 |
| ROSMELY DE LA COROMOTO GUZMAN VIERA | 13:50 | 22:50 |
| MARYOLIS ALEXANDRA LANZA LAMAR | 13:50 | 22:50 |
| MARIA ANGELES YNOJOSA TOVAR | 13:50 | 22:50 |
| JAIRO RODRIGUES MOURA | 13:50 | 22:50 |
| ERICK LEONARDO BRITO ZAPATA | 13:50 | 22:50 |
| ELIZIANE SALGADO CASTURIAGA | 13:50 | 22:50 |
| DAVID ENRIQUE GARCIA RAMIREZ | 13:50 | 22:50 |
| CARMEN MARIA ASTUDILLO LOPEZ | 13:50 | 22:50 |
| CAMILA RIBEIRO DA COSTA | 13:50 | 22:50 |
| ARLENIS BATISTA GARLOBO | 13:50 | 22:50 |
| ALEJANDRA SARAHY PINO BORROME | 13:50 | 22:50 |
| OLGA MARIA CHIRINOS CADENA | 16:00 | 22:00 |
| GLORIA MARIA TOVAR BETHERMY | 16:50 | 22:50 |
| FRANCIELE SILVEIRA DOS SANTOS | 16:50 | 22:50 |
| ELIAS DOS SANTOS CAMARGO | 16:50 | 22:50 |

#### Operadores em FOLGA

- SILVANA DE FREITAS SANTOS
- TAINA IARA DENOVAC BITENCOURT
- BARBARA FABIANA BATISTA
- MARIANGEL ANDREINA SOTILLO CEDENO
- FRANCILEUDA MARQUES
- BETZABETH ELISA CASTELLANO REYES
- RAQUEL SILVA DE OLIVEIRA BENETON
- CARMEN FELICIA
- MARLENIS CAROLINA PERDOMO GUZMAN



### Quarta-feira (17/06/26)

> **Nota:** Paola Rio e Claudia Bertushi são sempre ignoradas e não constam das escalas. Tayla Resplande Silva está em férias neste dia.

#### Fiscais e Gerentes

| Nome | Entrada | Saída |
|------|---------|-------|
| FABIANA SIRLEI SARAFIM | 06:50 | 15:50 |
| CARMEN FELICIA | 06:50 | 15:50 |
| JOSIANE CARDOSO | 08:00 | 17:00 |
| PEDRO MUNOZ | 09:00 | 18:00 |
| RAQUEL SILVA DE OLIVEIRA BENETON | 11:00 | 20:00 |
| AURI NELLYS CORONADO DE GARCIA | 12:00 | 21:00 |
| KAREN BARRO | 13:50 | 22:50 |
| BETZABETH ELISA CASTELLANO REYES | 13:50 | 22:50 |
| ARLETE PACHECO FERNANDES | 13:50 | 22:50 |

#### Operadores trabalhando

| Operador | Entrada | Saída |
|----------|---------|-------|
| VALDIR JOSÉ | 06:50 | 15:50 |
| MATHEUS HENRIQUE DA SILVA GIACOMO | 06:50 | 15:50 |
| FELIPE GUSTAVO DOS SANTOS VICENTE | 06:50 | 15:50 |
| ENEIDA JOMARA SILVA RODRIGUES | 06:50 | 15:50 |
| AILIN OCHOA | 06:50 | 15:50 |
| YESENIA DEVERA | 08:00 | 17:00 |
| FRANCILEUDA MARQUES | 09:00 | 18:00 |
| EDECI SANTA LUCIA | 09:00 | 18:00 |
| HIAGO FERNANDO VIEIRA | 10:00 | 19:00 |
| ORLIANNYS DEL CARMEN ROMERO AGUILERA | 11:00 | 20:00 |
| TAINA MARTINELLI TERRES | 12:00 | 18:00 |
| SONIA MARIA RODRIGUES JUSTINO | 13:00 | 22:00 |
| JOANA PONTES | 13:00 | 19:00 |
| YUDISBEL MERINO TROCHE | 13:50 | 22:50 |
| TAINA IARA DENOVAC BITENCOURT | 13:50 | 22:50 |
| SILVANA DE FREITAS SANTOS | 13:50 | 22:50 |
| MARYOLIS ALEXANDRA LANZA LAMAR | 13:50 | 22:50 |
| MARLENIS CAROLINA PERDOMO GUZMAN | 13:50 | 22:50 |
| MARIANGEL ANDREINA SOTILLO CEDENO | 13:50 | 22:50 |
| MARIA ANGELES YNOJOSA TOVAR | 13:50 | 22:50 |
| JAIRO RODRIGUES MOURA | 13:50 | 22:50 |
| ERICK LEONARDO BRITO ZAPATA | 13:50 | 22:50 |
| DAVID ENRIQUE GARCIA RAMIREZ | 13:50 | 22:50 |
| CARMEN MARIA ASTUDILLO LOPEZ | 13:50 | 22:50 |
| CAMILA RIBEIRO DA COSTA | 13:50 | 22:50 |
| GLORIA MARIA TOVAR BETHERMY | 16:50 | 22:50 |
| FRANCIELE SILVEIRA DOS SANTOS | 16:50 | 22:50 |
| ELIAS DOS SANTOS CAMARGO | 16:50 | 22:50 |

#### Operadores em FOLGA

- ROSMELY DE LA COROMOTO GUZMAN VIERA
- OLGA MARIA CHIRINOS CADENA
- NAIROBI LUYANDO
- ELIZIANE SALGADO CASTURIAGA
- PATRICIA DEL VALLE PALMARES FERNANDEZ
- NARIA PIRES
- PATRICIA DE OLIVEIRA
- ARLENIS BATISTA GARLOBO
- ALEJANDRA SARAHY PINO BORROME
- LAURISMAR DEL CARMEN SOJO GUEVARA
- STEFANIE DRUZIAN WALTRICK
- SHEILA VIEIRA
- YANNELIT SUBERO



### Quinta-feira (18/06/26)

> **Nota:** Paola Rio, Claudia Bertushi e Nancy Coromoto Fuentes Lopez são sempre ignoradas e não constam das escalas. Patricia Del Valle Palmares Fernandez foi desligada. Tayla Resplande Silva está em férias neste dia.

#### Fiscais e Gerentes

| Nome | Entrada | Saída |
|------|---------|-------|
| CARMEN FELICIA | 06:50 | 15:50 |
| JOSIANE CARDOSO | 08:00 | 17:00 |
| SHEILA VIEIRA | 11:00 | 20:00 |
| RAQUEL SILVA DE OLIVEIRA BENETON | 11:00 | 20:00 |
| YANNELIT SUBERO | 13:50 | 22:50 |
| KAREN BARRO | 13:50 | 22:50 |
| BETZABETH ELISA CASTELLANO REYES | 13:50 | 22:50 |
| ARLETE PACHECO FERNANDES | 13:50 | 22:50 |

#### Operadores trabalhando

| Operador | Entrada | Saída |
|----------|---------|-------|
| NAIROBI LUYANDO | 06:50 | 15:50 |
| MATHEUS HENRIQUE DA SILVA GIACOMO | 06:50 | 15:50 |
| LAURISMAR DEL CARMEN SOJO GUEVARA | 06:50 | 15:50 |
| FELIPE GUSTAVO DOS SANTOS VICENTE | 06:50 | 15:50 |
| ENEIDA JOMARA SILVA RODRIGUES | 06:50 | 15:50 |
| AILIN OCHOA | 06:50 | 15:50 |
| YESENIA DEVERA | 08:00 | 17:00 |
| NARIA PIRES | 09:00 | 18:00 |
| FRANCILEUDA MARQUES | 09:00 | 18:00 |
| PATRICIA DE OLIVEIRA | 10:00 | 19:00 |
| HIAGO FERNANDO VIEIRA | 10:00 | 19:00 |
| ORLIANNYS DEL CARMEN ROMERO AGUILERA | 11:00 | 20:00 |
| TAINA MARTINELLI TERRES | 12:00 | 18:00 |
| SONIA MARIA RODRIGUES JUSTINO | 13:00 | 22:00 |
| JOANA PONTES | 13:00 | 19:00 |
| YUDISBEL MERINO TROCHE | 13:50 | 22:50 |
| TAINA IARA DENOVAC BITENCOURT | 13:50 | 22:50 |
| STEFANIE DRUZIAN WALTRICK | 13:50 | 22:50 |
| SILVANA DE FREITAS SANTOS | 13:50 | 22:50 |
| ROSMELY DE LA COROMOTO GUZMAN VIERA | 13:50 | 22:50 |
| MARYOLIS ALEXANDRA LANZA LAMAR | 13:50 | 22:50 |
| MARLENIS CAROLINA PERDOMO GUZMAN | 13:50 | 22:50 |
| MARIANGEL ANDREINA SOTILLO CEDENO | 13:50 | 22:50 |
| ERICK LEONARDO BRITO ZAPATA | 13:50 | 22:50 |
| ELIZIANE SALGADO CASTURIAGA | 13:50 | 22:50 |
| DAVID ENRIQUE GARCIA RAMIREZ | 13:50 | 22:50 |
| CAMILA RIBEIRO DA COSTA | 13:50 | 22:50 |
| ARLENIS BATISTA GARLOBO | 13:50 | 22:50 |
| ALEJANDRA SARAHY PINO BORROME | 13:50 | 22:50 |
| OLGA MARIA CHIRINOS CADENA | 16:00 | 22:00 |
| FRANCIELE SILVEIRA DOS SANTOS | 16:50 | 22:50 |
| ELIAS DOS SANTOS CAMARGO | 16:50 | 22:50 |

#### Operadores em FOLGA

- MARIA ANGELES YNOJOSA TOVAR
- JAIRO RODRIGUES MOURA
- GLORIA MARIA TOVAR BETHERMY
- VALDIR JOSÉ
- CARMEN MARIA ASTUDILLO LOPEZ
- EDECI SANTA LUCIA
- AURI NELLYS CORONADO DE GARCIA
- FABIANA SIRLEI SARAFIM
- PEDRO MUNOZ



### Sexta-feira (19/06/26)

> **Nota:** Paola Rio, Claudia Bertushi e Nancy Coromoto Fuentes Lopez são sempre ignoradas e não constam das escalas. Tayla Resplande Silva está em férias neste dia. (Nas sextas e sábados a jornada e os horários mudam conforme a regra da operação.)

#### Fiscais e Gerentes

| Nome | Entrada | Saída |
|------|---------|-------|
| FABIANA SIRLEI SARAFIM | 06:50 | 16:50 |
| CARMEN FELICIA | 06:50 | 16:50 |
| JOSIANE CARDOSO | 08:00 | 18:00 |
| PEDRO MUNOZ | 09:00 | 19:00 |
| SHEILA VIEIRA | 11:00 | 21:00 |
| RAQUEL SILVA DE OLIVEIRA BENETON | 11:00 | 21:00 |
| AURI NELLYS CORONADO DE GARCIA | 12:00 | 22:00 |
| YANNELIT SUBERO | 12:50 | 22:50 |
| KAREN BARRO | 12:50 | 22:50 |
| BETZABETH ELISA CASTELLANO REYES | 12:50 | 22:50 |
| ARLETE PACHECO FERNANDES | 12:50 | 22:50 |

#### Operadores trabalhando

| Operador | Entrada | Saída |
|----------|---------|-------|
| VALDIR JOSÉ | 06:50 | 16:50 |
| NAIROBI LUYANDO | 06:50 | 16:50 |
| MATHEUS HENRIQUE DA SILVA GIACOMO | 06:50 | 16:50 |
| LAURISMAR DEL CARMEN SOJO GUEVARA | 06:50 | 16:50 |
| FELIPE GUSTAVO DOS SANTOS VICENTE | 06:50 | 16:50 |
| ENEIDA JOMARA SILVA RODRIGUES | 06:50 | 16:50 |
| AILIN OCHOA | 06:50 | 16:50 |
| YESENIA DEVERA | 08:00 | 18:00 |
| NARIA PIRES | 09:00 | 19:00 |
| FRANCILEUDA MARQUES | 09:00 | 19:00 |
| EDECI SANTA LUCIA | 09:00 | 19:00 |
| PATRICIA DE OLIVEIRA | 10:00 | 20:00 |
| ORLIANNYS DEL CARMEN ROMERO AGUILERA | 11:00 | 21:00 |
| TAINA MARTINELLI TERRES | 12:00 | 18:00 |
| SONIA MARIA RODRIGUES JUSTINO | 12:00 | 22:00 |
| YUDISBEL MERINO TROCHE | 12:50 | 22:50 |
| TAINA IARA DENOVAC BITENCOURT | 12:50 | 22:50 |
| STEFANIE DRUZIAN WALTRICK | 12:50 | 22:50 |
| SILVANA DE FREITAS SANTOS | 12:50 | 22:50 |
| ROSMELY DE LA COROMOTO GUZMAN VIERA | 12:50 | 22:50 |
| MARYOLIS ALEXANDRA LANZA LAMAR | 12:50 | 22:50 |
| MARLENIS CAROLINA PERDOMO GUZMAN | 12:50 | 22:50 |
| MARIANGEL ANDREINA SOTILLO CEDENO | 12:50 | 22:50 |
| MARIA ANGELES YNOJOSA TOVAR | 12:50 | 22:50 |
| JAIRO RODRIGUES MOURA | 12:50 | 22:50 |
| ERICK LEONARDO BRITO ZAPATA | 12:50 | 22:50 |
| ELIZIANE SALGADO CASTURIAGA | 12:50 | 22:50 |
| DAVID ENRIQUE GARCIA RAMIREZ | 12:50 | 22:50 |
| CARMEN MARIA ASTUDILLO LOPEZ | 12:50 | 22:50 |
| CAMILA RIBEIRO DA COSTA | 12:50 | 22:50 |
| ARLENIS BATISTA GARLOBO | 12:50 | 22:50 |
| ALEJANDRA SARAHY PINO BORROME | 12:50 | 22:50 |
| JOANA PONTES | 13:00 | 19:00 |
| OLGA MARIA CHIRINOS CADENA | 16:00 | 22:00 |
| GLORIA MARIA TOVAR BETHERMY | 16:50 | 22:50 |
| FRANCIELE SILVEIRA DOS SANTOS | 16:50 | 22:50 |
| ELIAS DOS SANTOS CAMARGO | 16:50 | 22:50 |

#### Em FOLGA

- HIAGO FERNANDO VIEIRA


### Sábado (20/06/26)

> **Nota:** Paola Rio, Claudia Bertushi e Nancy Coromoto Fuentes Lopez são sempre ignoradas e não constam das escalas. Tayla Resplande Silva está em férias neste dia. Nenhum operador está em folga neste sábado.

#### Fiscais e Gerentes

| Nome | Entrada | Saída |
|------|---------|-------|
| FABIANA SIRLEI SARAFIM | 06:50 | 16:50 |
| CARMEN FELICIA | 06:50 | 16:50 |
| JOSIANE CARDOSO | 08:00 | 18:00 |
| PEDRO MUNOZ | 09:00 | 19:00 |
| SHEILA VIEIRA | 11:00 | 21:00 |
| RAQUEL SILVA DE OLIVEIRA BENETON | 11:00 | 21:00 |
| AURI NELLYS CORONADO DE GARCIA | 12:00 | 22:00 |
| YANNELIT SUBERO | 12:50 | 22:50 |
| KAREN BARRO | 12:50 | 22:50 |
| BETZABETH ELISA CASTELLANO REYES | 12:50 | 22:50 |
| ARLETE PACHECO FERNANDES | 12:50 | 22:50 |

#### Operadores trabalhando

| Operador | Entrada | Saída |
|----------|---------|-------|
| VALDIR JOSÉ | 06:50 | 16:50 |
| NAIROBI LUYANDO | 06:50 | 16:50 |
| MATHEUS HENRIQUE DA SILVA GIACOMO | 06:50 | 16:50 |
| LAURISMAR DEL CARMEN SOJO GUEVARA | 06:50 | 16:50 |
| FELIPE GUSTAVO DOS SANTOS VICENTE | 06:50 | 16:50 |
| ENEIDA JOMARA SILVA RODRIGUES | 06:50 | 16:50 |
| AILIN OCHOA | 06:50 | 16:50 |
| YESENIA DEVERA | 08:00 | 18:00 |
| NARIA PIRES | 09:00 | 19:00 |
| FRANCILEUDA MARQUES | 09:00 | 19:00 |
| EDECI SANTA LUCIA | 09:00 | 19:00 |
| PATRICIA DE OLIVEIRA | 10:00 | 20:00 |
| HIAGO FERNANDO VIEIRA | 10:00 | 20:00 |
| ORLIANNYS DEL CARMEN ROMERO AGUILERA | 11:00 | 21:00 |
| TAINA MARTINELLI TERRES | 12:00 | 18:00 |
| SONIA MARIA RODRIGUES JUSTINO | 12:00 | 22:00 |
| YUDISBEL MERINO TROCHE | 12:50 | 22:50 |
| TAINA IARA DENOVAC BITENCOURT | 12:50 | 22:50 |
| STEFANIE DRUZIAN WALTRICK | 12:50 | 22:50 |
| SILVANA DE FREITAS SANTOS | 12:50 | 22:50 |
| ROSMELY DE LA COROMOTO GUZMAN VIERA | 12:50 | 22:50 |
| MARYOLIS ALEXANDRA LANZA LAMAR | 12:50 | 22:50 |
| MARLENIS CAROLINA PERDOMO GUZMAN | 12:50 | 22:50 |
| MARIANGEL ANDREINA SOTILLO CEDENO | 12:50 | 22:50 |
| MARIA ANGELES YNOJOSA TOVAR | 12:50 | 22:50 |
| JAIRO RODRIGUES MOURA | 12:50 | 22:50 |
| ERICK LEONARDO BRITO ZAPATA | 12:50 | 22:50 |
| ELIZIANE SALGADO CASTURIAGA | 12:50 | 22:50 |
| DAVID ENRIQUE GARCIA RAMIREZ | 12:50 | 22:50 |
| CARMEN MARIA ASTUDILLO LOPEZ | 12:50 | 22:50 |
| CAMILA RIBEIRO DA COSTA | 12:50 | 22:50 |
| ARLENIS BATISTA GARLOBO | 12:50 | 22:50 |
| ALEJANDRA SARAHY PINO BORROME | 12:50 | 22:50 |
| JOANA PONTES | 13:00 | 19:00 |
| OLGA MARIA CHIRINOS CADENA | 16:00 | 22:00 |
| GLORIA MARIA TOVAR BETHERMY | 16:50 | 22:50 |
| FRANCIELE SILVEIRA DOS SANTOS | 16:50 | 22:50 |
| ELIAS DOS SANTOS CAMARGO | 16:50 | 22:50 |

#### Em FOLGA

- Nenhum operador em folga neste dia.


### Domingo — Folga fixa

> **Nota:** Toda pessoa que não tem folga em nenhum dia de segunda a sábado possui folga fixa aos domingos. As demais pessoas seguem a escala de domingo (jornada reduzida da operação). Tayla Resplande Silva está em férias. Paola Rio, Claudia Bertushi e Nancy Coromoto Fuentes Lopez são sempre ignoradas.

#### Fiscais e Gerentes com folga fixa aos domingos

- Arlete Pacheco Fernandes

#### Operadores com folga fixa aos domingos

- TAINA MARTINELLI TERRES
- JOANA PONTES
- FRANCIELE SILVEIRA DOS SANTOS
- ELIAS DOS SANTOS CAMARGO
- CAMILA RIBEIRO DA COSTA
