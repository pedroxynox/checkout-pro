# Requirements Document

## Introduction

Esta feature (Check-out PRO) evolui a **nota de perfil do colaborador** ("Score de
Saúde") para que ela seja **minuciosa, proporcional e determinística**: em vez de
uma nota grossa/fixa, a nota deve refletir de forma granular tudo o que o operador
fez no período, comparando o desempenho real contra uma **meta individual
derivada** da meta global. Ao mesmo tempo, habilita o **marcado manual de "não
retorno do intervalo" para OPERADORES** a partir da escala/perfil (hoje esse
evento só é auto-detectado do ponto para fiscais), reaproveitando a tabela
genérica `IncidenciaEscala` (tipo `NAO_RETORNO_INTERVALO`), sem tabelas novas
(ADR 0007). O "não retorno do intervalo" passa a **penalizar o componente de
Disciplina** da nota (não cria um componente separado).

Toda a lógica de pontuação é **pura, determinística e sem IA**, exercitável por
testes de propriedade (fast-check), e a nota final continua no intervalo 0–100
com semáforo (BOM/ATENCAO/CRITICO), expondo seus componentes (sub-notas + pesos)
para transparência no perfil.

### Escopo verificado no código (contexto)

- `backend/src/colaboradores/perfil-colaborador.domain.ts` (`calcularScore`)
  combina hoje Assiduidade (peso 0,4), Contribuição (0,3) e Disciplina (0,3) para
  operadores; **não** inclui incidências/não-retornos.
- Metas: tabela `MetaIndicador` (global) e `MetaMensalIndicador` (por mês); config
  padrão em `arrecadacao.domain.ts` (`CONFIG_ARRECADACAO`).
- Operadores são `Colaborador` com `funcao = OPERADOR` e `folgaDiaSemana` (dia de
  folga fixa); `Operador` é modelo deprecado.
- Marcado de incidências já existe no backend (`POST /escala/incidencias`,
  permissão `OPERADORES_AUSENCIAS`) e no modal
  `mobile/src/screens/fiscais/RegistrarIncidenciaModal.tsx`, hoje exposto apenas
  no fluxo de fiscais. O backend já aceita `funcionarioId` nulo.

## Glossary

- **Sistema_Perfil**: componente de domínio que monta o perfil do colaborador e
  calcula o Score de Saúde (`perfil-colaborador.domain.ts` / `.service.ts`).
- **Sistema_Incidencias**: componente que registra, edita, remove e analisa
  incidências de escala (`incidencias.domain.ts` / `.service.ts`).
- **UI_Escala_Operador**: fluxo do app mobile pelo qual o gestor marca eventos de
  escala (faltas/incidências) de um operador, a partir da escala ou do perfil.
- **Colaborador**: pessoa do Cadastro Unificado; um **Operador** é um Colaborador
  com `funcao = OPERADOR`.
- **Operador_Ativo**: Colaborador com `funcao = OPERADOR` e `ativo = true` no
  período avaliado.
- **Incidencia_Nao_Retorno**: registro de `IncidenciaEscala` com
  `tipo = NAO_RETORNO_INTERVALO` associado a um Colaborador em uma data.
- **Meta_Global_Mensal**: meta mensal configurada de um indicador "maior é
  melhor" (ex.: `TROCO_SOLIDARIO`, `RECARGAS_CELULAR`), obtida das metas do
  sistema com fallback ao valor padrão da configuração.
- **Dias_Escalados**: quantidade de dias em que o Operador estava escalado no
  período (dias do período cujo dia-da-semana difere de `folgaDiaSemana`).
- **Meta_Individual_Derivada**: aporte diário esperado de um Operador em um
  indicador "maior é melhor", derivado da Meta_Global_Mensal, do número de
  Operadores_Ativos e dos Dias_Escalados do Operador no período.
- **Componente_Score**: sub-nota (0–100) com um peso, que compõe o Score de
  Saúde (ex.: Assiduidade, Contribuição, Disciplina).
- **Componente_Disciplina**: Componente_Score de "menor é melhor" que agrega
  cancelamentos (itens + cupom) e o não retorno do intervalo.
- **Score_Saude**: nota final do colaborador (0–100) com nível
  (BOM/ATENCAO/CRITICO) e a lista de Componentes_Score.
- **Linha_Base_Disciplina**: referência justa contra a qual a disciplina é
  medida (ex.: média da equipe do indicador ou percentual sobre Dias_Escalados).

## Requirements

### Requirement 1: Marcado manual de "não retorno do intervalo" para operadores

**User Story:** Como gestor, quero marcar manualmente o "não retorno do
intervalo" de um operador a partir da escala/perfil, para registrar o evento
mesmo sem detecção automática de ponto (que só existe para fiscais).

#### Acceptance Criteria

1. WHEN o gestor confirma o marcado de "não retorno do intervalo" para um Colaborador com `funcao = OPERADOR` em uma data, THE Sistema_Incidencias SHALL registrar uma Incidencia_Nao_Retorno reutilizando a tabela genérica `IncidenciaEscala`, sem criar tabelas novas.
2. WHERE o Colaborador não possui vínculo de Fiscal, THE Sistema_Incidencias SHALL registrar a Incidencia_Nao_Retorno com `funcionarioId` nulo.
3. WHEN uma Incidencia_Nao_Retorno é registrada, THE Sistema_Incidencias SHALL gravar o tipo `NAO_RETORNO_INTERVALO`, a origem `MANUAL` e a data informada.
4. IF já existe uma Incidencia_Nao_Retorno para o mesmo Colaborador, tipo e data, THEN THE Sistema_Incidencias SHALL rejeitar o registro duplicado e preservar o registro existente.
5. IF o Colaborador informado não existe no cadastro, THEN THE Sistema_Incidencias SHALL rejeitar o registro e retornar um erro de dados inválidos.
6. WHERE o Colaborador é um Operador, THE UI_Escala_Operador SHALL disponibilizar o fluxo de marcado de "não retorno do intervalo" a partir da escala ou do perfil do operador.
7. THE Sistema_Incidencias SHALL exigir a permissão `OPERADORES_AUSENCIAS` para registrar, editar ou remover uma Incidencia_Nao_Retorno de operador.
8. WHEN o gestor remove uma Incidencia_Nao_Retorno existente de um operador, THE Sistema_Incidencias SHALL excluir o registro e mantê-lo fora das análises subsequentes.

### Requirement 2: Meta individual derivada para indicadores "maior é melhor"

**User Story:** Como gestor, quero que a meta de cada operador seja derivada da
meta global (proporcional ao número de operadores e aos dias em que ele foi
escalado), para avaliar cada um de forma justa e proporcional.

#### Acceptance Criteria

1. THE Sistema_Perfil SHALL calcular a Meta_Individual_Derivada de um indicador "maior é melhor" como Meta_Global_Mensal dividida pelo número de Operadores_Ativos e depois pelos Dias_Escalados do Operador no período.
2. WHEN a Meta_Global_Mensal, o número de Operadores_Ativos e os Dias_Escalados são todos maiores que zero, THE Sistema_Perfil SHALL produzir uma Meta_Individual_Derivada estritamente positiva.
3. IF o número de Operadores_Ativos é zero ou os Dias_Escalados do Operador são zero, THEN THE Sistema_Perfil SHALL tratar a Meta_Individual_Derivada como indefinida e evitar divisão por zero, atribuindo ao componente de Contribuição uma sub-nota neutra determinística.
4. THE Sistema_Perfil SHALL aplicar a mesma regra de derivação para os indicadores `TROCO_SOLIDARIO` e `RECARGAS_CELULAR`.
5. THE Sistema_Perfil SHALL contar os Dias_Escalados de um Operador como os dias do período cujo dia-da-semana difere do `folgaDiaSemana` do Operador.

### Requirement 3: Componente de Contribuição proporcional ao desempenho real

**User Story:** Como gestor, quero que a sub-nota de contribuição do operador
suba ou desça proporcionalmente ao quanto ele arrecadou frente à meta individual,
para que a nota reflita o esforço real.

#### Acceptance Criteria

1. THE Sistema_Perfil SHALL calcular a sub-nota de Contribuição como proporcional à razão entre o aporte real do Operador (soma de `TROCO_SOLIDARIO` e `RECARGAS_CELULAR`) e a Meta_Individual_Derivada correspondente.
2. THE Sistema_Perfil SHALL limitar a sub-nota de Contribuição ao intervalo fechado [0, 100].
3. WHEN o aporte real do Operador é maior ou igual à Meta_Individual_Derivada, THE Sistema_Perfil SHALL atribuir à sub-nota de Contribuição o valor máximo de 100.
4. WHEN o aporte real de um Operador é maior que o aporte real de outro Operador, com a mesma Meta_Individual_Derivada e demais fatores iguais, THE Sistema_Perfil SHALL atribuir uma sub-nota de Contribuição maior ou igual ao Operador de maior aporte.

### Requirement 4: Componente de Disciplina penalizado por cancelamentos e não retorno

**User Story:** Como gestor, quero que a indisciplina (cancelamentos em excesso e
não retorno do intervalo) reduza a nota de forma proporcional a uma linha de base
justa, para diferenciar quem mantém a operação em ordem.

#### Acceptance Criteria

1. THE Sistema_Perfil SHALL calcular a sub-nota de Componente_Disciplina de forma proporcional ao desvio do Operador em relação à Linha_Base_Disciplina, para indicadores "menor é melhor".
2. THE Sistema_Perfil SHALL incluir no Componente_Disciplina os cancelamentos de itens (`CANCELAMENTO_ITENS`) e de cupom (`CANCELAMENTO_CUPOM`).
3. THE Sistema_Perfil SHALL incluir a contagem de Incidencia_Nao_Retorno do Operador no período como fator de penalização do Componente_Disciplina.
4. WHEN dois Operadores têm os mesmos cancelamentos e o mesmo contexto, mas um tem mais Incidencia_Nao_Retorno que o outro, THE Sistema_Perfil SHALL atribuir uma sub-nota de Componente_Disciplina menor ou igual ao Operador com mais incidências.
5. THE Sistema_Perfil SHALL limitar a sub-nota de Componente_Disciplina ao intervalo fechado [0, 100].
6. WHEN o Operador está em ou abaixo da Linha_Base_Disciplina em cancelamentos e não possui Incidencia_Nao_Retorno no período, THE Sistema_Perfil SHALL atribuir à sub-nota de Componente_Disciplina o valor máximo de 100.
7. THE Sistema_Perfil SHALL manter o não retorno do intervalo como fator do Componente_Disciplina existente, sem criar um componente de score separado.

### Requirement 5: Componente de Assiduidade integrado

**User Story:** Como gestor, quero que as faltas continuem pesando na nota do
operador, para que a assiduidade siga sendo parte do quadro geral de saúde.

#### Acceptance Criteria

1. THE Sistema_Perfil SHALL calcular a sub-nota de Assiduidade a partir da taxa de faltas do Operador no período.
2. WHEN a taxa de faltas de um Operador é maior que a de outro, com os demais fatores iguais, THE Sistema_Perfil SHALL atribuir uma sub-nota de Assiduidade menor ou igual ao Operador com maior taxa de faltas.
3. THE Sistema_Perfil SHALL limitar a sub-nota de Assiduidade ao intervalo fechado [0, 100].

### Requirement 6: Nota final composta, proporcional e com semáforo

**User Story:** Como gestor, quero uma nota final de 0 a 100 com semáforo que se
mova proporcionalmente ao desempenho real do operador, para ter uma leitura
rápida e confiável.

#### Acceptance Criteria

1. THE Sistema_Perfil SHALL calcular o Score_Saude como a média ponderada das sub-notas dos Componentes_Score presentes, usando pesos normalizados de forma que a soma dos pesos aplicados seja igual a 1.
2. THE Sistema_Perfil SHALL produzir um Score_Saude no intervalo fechado [0, 100] para qualquer entrada válida.
3. WHEN o Score_Saude é maior ou igual a 80, THE Sistema_Perfil SHALL classificar o nível como `BOM`.
4. WHILE o Score_Saude está entre 60 (inclusive) e 80 (exclusive), THE Sistema_Perfil SHALL classificar o nível como `ATENCAO`.
5. IF o Score_Saude é menor que 60, THEN THE Sistema_Perfil SHALL classificar o nível como `CRITICO`.
6. WHEN a sub-nota de um Componente_Score aumenta e as demais permanecem iguais, THE Sistema_Perfil SHALL produzir um Score_Saude maior ou igual ao anterior (monotonicidade).

### Requirement 7: Transparência dos componentes da nota

**User Story:** Como gestor, quero ver do que a nota é feita (sub-notas e pesos),
para explicar e justificar a avaliação a cada operador.

#### Acceptance Criteria

1. WHEN o Sistema_Perfil retorna o Score_Saude, THE Sistema_Perfil SHALL incluir a lista de Componentes_Score com chave, rótulo, valor (0–100) e peso de cada um.
2. THE Sistema_Perfil SHALL expor o Componente_Disciplina de modo que o efeito do não retorno do intervalo seja visível no valor do componente.
3. THE Sistema_Perfil SHALL incluir, para operadores, os componentes de Assiduidade, Contribuição e Disciplina sempre que os respectivos dados estiverem disponíveis no período.

### Requirement 8: Determinismo da pontuação

**User Story:** Como gestor, quero que a mesma situação sempre gere a mesma nota,
para confiar que a avaliação é objetiva e sem "caixa-preta" de IA.

#### Acceptance Criteria

1. WHEN o Score_Saude é calculado duas vezes para a mesma entrada, THE Sistema_Perfil SHALL produzir exatamente o mesmo resultado (valor, nível e componentes).
2. THE Sistema_Perfil SHALL calcular o Score_Saude sem chamadas a serviços de IA e sem fontes de aleatoriedade.
