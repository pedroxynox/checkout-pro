<!-- ⚙️ GERADO AUTOMATICAMENTE por scripts/gerar-docs.mjs — NÃO EDITE À MÃO.
     Para atualizar, rode `npm run docs:gen` e faça commit do resultado. -->

# Modelo de Dados (Prisma)

> Fonte: `backend/prisma/schema.prisma`. Total: **51 tabelas** e **29 tipos (enums)**.

Para o detalhe campo a campo de cada tabela, veja o [Dicionário de Dados](./dicionario-de-dados.md).

## Tabelas

| Tabela | Campos | Descrição |
|---|---|---|
| `Usuario` | 13 | ---------------------------- Modelos ------------------------------------- |
| `UsuarioPermissao` | 8 | acesso total e não é ajustável. |
| `PerfilPermissao` | 7 | ADMINISTRADOR gerencia; ADMINISTRADOR e IMPORTADOR não são ajustáveis. |
| `PermissaoAuditoria` | 9 | (perfilAlvo): quem mudou, o alvo, a funcionalidade e o valor aplicado. |
| `Operador` | 5 | destrutiva). Ver também `RegistroOperacional` (mesmo fluxo antigo). |
| `Fiscal` | 9 | — |
| `RegistroOperacional` | 11 | lido nem escrito; mantido para histórico (sem migração destrutiva). |
| `RegistroImportacao` | 8 | — |
| `VendaDiaria` | 3 | — |
| `EstimativaVendaDia` | 3 | cada data. A estimativa do mês é a soma das diárias. Uma linha por data. |
| `VendaHora` | 4 | espelhado em VendaDiaria, que alimenta os percentuais dos indicadores. |
| `RegistroArrecadacao` | 12 | fechamento). Alimenta os indicadores (total dia/semana/mes e ranking). |
| `ArrecadacaoSemMovimento` | 5 | "pendente/não enviado". Único por (tipo, data). |
| `LoteApae` | 8 | — |
| `MovimentoLoteApae` | 7 | arrecadação por período (sem exigir contagem por venda — só pelo saldo). |
| `ConfigApae` | 5 | arrecadação. Editável pelo gestor sem redeploy. |
| `ConfigVendas` | 4 | "sem meta definida" (a projeção é exibida sem comparação). |
| `ConfigSistema` | 8 | qual começam os calendários do app. Editável pelo gestor sem redeploy. |
| `CheckoutReporte` | 12 | histórico, sem depender de joins. |
| `Feriado` | 8 | — |
| `Insumo` | 13 | — |
| `Fardo` | 3 | — |
| `MovimentoEstoque` | 12 | — |
| `Requisicao` | 14 | por gerente ou supervisor. Ao aprovar, gera uma entrada no estoque. |
| `SolicitacaoAdvertencia` | 12 | garantir uma única solicitação por falta (idempotência do cron). |
| `FechamentoConcluido` | 3 | uploads concorrentes. |
| `BatidaPonto` | 15 | papelito (`hora`), não a de carregamento (`criadoEm`). |
| `AliasLeituraPonto` | 14 | Um alias por texto lido; `usos` conta quantas vezes foi confirmado. |
| `RegistroPontoFiscal` | 7 | tempo de intervalo e carga horária do dia). |
| `AlertaTacEnviado` | 5 | `pessoaId` é id "solto" (fiscal ou colaborador), sem FK rígida (ADR 0005). |
| `EventoAlertaTac` | 7 | `AlertaTacEnviado` (que é só a trava de deduplicação): aqui fica a trilha. |
| `CicloFolha` | 12 | — |
| `CicloFolhaEvento` | 6 | quem fez, quando). `inicio` é a âncora do ciclo. |
| `EscalaEntry` | 9 | — |
| `OperadorTurno` | 10 | As faltas pontuais ficam em `Ausencia` (pessoaId = id do Colaborador). |
| `Checklist` | 9 | — |
| `Ausencia` | 15 | — |
| `Notificacao` | 9 | — |
| `PushToken` | 6 | seguindo o padrão do schema (ADR 0005). |
| `MensagemAssistente` | 5 | convenção da API Gemini: 'user' (pergunta) ou 'model' (resposta). |
| `PedidoRecorrente` | 8 | confirma ou ajusta antes de virar requisição/entrada. |
| `SugestaoPedido` | 10 | confirmar (vira entrada) ou ignorar. |
| `MetaIndicador` | 6 | editar via app sem redeploy. Quando não existe registro, usa-se o default. |
| `MetaMensal` | 6 | usa-se o valor padrão de CONFIG_METAS (e, para VENDAS, a config legada). |
| `TipoContratoJornada` | 19 | valores de hoje, sem mudança de comportamento. |
| `Colaborador` | 24 | — |
| `ColaboradorIdentificador` | 5 | — |
| `DecisaoContrato` | 9 | decisões + `dataAdmissao`; nada de estado redundante persistido. |
| `Feedforward` | 14 | Uma rodada de feedforward (uma conversa/formulário) de um colaborador. |
| `FeedforwardPonto` | 13 | colaborador define; ao vencer sem revisão, avisa supervisores e gerentes. |
| `IncidenciaEscala` | 25 | pode ser detectado do ponto (RegistroPontoFiscal). |

## Relações (referências entre tabelas)

| Tabela | Campo | Referencia |
|---|---|---|
| `Usuario` | `fiscal` | `Fiscal?` |
| `Usuario` | `notificacoes` | `Notificacao[]` |
| `Usuario` | `importacoes` | `RegistroImportacao[]` |
| `Usuario` | `movimentos` | `MovimentoEstoque[]` |
| `Usuario` | `permissoes` | `UsuarioPermissao[]` |
| `UsuarioPermissao` | `usuario` | `Usuario` |
| `Operador` | `registros` | `RegistroOperacional[]` |
| `Fiscal` | `usuario` | `Usuario?` |
| `Fiscal` | `pontos` | `RegistroPontoFiscal[]` |
| `Fiscal` | `registros` | `RegistroOperacional[]` |
| `RegistroOperacional` | `importacao` | `RegistroImportacao?` |
| `RegistroOperacional` | `operador` | `Operador?` |
| `RegistroOperacional` | `fiscal` | `Fiscal?` |
| `RegistroImportacao` | `usuario` | `Usuario?` |
| `RegistroImportacao` | `registros` | `RegistroOperacional[]` |
| `LoteApae` | `movimentos` | `MovimentoLoteApae[]` |
| `MovimentoLoteApae` | `lote` | `LoteApae` |
| `Insumo` | `movimentos` | `MovimentoEstoque[]` |
| `Insumo` | `requisicoes` | `Requisicao[]` |
| `Insumo` | `pedidosRecorrentes` | `PedidoRecorrente[]` |
| `Insumo` | `sugestoes` | `SugestaoPedido[]` |
| `MovimentoEstoque` | `insumo` | `Insumo` |
| `MovimentoEstoque` | `responsavel` | `Usuario?` |
| `Requisicao` | `insumo` | `Insumo` |
| `RegistroPontoFiscal` | `fiscal` | `Fiscal` |
| `Notificacao` | `usuario` | `Usuario` |
| `PedidoRecorrente` | `insumo` | `Insumo` |
| `SugestaoPedido` | `insumo` | `Insumo` |
| `TipoContratoJornada` | `colaboradores` | `Colaborador[]` |
| `Colaborador` | `tipoContratoJornada` | `TipoContratoJornada?` |
| `Colaborador` | `identificadores` | `ColaboradorIdentificador[]` |
| `ColaboradorIdentificador` | `colaborador` | `Colaborador` |
| `Feedforward` | `pontos` | `FeedforwardPonto[]` |
| `FeedforwardPonto` | `feedforward` | `Feedforward` |

## Tipos / Estados (enums)

### `Perfil`

----------------------------- Enums --------------------------------------

- `GERENTE`
- `ADMINISTRADOR`
- `SUPERVISOR`
- `FISCAL`
- `IMPORTADOR`

### `TipoRegistro`

Tipo de registro operacional / tipo de arquivo de importação.

- `CANCELAMENTO`
- `TROCO`
- `RECARGA`
- `DEVOLUCAO`

### `CategoriaInsumo`

- `SACOLA`
- `BOBINA`
- `PANO`
- `ALCOOL`
- `OUTRO`

### `StatusLote`

- `ABERTO`
- `ENCERRADO`

### `StatusChecklist`

- `PENDENTE`
- `FEITO`

### `TipoChecklist`

- `ABERTURA`
- `FECHAMENTO`

### `StatusFiscal`

- `DISPONIVEL`
- `INTERVALO`
- `FORA_EXPEDIENTE`

### `StatusRequisicao`

- `PENDENTE`
- `APROVADA`
- `NEGADA`

### `StatusSolicitacaoAdvertencia`

carregada em Sanções; CANCELADA = descartada (ex.: falta foi justificada).

- `PENDENTE`
- `APROVADA`
- `CANCELADA`

### `TurnoFiscal`

- `ABERTURA`
- `INTERMEDIARIO`
- `FECHAMENTO`

### `TipoIncidenciaEscala`

sem novas tabelas. O primeiro evento é "não retornou do intervalo".

- `NAO_RETORNO_INTERVALO`
- `ATRASO`
- `SAIDA_ANTECIPADA`
- `RETORNO_TARDIO`
- `ADVERTENCIA`
- `SUSPENSAO`

### `FeriadoAmbito`

(carga de domingo + extras a 100%), porém sem o rodízio por grupos.

- `NACIONAL`
- `ESTADUAL`
- `MUNICIPAL`

### `TipoBatida`

da 5ª.

- `ENTRADA`
- `SAIDA_INTERVALO`
- `RETORNO_INTERVALO`
- `ENCERRAMENTO`
- `EXTRA`

### `OrigemBatida`

EDITADO (corrigida depois).

- `MANUAL`
- `LEITOR`
- `EDITADO`

### `TipoPessoaPonto`

Tipo da pessoa dona da batida (padrão polimórfico, para estender a operadores).

- `FISCAL`
- `OPERADOR`

### `EtapaAlertaTac`

de horas extras (risco) e o próprio TAC.

- `RISCO_1H30`
- `RISCO_1H40`
- `TAC`

### `TipoEventoTac`

  dia — uma situação nova de verdade, não a repetição do mesmo estado.

- `AVISADO`
- `CORRIGIDO`
- `REINCIDENTE`

### `StatusCicloFolha`

ABERTO, mantendo o registro de quem fechou/reabriu.

- `ABERTO`
- `FECHADO`

### `TipoEventoCiclo`

Tipo de evento na trilha de um ciclo (fechamento/reabertura).

- `FECHADO`
- `REABERTO`

### `StatusJustificativa`

INJUSTIFICADA = analisada e confirmada como falta real.

- `PENDENTE`
- `JUSTIFICADA`
- `INJUSTIFICADA`

### `MotivoJustificativa`

demais motivos justificados pesam pouco; PENDENTE/INJUSTIFICADA pesam integral.

- `ATESTADO_MEDICO`
- `ABONADA`
- `LICENCA`
- `ATRASO_JUSTIFICADO`
- `OUTRO`

### `StatusSugestao`

- `PENDENTE`
- `CONFIRMADA`
- `IGNORADA`

### `FuncaoColaborador`

convive com Operador/OperadorTurno/Fiscal (que seguem alimentando as telas).

- `OPERADOR`
- `FISCAL`
- `SUPERVISOR`
- `GESTOR`

### `TipoContrato`

intervalo fora da jornada). Futuros contratos terão outras regras.

- `SEIS_X_UM_DOIS_X_UM`

### `TurnoColaborador`

- `ABERTURA`
- `INTERMEDIARIO`
- `FECHAMENTO`
- `APOIO`

### `TipoIdentificador`

- `MATRICULA`
- `LOGIN`

### `MarcoContrato`

2ª fase (90 dias). Genérico o suficiente para o ciclo 45 + 45.

- `MARCO_45`
- `MARCO_90`

### `ResultadoDecisaoContrato`

Resultado de uma decisão de contrato num marco.

- `APROVADO`
- `REPROVADO`

### `StatusFeedforwardPonto`

Estado de um ponto a melhorar (com prazo) de uma rodada de feedforward.

- `PENDENTE`
- `ATINGIDO`
- `NAO_ATINGIDO`

