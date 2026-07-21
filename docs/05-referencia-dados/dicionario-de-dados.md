<!-- ⚙️ GERADO AUTOMATICAMENTE por scripts/gerar-docs.mjs — NÃO EDITE À MÃO.
     Para atualizar, rode `npm run docs:gen` e faça commit do resultado. -->

# Dicionário de Dados

> Detalhe campo a campo das **55 tabelas**. Fonte: `backend/prisma/schema.prisma`.

## `Usuario`

---------------------------- Modelos -------------------------------------

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `login` | `String` | único |  |
| `nome` | `String?` |  |  |
| `senhaHash` | `String` |  |  |
| `perfil` | `Perfil` |  |  |
| `online` | `Boolean` |  |  |
| `tokenVersion` | `Int` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `fiscal` | `Fiscal?` |  |  |
| `notificacoes` | `Notificacao[]` |  |  |
| `importacoes` | `RegistroImportacao[]` | relação |  |
| `movimentos` | `MovimentoEstoque[]` | relação |  |
| `permissoes` | `UsuarioPermissao[]` |  |  |

## `UsuarioPermissao`

acesso total e não é ajustável.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `usuarioId` | `String` |  |  |
| `funcionalidade` | `String` |  |  |
| `concedida` | `Boolean` |  |  |
| `definidoPor` | `String?` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |
| `usuario` | `Usuario` | relação |  |

## `PerfilPermissao`

ADMINISTRADOR gerencia; ADMINISTRADOR e IMPORTADOR não são ajustáveis.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `perfil` | `Perfil` |  |  |
| `funcionalidade` | `String` |  |  |
| `concedida` | `Boolean` |  |  |
| `definidoPor` | `String?` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |

## `PermissaoAuditoria`

(perfilAlvo): quem mudou, o alvo, a funcionalidade e o valor aplicado.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `usuarioAlvoId` | `String?` |  | Alvo por login (nulo quando a mudança é de um perfil inteiro). |
| `loginAlvo` | `String?` |  |  |
| `perfilAlvo` | `String?` |  | Alvo por perfil (nulo quando a mudança é de um login específico). |
| `funcionalidade` | `String` |  |  |
| `concedida` | `Boolean?` |  | padrão (ajuste removido). |
| `acao` | `String` |  |  |
| `definidoPor` | `String?` |  |  |
| `em` | `DateTime` |  |  |

## `Operador`

destrutiva). Ver também `RegistroOperacional` (mesmo fluxo antigo).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `nome` | `String` | único |  |
| `ativo` | `Boolean` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `registros` | `RegistroOperacional[]` |  |  |

## `Fiscal`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `nome` | `String` | único |  |
| `turno` | `TurnoFiscal` |  |  |
| `especial` | `Boolean` |  |  |
| `usuarioId` | `String?` | único |  |
| `criadoEm` | `DateTime` |  |  |
| `usuario` | `Usuario?` | relação |  |
| `pontos` | `RegistroPontoFiscal[]` |  |  |
| `registros` | `RegistroOperacional[]` |  |  |

## `RegistroOperacional`

lido nem escrito; mantido para histórico (sem migração destrutiva).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `tipo` | `TipoRegistro` |  |  |
| `data` | `DateTime` |  |  |
| `pessoaId` | `String` |  |  |
| `valor` | `Decimal` |  |  |
| `importacaoId` | `String?` |  |  |
| `operadorId` | `String?` |  |  |
| `fiscalId` | `String?` |  |  |
| `importacao` | `RegistroImportacao?` | relação |  |
| `operador` | `Operador?` | relação |  |
| `fiscal` | `Fiscal?` | relação |  |

## `RegistroImportacao`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `tipo` | `TipoRegistro` |  |  |
| `dataReferencia` | `DateTime` |  |  |
| `importadoEm` | `DateTime` |  |  |
| `importadoPor` | `String?` |  |  |
| `nomesNaoReconhecidos` | `Json` |  |  |
| `usuario` | `Usuario?` | relação |  |
| `registros` | `RegistroOperacional[]` |  |  |

## `VendaDiaria`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `data` | `DateTime` | único |  |
| `valor` | `Decimal` |  |  |

## `EstimativaVendaDia`

cada data. A estimativa do mês é a soma das diárias. Uma linha por data.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `data` | `DateTime` | único |  |
| `valor` | `Decimal` |  |  |

## `VendaHora`

espelhado em VendaDiaria, que alimenta os percentuais dos indicadores.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `data` | `DateTime` |  |  |
| `hora` | `Int` |  |  |
| `valor` | `Decimal` |  |  |

## `RegistroArrecadacao`

fechamento). Alimenta os indicadores (total dia/semana/mes e ranking).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `tipo` | `String` |  |  |
| `data` | `DateTime` |  |  |
| `matricula` | `String?` |  |  |
| `nome` | `String` |  |  |
| `valor` | `Decimal` |  |  |
| `quantidade` | `Int?` |  |  |
| `autorizadoPor` | `String?` |  |  |
| `motivo` | `String?` |  |  |
| `colaboradorId` | `String?` |  | brutos seguem guardados para auditoria. |
| `autorizadoPorId` | `String?` |  |  |
| `criadoEm` | `DateTime` |  |  |

## `ArrecadacaoSemMovimento`

"pendente/não enviado". Único por (tipo, data).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `tipo` | `String` |  |  |
| `data` | `DateTime` |  |  |
| `marcadoPor` | `String?` |  |  |
| `criadoEm` | `DateTime` |  |  |

## `LoteApae`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `quantidadeInicial` | `Int` |  |  |
| `saldoAtual` | `Int` |  |  |
| `quantidadeVendida` | `Int` |  |  |
| `dataInicio` | `DateTime` |  |  |
| `dataEncerramento` | `DateTime?` |  |  |
| `status` | `StatusLote` |  |  |
| `movimentos` | `MovimentoLoteApae[]` |  |  |

## `MovimentoLoteApae`

arrecadação por período (sem exigir contagem por venda — só pelo saldo).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `loteId` | `String` |  |  |
| `vendidas` | `Int` |  |  |
| `saldoApos` | `Int` |  |  |
| `em` | `DateTime` |  |  |
| `responsavelId` | `String?` |  |  |
| `lote` | `LoteApae` | relação |  |

## `ConfigApae`

arrecadação. Editável pelo gestor sem redeploy.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `precoSacola` | `Float` |  |  |
| `metaMensal` | `Float` |  |  |
| `atualizadoEm` | `DateTime` |  |  |
| `atualizadoPor` | `String?` |  |  |

## `ConfigVendas`

"sem meta definida" (a projeção é exibida sem comparação).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `metaMensal` | `Float` |  |  |
| `atualizadoEm` | `DateTime` |  |  |
| `atualizadoPor` | `String?` |  |  |

## `ConfigSistema`

qual começam os calendários do app. Editável pelo gestor sem redeploy.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `dataInicial` | `DateTime` |  |  |
| `domingoAncoraData` | `DateTime?` |  | configurado ainda. |
| `domingoAncoraGrupo` | `String?` |  | domingoOrdemGrupos (mantido por compatibilidade / 1º grupo do ciclo). |
| `domingoOrdemGrupos` | `String?` |  | (ex.: 'G1,G3,G2'). A rotação segue essa ordem e repete a cada 3 domingos. |
| `quantidadeCheckouts` | `Int` |  | define quantos check-outs aparecem na seção Check-Outs (numerados 1..N). |
| `atualizadoEm` | `DateTime` |  |  |
| `atualizadoPor` | `String?` |  |  |

## `CheckoutReporte`

histórico, sem depender de joins.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `checkoutNumero` | `Int` |  |  |
| `equipamento` | `String` |  |  |
| `descricao` | `String` |  |  |
| `fotoUrl` | `String?` |  |  |
| `status` | `String` |  | 'ABERTO' \| 'RESOLVIDO' |
| `reportadoPorId` | `String?` |  |  |
| `reportadoPorNome` | `String?` |  |  |
| `reportadoEm` | `DateTime` |  |  |
| `resolvidoPorId` | `String?` |  |  |
| `resolvidoPorNome` | `String?` |  |  |
| `resolvidoEm` | `DateTime?` |  |  |

## `Feriado`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `data` | `DateTime` | único | Data do feriado em 00:00 UTC. Único: um dia é feriado ou não. |
| `nome` | `String` |  |  |
| `ambito` | `FeriadoAmbito` |  |  |
| `automatico` | `Boolean` |  | true = semeado automaticamente (nacional); false = cadastrado pelo gestor. |
| `criadoEm` | `DateTime` |  |  |
| `criadoPorId` | `String?` |  |  |
| `criadoPorNome` | `String?` |  |  |

## `Insumo`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `nome` | `String` |  |  |
| `categoria` | `CategoriaInsumo` |  |  |
| `saldo` | `Int` |  |  |
| `limiteMinimo` | `Int` |  |  |
| `unidade` | `String` |  | Unidade base de contagem do saldo (ex.: "sacola", "bobina", "metro", "litro"). |
| `embalagem` | `String` |  | sacolas, caixa=20 bobinas, rolo=100 metros, galão=5 litros). |
| `fatorEmbalagem` | `Int` |  |  |
| `ativo` | `Boolean` |  |  |
| `movimentos` | `MovimentoEstoque[]` |  |  |
| `requisicoes` | `Requisicao[]` |  |  |
| `pedidosRecorrentes` | `PedidoRecorrente[]` |  |  |
| `sugestoes` | `SugestaoPedido[]` |  |  |

## `Fardo`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `codigoBarras` | `String` | único |  |
| `quantidadeSacolas` | `Int` |  |  |

## `MovimentoEstoque`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `insumoId` | `String` |  |  |
| `delta` | `Int` |  |  |
| `responsavelId` | `String?` |  |  |
| `dataHora` | `DateTime` |  |  |
| `destino` | `String?` |  |  |
| `pdvId` | `String?` |  |  |
| `origem` | `String?` |  | REQUISICAO, COMPRA, AJUSTE, CONSUMO, FARDO). Entradas têm delta > 0. |
| `responsavelNome` | `String?` |  | - requisitanteNome: quem SOLICITOU (apenas em entradas vindas de requisição). |
| `requisitanteNome` | `String?` |  |  |
| `insumo` | `Insumo` | relação |  |
| `responsavel` | `Usuario?` | relação |  |

## `Requisicao`

por gerente ou supervisor. Ao aprovar, gera uma entrada no estoque.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `insumoId` | `String` |  |  |
| `quantidade` | `Int` |  |  |
| `status` | `StatusRequisicao` |  |  |
| `automatica` | `Boolean` |  |  |
| `observacao` | `String?` |  |  |
| `solicitanteId` | `String?` |  |  |
| `solicitanteNome` | `String?` |  |  |
| `criadaEm` | `DateTime` |  |  |
| `decididaPorId` | `String?` |  |  |
| `decididaPorNome` | `String?` |  |  |
| `decididaEm` | `DateTime?` |  |  |
| `motivo` | `String?` |  |  |
| `insumo` | `Insumo` | relação |  |

## `SolicitacaoAdvertencia`

garantir uma única solicitação por falta (idempotência do cron).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `colaboradorId` | `String` |  |  |
| `ausenciaId` | `String` | único |  |
| `dataFalta` | `DateTime` |  |  |
| `motivo` | `String` |  |  |
| `status` | `StatusSolicitacaoAdvertencia` |  |  |
| `criadaEm` | `DateTime` |  |  |
| `decididaPorId` | `String?` |  |  |
| `decididaPorNome` | `String?` |  |  |
| `decididaEm` | `DateTime?` |  |  |
| `incidenciaId` | `String?` |  | Advertência (IncidenciaEscala) criada quando aprovada. |
| `motivoDecisao` | `String?` |  | Motivo/observação da decisão (ex.: "Falta justificada"). |

## `FechamentoConcluido`

uploads concorrentes.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `data` | `DateTime` | único |  |
| `concluidoEm` | `DateTime` |  |  |

## `BatidaPonto`

papelito (`hora`), não a de carregamento (`criadoEm`).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `clienteId` | `String?` | único | para batidas registradas direto online por versões que não a enviam. |
| `pessoaId` | `String` |  |  |
| `tipoPessoa` | `TipoPessoaPonto` |  |  |
| `colaboradorId` | `String?` |  |  |
| `data` | `DateTime` |  |  |
| `hora` | `DateTime` |  |  |
| `tipo` | `TipoBatida` |  |  |
| `origem` | `OrigemBatida` |  |  |
| `confianca` | `Float?` |  |  |
| `comprovanteUrl` | `String?` |  |  |
| `registradoPor` | `String` |  |  |
| `registradoPorNome` | `String?` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |

## `AliasLeituraPonto`

Um alias por texto lido; `usos` conta quantas vezes foi confirmado.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `textoNome` | `String` | único |  |
| `pessoaId` | `String` |  |  |
| `tipoPessoa` | `TipoPessoaPonto` |  |  |
| `colaboradorId` | `String?` |  |  |
| `nome` | `String` |  |  |
| `usos` | `Int` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |
| `pendentePessoaId` | `String?` |  | pontual não se propaga para leituras futuras. |
| `pendenteTipoPessoa` | `TipoPessoaPonto?` |  |  |
| `pendenteColaboradorId` | `String?` |  |  |
| `pendenteNome` | `String?` |  |  |
| `pendenteUsos` | `Int` |  |  |

## `RegistroPontoFiscal`

tempo de intervalo e carga horária do dia).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `fiscalId` | `String` |  |  |
| `colaboradorId` | `String?` |  |  |
| `status` | `StatusFiscal` |  |  |
| `data` | `DateTime` |  |  |
| `em` | `DateTime` |  |  |
| `fiscal` | `Fiscal` | relação |  |

## `AlertaTacEnviado`

`pessoaId` é id "solto" (fiscal ou colaborador), sem FK rígida (ADR 0005).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `pessoaId` | `String` |  |  |
| `dia` | `DateTime` |  |  |
| `etapa` | `EtapaAlertaTac` |  |  |
| `enviadoEm` | `DateTime` |  |  |

## `AlertaAtrasoEnviado`

não lança nada, apenas notifica a supervisão/gerência.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `pessoaId` | `String` |  |  |
| `dia` | `DateTime` |  |  |
| `enviadoEm` | `DateTime` |  |  |

## `EventoAlertaTac`

`AlertaTacEnviado` (que é só a trava de deduplicação): aqui fica a trilha.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `pessoaId` | `String` |  |  |
| `dia` | `DateTime` |  |  |
| `tipo` | `TipoEventoTac` |  |  |
| `etapa` | `EtapaAlertaTac?` |  |  |
| `motivos` | `String?` |  |  |
| `em` | `DateTime` |  |  |

## `CicloFolha`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `inicio` | `DateTime` | único |  |
| `fimExclusivo` | `DateTime` |  |  |
| `status` | `StatusCicloFolha` |  |  |
| `fechadoPor` | `String?` |  |  |
| `fechadoPorNome` | `String?` |  |  |
| `fechadoEm` | `DateTime?` |  |  |
| `reabertoPor` | `String?` |  |  |
| `reabertoPorNome` | `String?` |  |  |
| `reabertoEm` | `DateTime?` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |

## `CicloFolhaEvento`

quem fez, quando). `inicio` é a âncora do ciclo.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `inicio` | `DateTime` |  |  |
| `tipo` | `TipoEventoCiclo` |  |  |
| `por` | `String` |  |  |
| `porNome` | `String?` |  |  |
| `em` | `DateTime` |  |  |

## `EscalaEntry`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `funcionarioId` | `String` |  |  |
| `colaboradorId` | `String?` |  |  |
| `diaSemana` | `Int` |  |  |
| `entrada` | `String?` |  |  |
| `saida` | `String?` |  |  |
| `intervaloMin` | `Int` |  |  |
| `folga` | `Boolean` |  |  |
| `especial` | `Boolean` |  |  |

## `OperadorTurno`

As faltas pontuais ficam em `Ausencia` (pessoaId = id do Colaborador).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `nome` | `String` | único |  |
| `genero` | `String?` |  | Gênero ('M' ou 'F') para o avatar representativo. |
| `entradaSemana` | `String` |  | Horário Seg–Qui ("HH:mm"). |
| `saidaSemana` | `String` |  |  |
| `entradaFds` | `String` |  | Horário Sex–Sáb ("HH:mm"); a loja abre ~1h a mais. |
| `saidaFds` | `String` |  |  |
| `folgaDiaSemana` | `Int` |  | Dia de folga fixo: 0=Dom, 1=Seg, ..., 6=Sáb. |
| `ativo` | `Boolean` |  |  |
| `criadoEm` | `DateTime` |  |  |

## `Checklist`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `tipo` | `TipoChecklist` |  |  |
| `data` | `DateTime` |  |  |
| `status` | `StatusChecklist` |  |  |
| `imagemUrl` | `String?` |  |  |
| `enviadoPor` | `String?` |  |  |
| `enviadoEm` | `DateTime?` |  |  |
| `noPrazo` | `Boolean?` |  | Verdadeiro se a imagem foi enviada dentro da janela (pontual). |
| `imagemHash` | `String?` |  | Hash (sha256) da imagem enviada, para detectar foto repetida (anti-fraude). |

## `Ausencia`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `pessoaId` | `String` |  |  |
| `colaboradorId` | `String?` |  |  |
| `data` | `DateTime` |  |  |
| `registradaPorId` | `String?` |  | Quem registrou a falta (auditoria — 10 pessoas lançam faltas no app). |
| `registradaPorNome` | `String?` |  |  |
| `statusJustificativa` | `StatusJustificativa` |  | de quem justificou e quando. |
| `motivoJustificativa` | `MotivoJustificativa?` |  |  |
| `observacaoJustificativa` | `String?` |  |  |
| `justificadaPorId` | `String?` |  |  |
| `justificadaPorNome` | `String?` |  |  |
| `justificadaEm` | `DateTime?` |  |  |
| `debitoHoras` | `Boolean` |  | manualmente pelo gestor (falta não justificada / abonada como débito). |
| `aPrazo` | `Boolean` |  | fiscal na escala — só gerente/supervisor/administrador podem remover. |
| `automatica` | `Boolean` |  | bate o ponto; as lançadas manualmente pelo gestor permanecem. |
| `atestadoId` | `String?` |  | (sem FK rígida), no padrão do schema (ADR 0005). |
| `cid` | `String?` |  |  |

## `Notificacao`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `usuarioId` | `String` |  |  |
| `titulo` | `String` |  |  |
| `mensagem` | `String` |  |  |
| `canalPush` | `Boolean` |  |  |
| `canalInApp` | `Boolean` |  |  |
| `lida` | `Boolean` |  |  |
| `criadaEm` | `DateTime` |  |  |
| `usuario` | `Usuario` | relação |  |

## `PushToken`

seguindo o padrão do schema (ADR 0005).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `token` | `String` | único |  |
| `usuarioId` | `String` |  |  |
| `plataforma` | `String?` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |

## `MensagemAssistente`

convenção da API Gemini: 'user' (pergunta) ou 'model' (resposta).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `usuarioId` | `String` |  |  |
| `papel` | `String` |  |  |
| `conteudo` | `String` |  |  |
| `criadaEm` | `DateTime` |  |  |

## `PedidoRecorrente`

confirma ou ajusta antes de virar requisição/entrada.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `insumoId` | `String` |  |  |
| `quantidade` | `Int` |  |  |
| `frequenciaDias` | `Int` |  | Frequência em dias (7 = semanal, 15 = quinzenal). |
| `diaSugestao` | `Int` |  | Dia da semana preferencial para sugestão (1=Seg..6=Sáb, 0=Dom). |
| `ativo` | `Boolean` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `insumo` | `Insumo` | relação |  |

## `SugestaoPedido`

confirmar (vira entrada) ou ignorar.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `insumoId` | `String` |  |  |
| `quantidade` | `Int` |  |  |
| `quantidadeAjustada` | `Int?` |  | Quantidade ajustada pelo gestor (se diferente da sugestão). |
| `status` | `StatusSugestao` |  |  |
| `lote` | `String?` |  | Lote: agrupa sugestões geradas juntas (ex.: "pedido semanal 2026-06-23"). |
| `criadaEm` | `DateTime` |  |  |
| `confirmadaEm` | `DateTime?` |  |  |
| `confirmadaPor` | `String?` |  |  |
| `insumo` | `Insumo` | relação |  |

## `MetaIndicador`

editar via app sem redeploy. Quando não existe registro, usa-se o default.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `tipo` | `String` | único | Tipo do indicador (ex.: TROCO_SOLIDARIO, CANCELAMENTO_ITENS). |
| `meta` | `Float` |  | Valor da meta: R$ (base FIXA) ou % sobre vendas (base VENDAS). |
| `limiteAmarelo` | `Float?` |  | Limite do amarelo (opcional); se ausente, derivado automaticamente. |
| `atualizadoEm` | `DateTime` |  |  |
| `atualizadoPor` | `String?` |  |  |

## `MetaMensal`

usa-se o valor padrão de CONFIG_METAS (e, para VENDAS, a config legada).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `tipo` | `String` |  | Tipo da meta (ex.: VENDAS, CANCELAMENTO_ITENS). |
| `anoMes` | `String` |  | Período mensal no formato "AAAA-MM" (ex.: "2026-06"). |
| `meta` | `Float` |  | Valor da meta: R$ (vendas/recargas) ou % sobre vendas (cancelamentos/devoluções). |
| `atualizadoEm` | `DateTime` |  |  |
| `atualizadoPor` | `String?` |  |  |

## `TipoContratoJornada`

valores de hoje, sem mudança de comportamento.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `nome` | `String` | único |  |
| `descricao` | `String?` |  |  |
| `ativo` | `Boolean` |  |  |
| `padrao` | `Boolean` |  | Contrato vigente (fallback do cálculo). No máximo um deve ser `padrao`. |
| `cargaBaseMinPorDia` | `Int[]` |  | índice 0=domingo … 6=sábado). |
| `diasComAdicional100` | `Int[]` |  | Dias da semana (0=domingo) que têm adicional de 100%. |
| `maxTrabalhoSemIntervaloMin` | `Int` |  |  |
| `intervaloMinimoMin` | `Int` |  |  |
| `intervaloMaximoMin` | `Int` |  |  |
| `limiteExtrasMin` | `Int` |  |  |
| `riscoTac1h30Min` | `Int` |  |  |
| `riscoTac1h40Min` | `Int` |  |  |
| `intervaloMinimoEntreBatidasMin` | `Int` |  |  |
| `intervaloObrigatorio` | `Boolean` |  | Quando true, encerrar a jornada sem intervalo é TAC (intervalo obrigatório). |
| `trabalhaDomingo` | `Boolean` |  | o colaborador com este contrato não trabalha domingo (grupoDomingo = null). |
| `colaboradores` | `Colaborador[]` |  | Colaboradores que usam este contrato (para bloquear a remoção quando em uso). |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |

## `Colaborador`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `matricula` | `String` | único |  |
| `nome` | `String` |  |  |
| `funcao` | `FuncaoColaborador` |  |  |
| `genero` | `String?` |  |  |
| `ativo` | `Boolean` |  |  |
| `tipoContratoJornadaId` | `String` |  | (Fase 0). Relação obrigatória: apagar um tipo em uso é bloqueado (Restrict). |
| `tipoContratoJornada` | `TipoContratoJornada` | relação |  |
| `desligadoEm` | `DateTime?` |  | (proteção legal). Null enquanto o colaborador estiver ativo. |
| `dataAdmissao` | `DateTime?` |  | Data_Inicial_Sistema (admissões históricas são legítimas — ver ADR 0008). |
| `turno` | `TurnoColaborador?` |  | Escala (apenas operadores normalmente). Opcional para não obrigar fiscais. |
| `entradaSemana` | `String?` |  |  |
| `saidaSemana` | `String?` |  |  |
| `entradaFds` | `String?` |  |  |
| `saidaFds` | `String?` |  |  |
| `folgaDiaSemana` | `Int?` |  |  |
| `grupoDomingo` | `String?` |  | - entradaDom/saidaDom: horário do domingo ("HH:mm"), por pessoa. |
| `entradaDom` | `String?` |  |  |
| `saidaDom` | `String?` |  |  |
| `usuarioId` | `String?` | único | seguindo o padrão de IDs do schema. |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |
| `identificadores` | `ColaboradorIdentificador[]` |  |  |
| `ferias` | `FeriasColaborador[]` |  |  |
| `atestados` | `Atestado[]` |  |  |

## `Atestado`

o futuro (anexo do documento; depende de storage de objetos/S3).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `colaboradorId` | `String` |  |  |
| `inicio` | `DateTime` |  | Primeiro e último dia do atestado (inclusive), 00:00 UTC. |
| `fim` | `DateTime` |  |  |
| `dias` | `Int` |  | Total de dias corridos do período (fim - inicio + 1). |
| `cid` | `String?` |  | atestado é lançado explicitamente SEM CID (`semCid = true`). |
| `semCid` | `Boolean` |  | preenchido"): permite contar/relatar os atestados sem CID à parte. |
| `observacao` | `String?` |  |  |
| `fotoUrl` | `String?` |  | Anexo do documento (foto/scan). Futuro — exige storage de objetos/S3. |
| `registradaPorId` | `String?` |  | Auditoria: quem lançou o atestado. |
| `registradaPorNome` | `String?` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `colaborador` | `Colaborador` | relação |  |

## `FeriasColaborador`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `colaboradorId` | `String` |  |  |
| `inicio` | `DateTime` |  | Primeiro e último dia de férias (inclusive), 00:00 UTC. |
| `fim` | `DateTime` |  |  |
| `observacao` | `String?` |  | Nota livre do gestor (ex.: "férias 30 dias", "licença"). |
| `registradaPorId` | `String?` |  | Auditoria: quem lançou as férias. |
| `registradaPorNome` | `String?` |  |  |
| `criadaEm` | `DateTime` |  |  |
| `colaborador` | `Colaborador` | relação |  |

## `ColaboradorIdentificador`

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `colaboradorId` | `String` |  |  |
| `tipo` | `TipoIdentificador` |  |  |
| `valor` | `String` |  | Valor normalizado (login minúsculo / matrícula sem espaços). |
| `colaborador` | `Colaborador` | relação |  |

## `DecisaoContrato`

decisões + `dataAdmissao`; nada de estado redundante persistido.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `colaboradorId` | `String` |  |  |
| `marco` | `MarcoContrato` |  |  |
| `resultado` | `ResultadoDecisaoContrato` |  |  |
| `decididoPorId` | `String?` |  |  |
| `decididoPorNome` | `String?` |  |  |
| `observacao` | `String?` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |

## `Feedforward`

Uma rodada de feedforward (uma conversa/formulário) de um colaborador.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `colaboradorId` | `String` |  |  |
| `data` | `DateTime` |  |  |
| `liderId` | `String?` |  |  |
| `liderNome` | `String?` |  |  |
| `cargo` | `String?` |  |  |
| `pontosFortes` | `String?` |  |  |
| `oportunidades` | `String?` |  |  |
| `compromissoFinal` | `String?` |  |  |
| `evolucaoNota` | `Int?` |  | Nota de evolução da conversa (1 a 5), como no formulário. |
| `fotoUrl` | `String?` |  | URL da foto do formulário preenchido à mão (object storage). |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |
| `pontos` | `FeedforwardPonto[]` |  |  |

## `FeedforwardPonto`

colaborador define; ao vencer sem revisão, avisa supervisores e gerentes.

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `feedforwardId` | `String` |  |  |
| `colaboradorId` | `String` |  | Desnormalizado (para o cron/consulta sem join). |
| `descricao` | `String` |  |  |
| `prazo` | `DateTime` |  |  |
| `status` | `StatusFeedforwardPonto` |  |  |
| `revisadoPorId` | `String?` |  |  |
| `revisadoPorNome` | `String?` |  |  |
| `revisadoEm` | `DateTime?` |  |  |
| `observacaoRevisao` | `String?` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |
| `feedforward` | `Feedforward` | relação |  |

## `IncidenciaEscala`

pode ser detectado do ponto (RegistroPontoFiscal).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `colaboradorId` | `String` |  |  |
| `funcionarioId` | `String?` |  |  |
| `tipo` | `TipoIncidenciaEscala` |  |  |
| `data` | `DateTime` |  |  |
| `horaSaida` | `String?` |  |  |
| `horaEsperadaRetorno` | `String?` |  |  |
| `horaReal` | `String?` |  |  |
| `origem` | `String` |  |  |
| `motivo` | `String?` |  |  |
| `observacao` | `String?` |  |  |
| `registradoPorId` | `String?` |  |  |
| `registradoPorNome` | `String?` |  |  |
| `diasSuspensao` | `Int?` |  | incidência; causaData = a data dessa ocorrência) — informativo. |
| `dataFim` | `DateTime?` |  |  |
| `causaTipo` | `String?` |  |  |
| `causaData` | `DateTime?` |  |  |
| `statusJustificativa` | `StatusJustificativa` |  | são específicos da justificativa. |
| `motivoJustificativa` | `MotivoJustificativa?` |  |  |
| `observacaoJustificativa` | `String?` |  |  |
| `justificadaPorId` | `String?` |  |  |
| `justificadaPorNome` | `String?` |  |  |
| `justificadaEm` | `DateTime?` |  |  |
| `criadoEm` | `DateTime` |  |  |
| `atualizadoEm` | `DateTime` |  |  |

## `ProdutoPesado`

futura (a foto exige um storage de objetos/S3, ainda não disponível).

| Campo | Tipo | Chave | Descrição |
|---|---|---|---|
| `id` | `String` | PK |  |
| `codigo` | `String` |  |  |
| `nome` | `String` |  |  |
| `nomeNormalizado` | `String` |  |  |
| `categoria` | `String` |  |  |
| `tipo` | `String?` |  |  |
| `descricao` | `String?` |  |  |
| `fotoUrl` | `String?` |  |  |
| `atualizadoEm` | `DateTime` |  |  |

