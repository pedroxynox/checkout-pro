# Guia de QA — Check-out PRO

> Validação manual por perfil e por fluxo. Use após um deploy ou antes de uma entrega. A versão documentada está mesclada na `main` até `e8c32be`; confirme no painel do Render se esse commit foi realmente implantado antes de iniciar.
>
> Última revisão: **15/07/2026**. UI em Português do Brasil.

## Como registrar a execução

Para cada falha, anote: ambiente (web/APK), perfil, data/hora, colaborador de teste, passo, resultado, print e resposta da API quando disponível. Não use dados reais desnecessários.

## 0. Pré-condições

- [ ] API e web respondem; `GET /health/ready` confirma conexão com o banco.
- [ ] O commit/deploy testado foi identificado nos logs do Render.
- [ ] Migrations foram aplicadas até `9zq_alerta_tac_enviado`.
- [ ] Existem usuários de QA para IMPORTADOR, FISCAL, SUPERVISOR, GERENTE e ADMINISTRADOR.
- [ ] Existem colaboradores de teste nas funções operador, fiscal e supervisor, com escala e data de admissão.
- [ ] Há arquivos `.txt` de teste de vendas/arrecadação e comprovantes de ponto sem dados pessoais reais.
- [ ] Para push Android: FCM está vinculado ao Expo/EAS e o APK testado foi compilado depois dessa configuração.
- [ ] A hora/fuso do ambiente está em `America/Sao_Paulo`.

## 1. Autenticação, sessão e permissões

### Todos os perfis
- [ ] Login por matrícula + senha funciona.
- [ ] Senha inválida mostra mensagem clara sem revelar detalhes internos.
- [ ] Logout remove a sessão local e o token push do aparelho quando aplicável.
- [ ] Token revogado após troca de senha deixa de acessar a API.
- [ ] Áreas sem permissão não aparecem e chamadas diretas retornam 403.

### Visibilidade esperada
- [ ] IMPORTADOR acessa somente Importações.
- [ ] FISCAL acessa as rotinas operacionais autorizadas, sem administração estrutural.
- [ ] SUPERVISOR acessa supervisão/jornada e gestão parcial.
- [ ] GERENTE acessa gestão operacional conforme allowlist.
- [ ] ADMINISTRADOR acessa todas as funcionalidades catalogadas.
- [ ] Alertas de Fila, Normativas e Indicador de Quebra continuam ocultos enquanto `emBreve` estiver ativo.

## 2. Importações, indicadores e fechamento

### IMPORTADOR
- [ ] Enviar `.txt` de vendas por hora; conferir total e distribuição por hora.
- [ ] Enviar os cinco tipos de arrecadação.
- [ ] Marcar um tipo sem movimento e desfazer a marca.
- [ ] Reenviar arquivo quando permitido; confirmar bloqueio de perfil não autorizado.
- [ ] Arquivo/tamanho/formato inválido é rejeitado sem gravar dados parciais.

### Gestores
- [ ] Indicadores exibem total, meta, semáforo, gráficos e ranking.
- [ ] Valores sem colaborador correspondente continuam no total e aparecem em “Não reconhecidos”.
- [ ] Associar um código não reconhecido corrige a atribuição histórica.
- [ ] Painel de Vendas exibe venda do dia, períodos e barras por hora.
- [ ] Fechamento mostra os itens pendentes e alertas de consistência.
- [ ] Ao completar o dia, a conclusão é notificada uma única vez mesmo com cargas concorrentes.
- [ ] Às 22:20, o lembrete só é enviado se o fechamento estiver incompleto.

## 3. Registro de Ponto — fluxo principal

Executar na web e no APK quando possível.

### Cadastro e batidas
- [ ] Buscar colaborador pelo nome/matrícula e confirmar o tipo correto.
- [ ] Registrar quatro batidas (entrada, saída intervalo, retorno, saída final).
- [ ] A ordem classifica corretamente cada batida; 5ª+ aparece como extra.
- [ ] Editar/remover uma batida recalcula a jornada.
- [ ] Falha de rede/persistência não cria duplicação silenciosa.

### Comprovante e OCR
- [ ] Fotografar comprovante real de QA no APK; ML Kit extrai data/hora/nome.
- [ ] Na web, enviar foto para OCR do servidor.
- [ ] O parser usa os rótulos DATA/HORA e não confunde CNPJ/PIS com horário.
- [ ] Nome quebrado em duas linhas é reconstruído quando legível.
- [ ] Ruído não gera sugestão de colaborador indevida.
- [ ] Nada é gravado antes da confirmação; corrigir manualmente hora/nome funciona.
- [ ] Foto ilegível permite seguir pelo registro manual.

### Cálculo de jornada
- [ ] Seg–Qui usa carga base de 7h.
- [ ] Sex–Sáb usa carga base de 8h.
- [ ] Domingo usa 7h20 e extras 100%.
- [ ] Feriado usa a mesma regra de domingo: 7h20 e extras 100%.
- [ ] Intervalo não conta como trabalhado.
- [ ] Intervalo entre 1h e 3h não gera TAC por intervalo.
- [ ] Intervalo menor que 1h ou maior que 3h gera TAC.

## 4. Alertas preventivos e TAC

Preparar jornadas controladas; validar tanto o disparo após batida quanto o cron de um minuto.

- [ ] Com extras abaixo de 1h30, nenhum alerta preventivo é enviado.
- [ ] Ao chegar a `>=1h30`, chega “Risco de TAC”.
- [ ] Ao chegar a `>=1h40`, chega “Risco alto de TAC”.
- [ ] Exatamente 1h50 ainda não vira TAC por extras.
- [ ] Acima de 1h50, chega alerta TAC.
- [ ] Intervalo `<1h` ou `>3h` também gera TAC.
- [ ] Cada etapa é enviada no máximo uma vez por pessoa/dia enquanto o processo está ativo.
- [ ] Batida e cron não duplicam a mesma etapa.
- [ ] Destinatários são somente SUPERVISOR, GERENTE e ADMINISTRADOR; fiscais/importadores não recebem por esse motivo.
- [ ] Simular falha do serviço de notificação: a batida continua gravada e a etapa pode ser tentada novamente.
- [ ] Reiniciar o backend durante o dia NÃO deve gerar reaviso da mesma etapa: a deduplicação é persistente (tabela `alertas_tac_enviados`, índice único por pessoa/dia/etapa). Conferir que a etapa já avisada não se repete após o restart.

## 5. Central de Jornada

### Ciclos e abrangência
- [ ] O ciclo abre no dia 26 e fecha no dia 25 do mês seguinte.
- [ ] Trocar ciclo atual/anterior atualiza datas e totais.
- [ ] A API aceita comparativo de até 12 ciclos; o app exibe atualmente seis em ordem correta.
- [ ] A consolidação inclui operador, supervisor e fiscal, sem filtro interativo por função.

### Métricas
- [ ] Carga trabalhada e base diária coincidem com as batidas/regras do período.
- [ ] Extras de dias comuns entram em 50%.
- [ ] Extras de domingo/feriado entram em 100%.
- [ ] Horas devidas, atestado, faltas e TAC aparecem nas colunas/resumo corretos.
- [ ] Marcar uma falta como débito afeta horas devidas.
- [ ] Saldo = extras 50% + extras 100% − horas devidas.
- [ ] Dias sem dados não inventam jornada.

## 6. Feriados e escala 6x1–2x1

- [ ] Feriados nacionais aparecem automaticamente no ano selecionado.
- [ ] Cadastrar/remover feriado estadual ou municipal manualmente funciona com a permissão correta; para corrigir um cadastro, remover e criar novamente.
- [ ] Carnaval e Corpus Christi não aparecem automaticamente; cadastrar manualmente quando a loja os adotar.
- [ ] Uma batida em feriado usa carga 7h20/extras 100% na jornada e na Central.
- [ ] Colaborador com o tipo de contrato padrão (6x1) apresenta a escala esperada.
- [ ] Cadastrar colaborador sem escolher tipo de contrato → recebe o padrão (6x1).
- [ ] Alternância/configuração de domingos respeita a âncora e a ordem cadastradas.

## 7. Contratos de experiência

> Este fluxo é diferente do **tipo de contrato** (jornada/TAC), que governa a jornada.

- [ ] Cadastrar **operador ativo** com data de admissão cria/deriva contrato de experiência.
- [ ] Outros tipos de colaborador não entram na carteira/cron de experiência.
- [ ] Até 90 dias, o estado é de experiência.
- [ ] Nos cinco dias anteriores ao marco de 90, o alerta chega aos destinatários atuais: FISCAL, SUPERVISOR, GERENTE e ADMINISTRADOR.
- [ ] No dia 91, sem encerramento, o estado muda automaticamente para efetivado.
- [ ] Histórico/decisões antigas continuam consultáveis sem substituir a regra automática atual.
- [ ] Alterar data de admissão recalcula marcos sem criar registros duplicados.

## 8. Operadores, faltas, justificativas e sanções

- [ ] Escala mostra operadores ativos e não mostra inativos.
- [ ] Marcar/desmarcar falta atualiza a tela imediatamente.
- [ ] Marcar “Sem retorno” retira a pessoa dos disponíveis no caixa.
- [ ] Justificar, injustificar e reabrir falta/incidência atualiza score e auditoria.
- [ ] Falta sem justificativa gera solicitação de advertência; nada é aplicado sem aprovação.
- [ ] Aprovar/cancelar solicitação funciona e não duplica por falta.
- [ ] Advertência/suspensão aparece na linha do tempo do perfil.
- [ ] Inativar colaborador preserva histórico no período de retenção; reativar restaura sua presença operacional.

## 9. Insumos, requisições e APAE

- [ ] Estoque mostra nível Crítico/Atenção/OK.
- [ ] Entrada aprovada aumenta saldo; consumo reduz saldo.
- [ ] Consumo maior que o saldo retorna conflito e não deixa saldo negativo.
- [ ] Requisição manual exige decisão; alertas de estoque não criam entrada automaticamente.
- [ ] Pedido recorrente aparece como sugestão para confirmação.
- [ ] Sacolas APAE: lote, saldo, preço/meta e encerramento ao zerar funcionam conforme perfil.

## 10. Checklist

- [ ] Enviar abertura/fechamento dentro da janela registra sucesso.
- [ ] Enviar fora da janela registra atraso.
- [ ] Foto repetida é detectada pelo hash.
- [ ] Confirmação de envio chega por notificação sem bloquear o upload se o canal falhar.
- [ ] Perfis sem permissão não alteram checklist.

## 11. Notificações e tempo real

### In-app/WebSocket
- [ ] Sino/badge atualiza sem recarregar.
- [ ] Mudança de status de fiscal aparece em tempo real aos gestores.
- [ ] Reconexão não duplica eventos persistidos.

### Push Android
- [ ] APK solicita permissão e registra token Expo após login.
- [ ] Com app aberto, push é apresentado sem duplicação indevida.
- [ ] Com app fechado, push chega ao Android configurado com FCM.
- [ ] Logout remove o token do aparelho.
- [ ] Token inválido/falha do Expo não quebra o fluxo que originou a notificação.
- [ ] Se FCM ou novo APK ainda não estiverem disponíveis, marcar como **bloqueado por configuração externa**, não como backend ausente.

## 12. Cluby

- [ ] Chat abre, mantém conversa e renderiza markdown.
- [ ] Sem `GEMINI_API_KEY`, mostra indisponibilidade/configuração ausente sem quebrar o app.
- [ ] Sob limite de cota, resposta é tratada; para teste multiusuário usar tier pago.
- [ ] Normativas/procedimentos em escala continuam ocultos/desativados até existir RAG + storage.

## 13. Administração e segurança operacional

- [ ] ADMINISTRADOR acessa Data Inicial e Reset Operacional.
- [ ] Data anterior à `Data_Inicial_Sistema` é rejeitada nos fluxos protegidos.
- [ ] Reset exige confirmação explícita e conserva cadastros/configurações previstas.
- [ ] **Não executar reset em produção durante QA normal.** Usar banco descartável.
- [ ] CORS aceita apenas origens configuradas em produção.
- [ ] Upload excessivo/arquivo inválido é rejeitado.
- [ ] Logs incluem correlation/request id sem expor senha/token/corpo sensível.

## 14. Regressão web/APK/offline

- [ ] Web navega e chama a API sem erro CORS.
- [ ] APK aponta para a URL correta de produção/QA.
- [ ] Sem rede no APK, ações compatíveis entram na fila; ao reconectar, sincronizam uma vez.
- [ ] PDF de relatório contém texto e gráficos, sem página em branco.
- [ ] Layout principal funciona em resolução desktop e celular.

## 15. Registro de problemas

| # | Ambiente | Perfil | Fluxo/passo | Esperado | Obtido | Evidência | Gravidade |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

### Critério de saída

- Nenhum erro crítico/alto aberto nos fluxos de login, persistência, ponto/TAC, jornada, importação/fechamento ou permissões.
- Bloqueios externos (FCM/APK, plano Render, Gemini) registrados com responsável e prazo.
- Commit implantado, migration aplicada e resultado das suítes automáticas anexados ao registro da entrega.
