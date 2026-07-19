<!-- ⚙️ GERADO AUTOMATICAMENTE por scripts/gerar-docs.mjs — NÃO EDITE À MÃO.
     Para atualizar, rode `npm run docs:gen` e faça commit do resultado. -->

# Referência da API HTTP

> **196 rotas** expostas pelo backend, agrupadas por módulo. Coluna "Permissão" = funcionalidade exigida (ver [Perfis e Permissões](../01-produto/perfis-e-permissoes.md)).

## `acessos`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/acessos/login` | `login` | `—` |
| GET | `/acessos/eu` | `eu` | `—` |

## `advertencias`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/advertencias/solicitacoes/pendentes` | `listarPendentes` | `ADVERTENCIAS_DECIDIR` |
| GET | `/advertencias/solicitacoes/pendentes/contagem` | `contagem` | `ADVERTENCIAS_DECIDIR` |
| POST | `/advertencias/solicitacoes/:id/aprovar` | `aprovar` | `ADVERTENCIAS_DECIDIR` |
| POST | `/advertencias/solicitacoes/:id/cancelar` | `cancelar` | `ADVERTENCIAS_DECIDIR` |

## `app.controller.ts`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/` | `info` | `—` |
| GET | `/health` | `health` | `—` |
| GET | `/health/ready` | `prontidao` | `—` |

## `arrecadacao`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/arrecadacao/upload` | `upload` | `IMPORTACOES` |
| GET | `/arrecadacao/resumo` | `resumo` | `INDICADORES_VISUALIZAR` |
| GET | `/arrecadacao/status` | `status` | `INDICADORES_VISUALIZAR` |
| POST | `/arrecadacao/sem-movimento` | `marcarSemMovimento` | `IMPORTACOES` |
| DELETE | `/arrecadacao/sem-movimento` | `removerSemMovimento` | `IMPORTACOES` |
| GET | `/arrecadacao/ranking` | `ranking` | `INDICADORES_VISUALIZAR` |
| GET | `/arrecadacao/detalhes` | `detalhes` | `INDICADORES_VISUALIZAR` |
| GET | `/arrecadacao/nao-reconhecidos/resumo` | `naoReconhecidosResumo` | `INDICADORES_VISUALIZAR` |
| GET | `/arrecadacao/nao-reconhecidos` | `listarNaoReconhecidos` | `OPERADORES_CRUD` |
| GET | `/arrecadacao/metas` | `metas` | `INDICADORES_VISUALIZAR` |
| POST | `/arrecadacao/metas` | `definirMeta` | `ADMIN_DADOS` |
| GET | `/arrecadacao/tendencia` | `tendencia` | `INDICADORES_VISUALIZAR` |
| GET | `/arrecadacao/comparativo` | `comparativo` | `INDICADORES_VISUALIZAR` |
| GET | `/arrecadacao/projecao` | `projecao` | `INDICADORES_VISUALIZAR` |
| GET | `/arrecadacao/destaques-mes` | `destaquesMes` | `INDICADORES_VISUALIZAR` |
| GET | `/arrecadacao/anomalias` | `anomalias` | `INDICADORES_VISUALIZAR` |
| GET | `/arrecadacao/painel-atencao` | `painelAtencao` | `INDICADORES_VISUALIZAR` |

## `assistente`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/assistente/status` | `status` | `—` |
| GET | `/assistente/conversa` | `conversa` | `—` |
| POST | `/assistente/mensagem` | `enviar` | `—` |
| DELETE | `/assistente/conversa` | `limpar` | `—` |

## `central-jornada`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/central-jornada` | `resumo` | `CENTRAL_JORNADA` |
| GET | `/central-jornada/inconsistencias` | `inconsistencias` | `CENTRAL_JORNADA` |
| GET | `/central-jornada/exportacao` | `exportacao` | `CENTRAL_JORNADA` |
| GET | `/central-jornada/comparativos` | `comparativos` | `CENTRAL_JORNADA` |
| GET | `/central-jornada/pessoa/:id` | `pessoa` | `CENTRAL_JORNADA` |
| POST | `/central-jornada/ausencia/:id/debito` | `marcarDebito` | `CENTRAL_JORNADA` |

## `checklist`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/checklist/:tipo` | `garantir` | `CHECKLIST` |
| POST | `/checklist/:tipo/imagem` | `enviarImagem` | `CHECKLIST` |
| GET | `/checklist/estado` | `estado` | `CHECKLIST` |
| GET | `/checklist/metricas` | `metricas` | `CHECKLIST` |
| GET | `/checklist/historico` | `historico` | `CHECKLIST` |
| GET | `/checklist/historico-mes` | `historicoMes` | `CHECKLIST` |
| GET | `/checklist/:tipo/status` | `status` | `CHECKLIST` |
| GET | `/checklist/:tipo/janela` | `janela` | `CHECKLIST` |

## `checkouts`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/checkouts` | `tablero` | `CHECKOUTS` |
| GET | `/checkouts/config` | `config` | `CHECKOUTS` |
| PUT | `/checkouts/config` | `definirConfig` | `OPERADORES_CRUD` |
| GET | `/checkouts/reportes` | `listarReportes` | `CHECKOUTS` |
| POST | `/checkouts/reportes/:id/resolver` | `resolver` | `CHECKOUTS_GERENCIAR` |
| GET | `/checkouts/:numero` | `reportesDoCheckout` | `CHECKOUTS` |
| POST | `/checkouts/:numero/reportes` | `criarReporte` | `CHECKOUTS` |

## `ciclo-folha`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/ciclo-folha/status` | `status` | `CENTRAL_JORNADA` |
| GET | `/ciclo-folha/eventos` | `eventos` | `CENTRAL_JORNADA` |
| POST | `/ciclo-folha/fechar` | `fechar` | `CENTRAL_JORNADA` |
| POST | `/ciclo-folha/reabrir` | `reabrir` | `ADMIN_DADOS` |

## `colaboradores`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/colaboradores/purga-inativos` | `purgarInativos` | `ADMIN_DADOS` |
| POST | `/colaboradores` | `cadastrar` | `OPERADORES_CRUD` |
| GET | `/colaboradores` | `listar` | `OPERADORES_AUSENCIAS` |
| GET | `/colaboradores/logins` | `logins` | `OPERADORES_CRUD` |
| GET | `/colaboradores/:id` | `obter` | `OPERADORES_AUSENCIAS` |
| GET | `/colaboradores/:id/perfil` | `perfil` | `OPERADORES_AUSENCIAS` |
| PATCH | `/colaboradores/:id` | `editar` | `OPERADORES_CRUD` |
| POST | `/colaboradores/:id/inativar` | `inativar` | `OPERADORES_CRUD` |
| POST | `/colaboradores/:id/reativar` | `reativar` | `OPERADORES_CRUD` |
| POST | `/colaboradores/:id/identificadores` | `adicionarIdentificador` | `OPERADORES_CRUD` |

## `contratos`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/contratos` | `listar` | `CONTRATOS_VISUALIZAR` |
| GET | `/contratos/resumo` | `resumo` | `CONTRATOS_VISUALIZAR` |
| GET | `/contratos/:colaboradorId` | `doColaborador` | `CONTRATOS_VISUALIZAR` |
| PATCH | `/contratos/:colaboradorId/admissao` | `definirAdmissao` | `CONTRATOS_GERIR` |
| POST | `/contratos/:colaboradorId/decisao` | `registrarDecisao` | `CONTRATOS_GERIR` |

## `data-inicial`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/config/data-inicial` | `obter` | `—` |
| PATCH | `/config/data-inicial` | `editar` | `ADMIN_DADOS` |

## `escala-domingo`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/config/escala-domingo` | `obter` | `—` |
| PUT | `/config/escala-domingo` | `definir` | `ESCALA_DOMINGO_CONFIG` |

## `fechamento`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/fechamento/resumo` | `resumo` | `FECHAMENTO` |

## `feedforward`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/feedforward/colaborador/:colaboradorId` | `listarDoColaborador` | `FEEDFORWARD_VISUALIZAR` |
| POST | `/feedforward` | `criar` | `FEEDFORWARD_GERIR` |
| POST | `/feedforward/:id/foto` | `enviarFoto` | `FEEDFORWARD_GERIR` |
| PATCH | `/feedforward/ponto/:pontoId/revisar` | `revisarPonto` | `FEEDFORWARD_GERIR` |
| DELETE | `/feedforward/:id` | `remover` | `FEEDFORWARD_GERIR` |

## `feriados`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/feriados` | `listar` | `CENTRAL_JORNADA` |
| POST | `/feriados` | `criar` | `CENTRAL_JORNADA` |
| DELETE | `/feriados/:id` | `remover` | `CENTRAL_JORNADA` |

## `fiscais`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/escala` | `cadastrar` | `ESCALA_EDITAR` |
| POST | `/escala/:funcionarioId/especial` | `definirEspecial` | `ESCALA_EDITAR` |
| GET | `/escala/consolidada/:diaSemana` | `consolidada` | `ESCALA_VISUALIZAR` |
| GET | `/escala/:funcionarioId/efetiva` | `efetiva` | `ESCALA_VISUALIZAR` |
| GET | `/fiscais/painel` | `painel` | `FISCAIS_STATUS` |
| GET | `/fiscais/eu` | `meuResumo` | `—` |
| POST | `/fiscais/eu/status` | `definirMeuStatus` | `—` |
| POST | `/fiscais/eu/falta` | `informarFalta` | `—` |
| GET | `/fiscais/jornada` | `jornada` | `FISCAIS_JORNADA` |
| GET | `/fiscais/horas-extras-mes` | `horasExtrasMes` | `FISCAIS_JORNADA` |
| GET | `/fiscais/folga-hoje` | `folgaHoje` | `FISCAIS_STATUS` |
| GET | `/fiscais/eu/historico-semanal` | `historicoSemanal` | `—` |
| GET | `/fiscais/ranking-mes` | `rankingMes` | `FISCAIS_JORNADA` |
| GET | `/fiscais/previsao-extras` | `previsaoExtras` | `FISCAIS_JORNADA` |
| GET | `/fiscais/contexto-escala` | `contextoEscala` | `—` |

## `incidencias`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/escala/incidencias` | `registrar` | `OPERADORES_AUSENCIAS` |
| PATCH | `/escala/incidencias/:id` | `editar` | `OPERADORES_AUSENCIAS` |
| PATCH | `/escala/incidencias/:id/justificativa` | `justificar` | `OPERADORES_AUSENCIAS` |
| DELETE | `/escala/incidencias/:id` | `remover` | `OPERADORES_AUSENCIAS` |
| GET | `/escala/incidencias` | `listar` | `ESCALA_VISUALIZAR` |
| GET | `/escala/incidencias/sugestoes` | `sugestoes` | `ESCALA_VISUALIZAR` |
| GET | `/escala/incidencias/ranking` | `ranking` | `ESCALA_VISUALIZAR` |
| GET | `/escala/incidencias/sancoes` | `sancoes` | `ESCALA_VISUALIZAR` |

## `insumos`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/insumos` | `listar` | `INSUMOS` |
| GET | `/insumos/proativo` | `proativo` | `INSUMOS` |
| POST | `/insumos/consumo-embalagem` | `consumoEmbalagem` | `INSUMOS` |
| GET | `/insumos/:id/analise` | `analise` | `INSUMOS` |
| GET | `/insumos/entradas` | `entradas` | `INSUMOS` |
| POST | `/insumos/:id/entrada` | `registrarEntrada` | `INSUMOS_GERENCIAR` |
| POST | `/insumos` | `cadastrar` | `INSUMOS` |
| GET | `/insumos/:id/saldo` | `saldo` | `INSUMOS` |
| POST | `/insumos/fardos/retirada` | `retirarFardo` | `INSUMOS` |
| POST | `/insumos/bobinas/consumo` | `consumirBobina` | `INSUMOS` |
| POST | `/insumos/consumo` | `consumirInsumo` | `INSUMOS` |
| GET | `/insumos/:id/estoque-baixo` | `estoqueBaixo` | `INSUMOS` |
| GET | `/insumos/:id/historico` | `historico` | `INSUMOS` |
| DELETE | `/insumos/movimentos` | `zerarEstoque` | `ADMIN_DADOS` |
| DELETE | `/insumos/:id/movimentos` | `zerarEstoqueInsumo` | `ADMIN_DADOS` |
| GET | `/insumos/pedidos-recorrentes/sugestoes` | `sugestoesPendentes` | `INSUMOS` |
| GET | `/insumos/pedidos-recorrentes/proximo-quinzenal` | `proximoQuinzenal` | `INSUMOS` |
| GET | `/insumos/pedidos-recorrentes` | `listar` | `INSUMOS` |
| POST | `/insumos/pedidos-recorrentes/confirmar` | `confirmar` | `INSUMOS_GERENCIAR` |
| POST | `/insumos/pedidos-recorrentes/ignorar` | `ignorar` | `INSUMOS_GERENCIAR` |
| POST | `/insumos/pedidos-recorrentes/configurar` | `configurar` | `INSUMOS_GERENCIAR` |

## `lote-apae`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/lote-apae` | `registrarLoteInicial` | `LOTE_APAE_GERENCIAR` |
| PUT | `/lote-apae/:id/saldo` | `atualizarSaldo` | `LOTE_APAE` |
| POST | `/lote-apae/:id/reiniciar` | `reiniciar` | `LOTE_APAE_GERENCIAR` |
| GET | `/lote-apae/historico` | `historico` | `LOTE_APAE` |
| DELETE | `/lote-apae/historico` | `limparHistorico` | `LOTE_APAE_GERENCIAR` |
| GET | `/lote-apae/ativo` | `ativo` | `LOTE_APAE` |
| GET | `/lote-apae/config` | `config` | `LOTE_APAE` |
| PUT | `/lote-apae/config` | `definirConfig` | `LOTE_APAE_GERENCIAR` |
| GET | `/lote-apae/painel` | `painel` | `LOTE_APAE` |

## `metas`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/metas` | `listar` | `OPERADORES_CRUD` |
| POST | `/metas` | `definir` | `OPERADORES_CRUD` |

## `notificacoes`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/notificacoes/historico` | `historico` | `NOTIFICACOES` |
| POST | `/notificacoes/push-token` | `registrarPushToken` | `NOTIFICACOES` |
| POST | `/notificacoes/push-token/remover` | `removerPushToken` | `NOTIFICACOES` |

## `operadores`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/quadro-operadores/grade` | `grade` | `OPERADORES_AUSENCIAS` |
| GET | `/quadro-operadores/dia` | `dia` | `OPERADORES_AUSENCIAS` |
| GET | `/quadro-operadores/ao-vivo` | `aoVivo` | `OPERADORES_AUSENCIAS` |
| GET | `/quadro-operadores/faltas/analitica` | `analiticaFaltas` | `OPERADORES_AUSENCIAS` |
| GET | `/quadro-operadores/nao-retornos/analitica` | `analiticaNaoRetornos` | `OPERADORES_AUSENCIAS` |
| GET | `/quadro-operadores/turnos` | `listar` | `OPERADORES_AUSENCIAS` |
| POST | `/operadores/ausencias` | `registrarAusencia` | `OPERADORES_AUSENCIAS` |
| POST | `/operadores/ausencias/periodo` | `registrarAusenciaPeriodo` | `OPERADORES_AUSENCIAS` |
| DELETE | `/operadores/ausencias/:id` | `removerAusencia` | `OPERADORES_AUSENCIAS` |
| PATCH | `/operadores/ausencias/:id/justificativa` | `justificarAusencia` | `OPERADORES_AUSENCIAS` |
| GET | `/operadores/ausencias` | `listarAusencias` | `OPERADORES_AUSENCIAS` |
| GET | `/operadores/ausencias/relatorio` | `relatorioAusencias` | `OPERADORES_AUSENCIAS` |
| POST | `/operadores/contagem-turno` | `contagemPorTurno` | `OPERADORES_AUSENCIAS` |

## `permissoes`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/permissoes/catalogo` | `catalogo` | `PERMISSOES_GERENCIAR` |
| GET | `/permissoes/usuario/:id` | `doUsuario` | `PERMISSOES_GERENCIAR` |
| PUT | `/permissoes/usuario/:id` | `definir` | `PERMISSOES_GERENCIAR` |
| POST | `/permissoes/usuario/:id/restaurar` | `restaurar` | `PERMISSOES_GERENCIAR` |
| GET | `/permissoes/perfis` | `perfis` | `PERMISSOES_GERENCIAR` |
| GET | `/permissoes/perfil/:perfil` | `doPerfil` | `PERMISSOES_GERENCIAR` |
| PUT | `/permissoes/perfil/:perfil` | `definirPerfil` | `PERMISSOES_GERENCIAR` |
| POST | `/permissoes/perfil/:perfil/restaurar` | `restaurarPerfil` | `PERMISSOES_GERENCIAR` |
| GET | `/permissoes/historico` | `historico` | `PERMISSOES_GERENCIAR` |

## `ponto`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/ponto/ocr` | `lerComprovante` | `PONTO_REGISTRAR` |
| GET | `/ponto/pessoas` | `buscarPessoas` | `PONTO_REGISTRAR` |
| GET | `/ponto/dia` | `jornadaDoDia` | `PONTO_VISUALIZAR` |
| GET | `/ponto/alertas-tac/historico` | `historicoTac` | `PONTO_VISUALIZAR` |
| POST | `/ponto/batidas` | `registrarBatida` | `PONTO_REGISTRAR` |
| PATCH | `/ponto/batidas/:id` | `editarBatida` | `PONTO_EDITAR` |
| DELETE | `/ponto/batidas/:id` | `removerBatida` | `PONTO_EDITAR` |

## `requisicoes`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/requisicoes` | `criar` | `INSUMOS` |
| GET | `/requisicoes` | `listar` | `INSUMOS` |
| GET | `/requisicoes/pendentes/contagem` | `pendentes` | `INSUMOS` |
| DELETE | `/requisicoes` | `limparTodas` | `ADMIN_DADOS` |
| POST | `/requisicoes/:id/aprovar` | `aprovar` | `INSUMOS_GERENCIAR` |
| POST | `/requisicoes/:id/negar` | `negar` | `INSUMOS_GERENCIAR` |

## `reset-operacional`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/admin/reset-operacional` | `reiniciar` | `ADMIN_DADOS` |

## `tipos-contrato`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/tipos-contrato` | `listar` | `ADMIN_DADOS` |
| POST | `/tipos-contrato` | `criar` | `ADMIN_DADOS` |
| PATCH | `/tipos-contrato/:id` | `atualizar` | `ADMIN_DADOS` |
| PATCH | `/tipos-contrato/:id/ativo` | `definirAtivo` | `ADMIN_DADOS` |
| DELETE | `/tipos-contrato/:id` | `remover` | `ADMIN_DADOS` |

## `usuarios`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| GET | `/usuarios` | `listar` | `USUARIOS_CRUD` |
| POST | `/usuarios` | `cadastrar` | `USUARIOS_CRUD` |
| PATCH | `/usuarios/:id/senha` | `redefinirSenha` | `USUARIOS_CRUD` |
| DELETE | `/usuarios/:id` | `remover` | `USUARIOS_CRUD` |

## `vendas`

| Método | Rota | Handler | Permissão |
|---|---|---|---|
| POST | `/vendas/upload` | `upload` | `IMPORTACOES` |
| GET | `/vendas/resumo` | `resumo` | `PAINEL_VENDAS_VISUALIZAR` |
| GET | `/vendas/por-hora` | `porHora` | `PAINEL_VENDAS_VISUALIZAR` |
| GET | `/vendas/status` | `status` | `PAINEL_VENDAS_VISUALIZAR` |
| GET | `/vendas/painel` | `painel` | `PAINEL_VENDAS_VISUALIZAR` |
| GET | `/vendas/config` | `config` | `PAINEL_VENDAS_VISUALIZAR` |
| GET | `/vendas/estimativas` | `listarEstimativas` | `PAINEL_VENDAS_VISUALIZAR` |
| PUT | `/vendas/estimativas` | `definirEstimativas` | `PAINEL_VENDAS_EDITAR` |
| PUT | `/vendas/config` | `definirConfig` | `PAINEL_VENDAS_EDITAR` |
| POST | `/vendas/limpar-sem-hora` | `limparSemHora` | `USUARIOS_CRUD` |

