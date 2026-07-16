# Referência da API — Check-out PRO

> Contrato HTTP do backend NestJS. Base URL de produção:
> `https://checkout-pro-api.onrender.com`.
>
> **Autenticação:** todas as rotas exigem `Authorization: Bearer <JWT>`,
> **exceto** as marcadas como *Pública*. O token é obtido em `POST /acessos/login`
> e dura ~30 dias.
>
> **Autorização:** por *funcionalidade* (allowlist por perfil, ver
> `acessos.domain.ts`). A coluna **Permissão** indica a funcionalidade exigida.
> `ADMINISTRADOR` tem acesso total a tudo. Quando um método sobrepõe a
> permissão da classe, vale a do método.
>
> **Erros:** erros de domínio são traduzidos a HTTP por um filtro global
> (`DominioExceptionFilter`): credenciais inválidas → 401, não encontrado → 404,
> validação/duplicado → 400/409.

## Sistema / saúde
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/` | Pública | Info da aplicação |
| GET | `/health` | Pública | Health check (usado pelo Render) |

## Acessos (autenticação)
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/acessos/login` | Pública | Login por `{ login, senha }` → token + perfil |
| GET | `/acessos/eu` | Autenticado | Identidade do usuário (perfil, login) |

## Arrecadação / Indicadores  *(classe: `INDICADORES_VISUALIZAR`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/arrecadacao/upload` | `IMPORTACOES` | Sobe `.txt` de um tipo (`?tipo=&data=`) |
| GET | `/arrecadacao/resumo` | `INDICADORES_VISUALIZAR` | Totais dia/semana/mês (`?tipo=&data=`) |
| GET | `/arrecadacao/status` | `FECHAMENTO` \| `IMPORTACOES` | Status de cada tipo no dia |
| POST | `/arrecadacao/sem-movimento` | `IMPORTACOES` | Marca tipo como sem movimento |
| DELETE | `/arrecadacao/sem-movimento` | `IMPORTACOES` | Remove a marca |
| GET | `/arrecadacao/ranking` | `INDICADORES_VISUALIZAR` | Ranking por pessoa (`?tipo=&inicio=&fim=`) |
| GET | `/arrecadacao/detalhes` | `INDICADORES_VISUALIZAR` | Detalhe de cada lançamento |
| GET | `/arrecadacao/nao-reconhecidos/resumo` | `INDICADORES_VISUALIZAR` | Total + nº de não reconhecidos |
| GET | `/arrecadacao/nao-reconhecidos` | `OPERADORES_CRUD` | Fila de códigos soltos p/ associar/criar |
| GET | `/arrecadacao/metas` | `INDICADORES_VISUALIZAR` | Metas configuradas (c/ fallback) |
| POST | `/arrecadacao/metas` | `ADMIN_DADOS` | Define meta de um indicador |
| GET | `/arrecadacao/tendencia` | `INDICADORES_VISUALIZAR` | Série dos últimos N dias |
| GET | `/arrecadacao/comparativo` | `INDICADORES_VISUALIZAR` | Mês/semana atual vs anterior |
| GET | `/arrecadacao/projecao` | `INDICADORES_VISUALIZAR` | Projeção de fechamento do mês |
| GET | `/arrecadacao/destaques-mes` | `INDICADORES_VISUALIZAR` | Top 3 do mês |
| GET | `/arrecadacao/anomalias` | `INDICADORES_VISUALIZAR` | Operadores muito acima da média |
| GET | `/arrecadacao/painel-atencao` | `INDICADORES_VISUALIZAR` | Metas em risco + operadores |

## Vendas (Painel de Vendas)  *(classe: `PAINEL_VENDAS_VISUALIZAR`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/vendas/upload` | `IMPORTACOES` | Sobe `.txt` de vendas por hora (só gerente/importador reenvia) |
| GET | `/vendas/resumo` | `PAINEL_VENDAS_VISUALIZAR` | Totais dia/semana/mês |
| GET | `/vendas/por-hora` | `PAINEL_VENDAS_VISUALIZAR` | Distribuição por hora no intervalo |
| GET | `/vendas/status` | `FECHAMENTO` \| `IMPORTACOES` | Enviado/pendente no dia |
| GET | `/vendas/painel` | `PAINEL_VENDAS_VISUALIZAR` | Painel inteligente (meta, projeção, heatmap) |
| GET | `/vendas/config` | `PAINEL_VENDAS_VISUALIZAR` | Meta mensal |
| PUT | `/vendas/config` | `PAINEL_VENDAS_EDITAR` | Atualiza meta mensal |
| POST | `/vendas/limpar-sem-hora` | `USUARIOS_CRUD` | Remove totais sem detalhe por hora |

## Fechamento  *(classe: `FECHAMENTO`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/fechamento/resumo` | `FECHAMENTO` | Resumo inteligente do dia (`?data=`) |

## Insumos / Almoxarifado  *(classe: `INSUMOS`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/insumos` | `INSUMOS` | Lista com resumo de estoque |
| GET | `/insumos/proativo` | `INSUMOS` | Predição, nível e sugestão de reposição |
| POST | `/insumos/consumo-embalagem` | `INSUMOS` | Consumo em embalagens inteiras |
| GET | `/insumos/entradas` | `INSUMOS` | Entradas recentes |
| POST | `/insumos/:id/entrada` | `INSUMOS_GERENCIAR` | Registra entrada |
| POST | `/insumos` | `INSUMOS` | Cadastra insumo |
| GET | `/insumos/:id/saldo` | `INSUMOS` | Saldo em tempo real |
| POST | `/insumos/fardos/retirada` | `INSUMOS` | Retirada de fardo por código de barras |
| POST | `/insumos/bobinas/consumo` | `INSUMOS` | Consumo de bobinas de um PDV |
| POST | `/insumos/consumo` | `INSUMOS` | Consumo de insumo |
| GET | `/insumos/:id/estoque-baixo` | `INSUMOS` | Se está abaixo do mínimo |
| GET | `/insumos/:id/historico` | `INSUMOS` | Histórico de movimentos |
| DELETE | `/insumos/movimentos` | `ADMIN_DADOS` | Zera todo o estoque |

### Pedidos recorrentes  *(classe: `INSUMOS`, base `/insumos/pedidos-recorrentes`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/sugestoes` | `INSUMOS` | Sugestões pendentes |
| GET | `/proximo-quinzenal` | `INSUMOS` | Dias até o próximo pedido |
| GET | `/` | `INSUMOS` | Lista pedidos recorrentes |
| POST | `/confirmar` | `INSUMOS_GERENCIAR` | Confirma sugestões (dá entrada) |
| POST | `/ignorar` | `INSUMOS_GERENCIAR` | Descarta sugestões |
| POST | `/configurar` | `INSUMOS_GERENCIAR` | Configura um pedido recorrente |

## Requisições  *(classe: `INSUMOS`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/requisicoes` | `INSUMOS` | Cria requisição (fiscal) |
| GET | `/requisicoes` | `INSUMOS` | Lista (filtro `?status=`) |
| GET | `/requisicoes/pendentes/contagem` | `INSUMOS` | Contador para o badge |
| DELETE | `/requisicoes` | `ADMIN_DADOS` | Remove todas |
| POST | `/requisicoes/:id/aprovar` | `INSUMOS_GERENCIAR` | Aprova (gera entrada) |
| POST | `/requisicoes/:id/negar` | `INSUMOS_GERENCIAR` | Nega com motivo |

## Sacolas APAE  *(classe: `LOTE_APAE`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/lote-apae` | `LOTE_APAE_GERENCIAR` | Registra lote inicial |
| PUT | `/lote-apae/:id/saldo` | `LOTE_APAE` | Atualiza saldo (encerra ao zerar) |
| POST | `/lote-apae/:id/reiniciar` | `LOTE_APAE_GERENCIAR` | Encerra e abre novo lote |
| GET | `/lote-apae/historico` | `LOTE_APAE` | Lotes encerrados |
| DELETE | `/lote-apae/historico` | `LOTE_APAE_GERENCIAR` | Limpa histórico |
| GET | `/lote-apae/ativo` | `LOTE_APAE` | Lote em andamento |
| GET | `/lote-apae/config` | `LOTE_APAE` | Preço + meta mensal |
| PUT | `/lote-apae/config` | `LOTE_APAE_GERENCIAR` | Atualiza preço/meta |
| GET | `/lote-apae/painel` | `LOTE_APAE` | Painel inteligente |

## Fiscais (jornada)  *(base `/fiscais`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/fiscais/painel` | `FISCAIS_STATUS` | Painel em tempo real |
| GET | `/fiscais/eu` | Autenticado | Resumo do próprio fiscal |
| POST | `/fiscais/eu/status` | Autenticado (próprio) | Define o próprio status |
| POST | `/fiscais/eu/falta` | Autenticado (próprio) | Informa a própria falta |
| GET | `/fiscais/eu/historico-semanal` | Autenticado | Histórico de 7 dias |
| GET | `/fiscais/folga-hoje` | `FISCAIS_STATUS` | Fiscais de folga hoje |
| GET | `/fiscais/jornada` | `FISCAIS_JORNADA` | Log de tempos do dia |
| GET | `/fiscais/horas-extras-mes` | `FISCAIS_JORNADA` | Horas extras do mês |
| GET | `/fiscais/ranking-mes` | `FISCAIS_JORNADA` | Ranking de pontualidade |
| GET | `/fiscais/previsao-extras` | `FISCAIS_JORNADA` | Previsão de horas extras |
| GET | `/fiscais/contexto-escala` | Autenticado | Contexto p/ o Cluby |

## Escala  *(base `/escala`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/escala` | `ESCALA_EDITAR` | Cadastra escala geral |
| POST | `/escala/:funcionarioId/especial` | `ESCALA_EDITAR` | Horário especial individual |
| GET | `/escala/consolidada/:diaSemana` | `ESCALA_VISUALIZAR` | Escala consolidada do dia |
| GET | `/escala/:funcionarioId/efetiva` | `ESCALA_VISUALIZAR` | Escala efetiva (`?diaSemana=`) |

## Incidências de Escala  *(base `/escala/incidencias`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/escala/incidencias` | `OPERADORES_AUSENCIAS` | Registra incidência (ex.: não retorno do intervalo) |
| PATCH | `/escala/incidencias/:id` | `OPERADORES_AUSENCIAS` | Edita campos editáveis |
| DELETE | `/escala/incidencias/:id` | `OPERADORES_AUSENCIAS` | Remove incidência |
| GET | `/escala/incidencias` | `ESCALA_VISUALIZAR` | Lista (`?colaboradorId=&tipo=&inicio=&fim=`) |
| GET | `/escala/incidencias/sugestoes` | `ESCALA_VISUALIZAR` | Auto-detecção do ponto (`?data=`) |
| GET | `/escala/incidencias/ranking` | `ESCALA_VISUALIZAR` | Ranking por colaborador (`?inicio=&fim=`) |

## Quadro de Operadores  *(classe: `OPERADORES_AUSENCIAS`, base `/quadro-operadores`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/grade` | `OPERADORES_AUSENCIAS` | Grade semanal Seg–Sáb |
| GET | `/dia` | `OPERADORES_AUSENCIAS` | Roster de um dia |
| GET | `/ao-vivo` | `OPERADORES_AUSENCIAS` | Quem deveria estar no caixa agora |
| GET | `/faltas/analitica` | `OPERADORES_AUSENCIAS` | Analítica de faltas |
| GET | `/turnos` | `OPERADORES_AUSENCIAS` | Lista de operadores |

## Operadores / Ausências  *(classe: `OPERADORES_CRUD`, base `/operadores`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/ausencias` | `OPERADORES_AUSENCIAS` | Registra ausência (futura exige gerente/supervisor) |
| DELETE | `/ausencias/:id` | `OPERADORES_AUSENCIAS` | Remove ausência |
| GET | `/ausencias/relatorio` | `OPERADORES_AUSENCIAS` | Relatório por período |
| POST | `/contagem-turno` | `OPERADORES_AUSENCIAS` | Contagem por turno |

## Colaboradores (Cadastro Unificado)  *(classe: `OPERADORES_CRUD`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/colaboradores` | `OPERADORES_CRUD` | Cadastra colaborador |
| GET | `/colaboradores` | `OPERADORES_AUSENCIAS` | Lista (busca/filtros) |
| GET | `/colaboradores/logins` | `OPERADORES_CRUD` | Logins disponíveis p/ vincular |
| GET | `/colaboradores/:id` | `OPERADORES_AUSENCIAS` | Detalhe |
| GET | `/colaboradores/:id/perfil` | `OPERADORES_AUSENCIAS` | Perfil inteligente (score, indicadores) |
| PATCH | `/colaboradores/:id` | `OPERADORES_CRUD` | Edita |
| POST | `/colaboradores/:id/inativar` | `OPERADORES_CRUD` | Inativa (preserva histórico) |
| POST | `/colaboradores/:id/reativar` | `OPERADORES_CRUD` | Reativa |
| POST | `/colaboradores/:id/identificadores` | `OPERADORES_CRUD` | Associa código solto (corrige histórico) |

## Metas mensais  *(classe: `OPERADORES_CRUD`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/metas` | `OPERADORES_CRUD` | Metas do mês (`?anoMes=AAAA-MM`) |
| POST | `/metas` | `OPERADORES_CRUD` | Define meta de um indicador |

## Usuários (gestão de acessos)  *(classe: `USUARIOS_CRUD`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/usuarios` | `USUARIOS_CRUD` | Lista usuários |
| POST | `/usuarios` | `USUARIOS_CRUD` | Cadastra usuário (login por matrícula) |
| PATCH | `/usuarios/:id/senha` | `USUARIOS_CRUD` | Redefine senha |
| DELETE | `/usuarios/:id` | `USUARIOS_CRUD` | Remove (não o próprio) |

## Checklist  *(classe: `CHECKLIST`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/checklist/:tipo` | `CHECKLIST` | Garante o checklist do dia (`tipo` = abertura/fechamento) |
| POST | `/checklist/:tipo/imagem` | `CHECKLIST` | Envia imagem (valida + hash anti-fraude) |
| GET | `/checklist/estado` | `CHECKLIST` | Estado dos 2 checklists do dia |
| GET | `/checklist/metricas` | `CHECKLIST` | % no prazo do mês |
| GET | `/checklist/historico` | `CHECKLIST` | Últimos N dias (`?dias=`) |
| GET | `/checklist/:tipo/status` | `CHECKLIST` | Status do dia |
| GET | `/checklist/:tipo/janela` | `CHECKLIST` | Janela fixa de execução |

## Notificações  *(classe: `NOTIFICACOES`)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/notificacoes/historico` | `NOTIFICACOES` | Histórico do usuário autenticado |

## Assistente (Cluby)  *(base `/assistente`, apenas autenticado)*
| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/assistente/status` | Autenticado | Se está configurado (chave Gemini) |
| GET | `/assistente/conversa` | Autenticado | Conversa das últimas 24h (isolada por usuário) |
| POST | `/assistente/mensagem` | Autenticado | Envia mensagem e recebe resposta |
| DELETE | `/assistente/conversa` | Autenticado | Limpa a conversa |

> **Nota:** endpoints do assistente podem retornar **503** quando o Gemini não
> está configurado ou indisponível (ex.: limite gratuito atingido).

## Tempo real (WebSocket)
Além do REST, há um **gateway Socket.IO** (módulo `fiscais`) que emite o status
dos fiscais em tempo real e as notificações in-app (toast + badge). O cliente
mobile conecta via `api/socket.ts` com o mesmo token Bearer.
