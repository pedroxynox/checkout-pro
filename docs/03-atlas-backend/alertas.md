> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/alertas/`

# Módulo: `alertas`

## 1. Propósito
Alertas **agendados** do sistema (cron): lembretes e avisos de checklist e de
fechamento nos horários-limite da operação, e a **saudação diária** motivadora
(bom dia/tarde) com o resumo de vendas do dia anterior.

## 2. Responsabilidades e limites
- **Faz:** agenda e dispara, no fuso de Brasília, os lembretes/alertas de
  checklist (abertura e fechamento), o lembrete das 22:20 para concluir o
  fechamento do dia e a saudação diária (fiscais na hora de entrada;
  gerentes/supervisores às 06:50); decide **quando** alertar (consultando
  checklist, arrecadação e fechamento) e delega o envio às notificações.
- **Não faz:** não persiste nem entrega as notificações em si (fica em
  [`notificacoes`](notificacoes.md)); não define o estado do checklist
  (fica em [`checklist`](checklist.md)); não calcula o fechamento
  (fica em [`fechamento`](fechamento.md)) nem os totais de arrecadação
  (fica em [`arrecadacao`](arrecadacao.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `alertas.service.ts` | Cron jobs de checklist/fechamento e regra de disparo | 259 |
| `saudacao-diaria.service.ts` | Cron da saudação diária (fiscais e gestores) | 205 |
| `saudacao-diaria.domain.ts` | Regras puras: monta título e mensagem da saudação | 65 |
| `alertas.module.ts` | Ligações (DI); fornece o relógio injetável (`RELOGIO`) | 31 |

## 4. Endpoints (rotas HTTP)
**Não expõe rotas HTTP.** É um módulo de tarefas agendadas (`@nestjs/schedule`).
Toda a interação com o usuário acontece pelas **notificações** que ele dispara
(ver [`notificacoes`](notificacoes.md)). Os `@Cron` são registrados pelo
`ScheduleModule.forRoot()` do `AppModule`.

## 5. Serviços e funções

### `AlertasService`

#### `onModuleInit()`
Registra **dinamicamente** o job de importações pendentes no horário de fim do
dia configurável (`HORARIO_FIM_DO_DIA`, padrão `18:00`), pois esse horário não é
conhecido em tempo de compilação. Idempotente (não recria se já existe).

#### `dispararLembreteInicio(tipo)`
- **Devolve:** `true` quando o lembrete foi enviado.
- **Efeitos:** se o checklist (`ABERTURA`/`FECHAMENTO`) ainda está pendente,
  avisa que a janela começa em ~5 min, via `notificarAlertaChecklist`.
- Disparado pelos crons **08:10** (abertura) e **13:10** (fechamento).

#### `dispararAlertaChecklist(tipo)`
- **Devolve:** `true` quando o alerta foi disparado.
- **Efeitos:** ~15 min antes do limite, se ainda pendente, notifica quem tem a
  funcionalidade `CHECKLIST` (via `notificarAlertaChecklist`).
- Disparado pelos crons **09:00** (abertura) e **14:00** (fechamento).

#### `dispararLembreteFechamentoArquivos()`
- **Devolve:** `true` quando o lembrete foi disparado.
- **Efeitos:** às **22:20**, se o fechamento do dia ainda **não** está completo,
  avisa os destinatários com a permissão `NOTIFICACOES` para carregar os
  arquivos do dia. Se já completo, não incomoda ninguém.

#### `dispararAlertaImportacoesPendentes()`
- **Devolve:** a lista de tipos de arrecadação pendentes (vazia quando nada
  pendente ou fechamento já concluído).
- **Efeitos:** avalia o **dia operacional de Brasília** (UTC−3) para não cair no
  dia seguinte em UTC; se o fechamento está completo, retorna `[]`.
- **Nota:** o **aviso** de "Importações pendentes" foi **descontinuado** por
  decisão de negócio — a detecção permanece apenas para log/diagnóstico.

#### `expressaoCronDiaria(horario)` (exportada, pura)
Converte `"HH:mm"` na expressão cron `"m h * * *"`. Testável isoladamente.

### `SaudacaoDiariaService`
- `saudarFiscais()` (cron a cada minuto): identifica os fiscais que **entram
  agora** (dentro de uma janela de 5 min pela escala do dia) e ainda não foram
  saudados; envia a saudação com o resultado de ontem. Marca o fiscal como
  saudado cedo (evita reenvio mesmo em erro). A conta é resolvida pela **ficha
  canônica** (`colaboradorId` da escala → `Colaborador`), com fallback ao
  registro legado `Fiscal` (Fase 4 · Opção A · A.3).
- `saudarGestores()` (cron **06:50**): saúda gerentes, gerentes desenvolvedores
  e supervisores.
- `resetarDiario()` (cron **00:00**): zera o controle de "já saudado" do dia.
- `resultadoOntem(agora)`: venda de ontem (R$) e variação vs. o mesmo dia da
  semana passada — base da mensagem. Entrega **best-effort** (falha nunca
  derruba o cron).

## 6. Lógica de domínio (funções puras)
Em `saudacao-diaria.domain.ts`:
- `saudacaoPeriodo(hora)` → `Bom dia` (<12), `Boa tarde` (<18) ou `Boa noite`.
- `montarSaudacaoDiaria(dados)` → `{ titulo, mensagem }` determinístico a partir
  do primeiro nome, da hora e do resultado de ontem (alta → "manter o ritmo";
  queda → "buscar mais"; sem comparação → elogio sem porcentagem; sem dado →
  mensagem genérica).

## 7. Estados e enums
- `TipoChecklist`: `ABERTURA` · `FECHAMENTO` (reusado de [`checklist`](checklist.md)).
- `TipoArrecadacao`: tipos de arrecadação (reusado de [`arrecadacao`](arrecadacao.md)).
- Horários (Brasília, `America/Sao_Paulo`): lembretes 08:10/13:10; alertas
  09:00/14:00; lembrete de fechamento 22:20; saudação de gestores 06:50; reset
  00:00; importações pendentes = `HORARIO_FIM_DO_DIA`.

## 8. Dados que o módulo toca
- **Lê:** `EscalaEntry`, `Fiscal`, `Usuario`, `VendaDiaria` (na saudação);
  indiretamente `Checklist`/arrecadação/fechamento via os serviços consumidos.
- **Escreve:** nada diretamente; os avisos são gravados por
  [`notificacoes`](notificacoes.md) (`Notificacao`).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `ChecklistService`, `ArrecadacaoService`, `FechamentoService`,
  `NotificacoesService`, `ConfigService`, `SchedulerRegistry`, `PrismaService`
  (saudação) e o relógio injetável `RELOGIO` (`RelogioSistema`).
- **É usado por:** ninguém em código (é acionado pelo scheduler). Exporta o
  `AlertasService`.

## 10. Regras de negócio-chave
1. **Fuso de Brasília:** todos os crons disparam no horário **local** (UTC−3),
   não no do servidor (UTC).
2. **Só alerta se ainda pendente:** lembretes e alertas de checklist/fechamento
   não incomodam quando a tarefa já foi concluída.
3. **Dia operacional de Brasília** nas pendências de fim do dia (evita cair no
   dia seguinte em UTC).
4. **Aviso de importações pendentes descontinuado** (apenas log).
5. **Saudação personalizada por perfil e horário:** fiscais na entrada da
   escala; gestores às 06:50; determinística pelo domínio puro.
6. **Best-effort na saudação:** uma falha individual nunca derruba o cron.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `alertas.service.spec.ts` | Disparo dos crons com relógio fixo, destinatários e dia operacional | 10 |
| `saudacao-diaria.domain.spec.ts` | Regras puras da saudação (período, texto por resultado) | 6 |
| `saudacao-diaria.service.spec.ts` | Resolução da conta do fiscal pela ficha canônica (A.3) | 1 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 **Código morto parcial:** `dispararAlertaImportacoesPendentes` mantém a
  detecção mas não envia mais aviso — candidato a remover se o negócio confirmar
  a descontinuação definitiva.
- ⚠️ **Controle de "já saudado" em memória** (`Set` por instância): em múltiplas
  instâncias/reinícios pode saudar de novo; hoje aceitável (uma instância).
- ⚠️ **Offset fixo de Brasília (UTC−3)** codificado; correto desde o fim do
  horário de verão (2019), mas quebraria se ele voltasse.
