> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-15 · **Cobre:** `backend/src/vendas/`

# Módulo: `vendas`

## 1. Propósito
Importa o arquivo diário de **vendas por hora** (Painel de Vendas), mantém o
total diário que alimenta os indicadores e oferece as análises inteligentes:
totais por período, distribuição por hora, projeção de fechamento, comparativos,
tendência, curva típica, heatmap e estimativas de venda por dia.

## 2. Responsabilidades e limites
- **Faz:** lê o `.txt` de vendas por hora e substitui o dia; mantém o total
  diário em `VendaDiaria`; calcula totais (dia/semana/mês) e distribuição por
  hora; monta o painel inteligente (projeção, comparativos, tendência, curva
  horária, heatmap, padrão por dia da semana); guarda as **estimativas de venda
  por dia** (cuja soma é a meta do mês); e envia avisos inteligentes (recorde,
  queda, meta em risco).
- **Não faz:** a arrecadação por operador (fica em [`arrecadacao`](arrecadacao.md),
  que só lê os totais daqui); a conclusão/aviso do fechamento (delega a
  [`fechamento`](fechamento.md)); **resolver** a meta mensal (pede a
  [`metas`](metas.md), que a calcula somando as estimativas guardadas aqui —
  ver [ADR 0017](../02-arquitetura/decisoes/0017-meta-de-vendas-derivada-das-estimativas.md));
  não há ajuste manual de vendas — só pelo arquivo.

## 3. Arquivos do módulo
| Arquivo | Papel |
|---|---|
| `vendas.controller.ts` | Rotas HTTP (upload, resumo, por-hora, painel, painel-resumo, estimativas) |
| `vendas.service.ts` | Regras de aplicação: importação, painel, estimativas, avisos |
| `vendas.parser.ts` | Lê o `.txt` por cabeçalho (hora + valor líquido) |
| `vendas.domain.ts` | Utilitários puros de período/hora, dias da semana e **estatística de movimento** (média por dia da semana, heatmap, venda numa faixa) |
| `vendas.module.ts` | Ligações (DI) do módulo |
| `dto/vendas.dto.ts` | Validação de entrada das rotas |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `vendas`](../05-referencia-dados/api-http.md#vendas).

O controller exige `PAINEL_VENDAS_VISUALIZAR` por padrão; algumas rotas reforçam
outra permissão.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `POST /vendas/upload` | `IMPORTACOES` | Recebe o `.txt` de vendas por hora e importa o dia (substitui). |
| `GET /vendas/resumo` | `PAINEL_VENDAS_VISUALIZAR` | Totais do dia/semana/mês. |
| `GET /vendas/por-hora` | `PAINEL_VENDAS_VISUALIZAR` | Distribuição por hora + total no intervalo. |
| `GET /vendas/status` | `FECHAMENTO`, `IMPORTACOES` ou `CARGA_STATUS_VISUALIZAR` | Se as vendas do dia já foram enviadas. |
| `GET /vendas/painel` | `PAINEL_VENDAS_VISUALIZAR` | Painel inteligente consolidado (com perfis de 90 dias). |
| `GET /vendas/painel-resumo` | `PAINEL_VENDAS_VISUALIZAR` | Resumo leve do painel (meta, projeção e comparativos), sem os perfis de 90 dias — caminho rápido da Home. |
| `GET /vendas/estimativas` | `PAINEL_VENDAS_VISUALIZAR` | Estimativas por dia de um mês (+ total, que é a meta do mês). |
| `PUT /vendas/estimativas` | `PAINEL_VENDAS_EDITAR` | Define as estimativas do mês (upsert em lote). **Único caminho para alterar a meta de vendas.** |
| `POST /vendas/limpar-sem-hora` | `USUARIOS_CRUD` | Remove totais diários sem detalhe por hora. |

> **Removidas (ADR 0017):** `GET /vendas/config` e `PUT /vendas/config` deixaram
> de existir junto com a meta digitada. A meta do mês não tem endpoint próprio:
> é a soma das estimativas.

## 5. Serviços e funções

### `VendasService`

#### `importar(data, linhas)`
- **Recebe:** a data de referência e as linhas por hora já lidas do arquivo.
- **Devolve:** `ResultadoUploadVendas` (horas, total e se concluiu o fechamento).
- **Efeitos:** valida a data contra a Data Inicial do Sistema; numa transação,
  **apaga as vendas por hora do dia** e recria, e faz upsert do total em
  `VendaDiaria`; chama `fechamento.concluirSeCompletou`; dispara os avisos
  inteligentes (best-effort).
- **Regras aplicadas:** cada envio substitui o dia inteiro. O controller ainda
  bloqueia reenvio por quem não é gerente/administrador/importador quando o dia
  já foi enviado.

#### `resumo(data)` · `porHora(inicio, fim)` · `status(data)`
Totais do dia/semana/mês; distribuição por hora somada no intervalo; e se já há
vendas enviadas no dia.

#### `listarEstimativas(anoMes)` / `definirEstimativas(anoMes, itens)` / `estimativaDoDia(dia)`
Estimativas de venda por dia de um mês. `definirEstimativas` faz upsert em lote
(valor 0 **remove** a estimativa do dia). O `totalMes` devolvido **é a meta do
mês**: usa a mesma função pura (`metaDeEstimativas`, do domínio de
[`metas`](metas.md)) que o `MetasService`, para a Central de Vendas e o Painel de
Vendas nunca divergirem. Como a meta é essa soma, editar estimativas **altera a
meta** — inclusive o aviso de "meta em risco" e o Resumo do Dia.

#### `painelResumo(dataRef?)`
Parte **leve** do painel: meta mensal (via `MetasService`), acumulado do mês,
projeção run-rate e comparativos (dia/semana/mês vs período anterior). **Não**
varre os ~90 dias dos perfis típicos, então é bem mais rápido — é o que a Home
(Resumo do Dia e contagens de pendências) consome via `/vendas/painel-resumo`.

#### `painel(dataRef?)`
Painel consolidado completo: reaproveita `painelResumo` e acrescenta tendência de
30 dias, curva horária típica, hora de pico, heatmap 7×24 e padrão por dia da
semana. Usa uma janela de 90 dias para esses perfis típicos.

#### `limparSemDetalheHora()`
Manutenção: remove os `VendaDiaria` sem detalhe por hora correspondente.

#### Privadas relevantes
- `avisarVendas(dia, total)` — dispara notificações de dia recorde, queda anômala
  (< 70% da média do mesmo dia da semana, com ≥ 3 amostras) e meta em risco (a
  partir do dia 10, projeção < 90% da meta).
- `calcularPerfilHorario(...)` / `calcularPadraoDiaSemana(...)` — perfis típicos.

## 6. Lógica de domínio (funções puras)
- Utilitários de período em UTC reexportados de `common/datas`.
- `intervaloDoMes(anoMes)` e `metaDeEstimativas(valores)` vêm do domínio de
  [`metas`](metas.md) — compartilhados de propósito, para que o total da Central
  de Vendas e a meta do mês sejam sempre o mesmo cálculo.
- `diasNoMes(data)` / `deslocarMeses(data, meses)` (com clamp no fim do mês).
- `horaParaMinutos(hhmm)` — converte "HH:mm" em minutos; `null` se inválido.
- `NOMES_DIA_SEMANA` — nomes curtos dos dias (0=Dom..6=Sáb).
- `mediaPorDiaSemana(diarios, { ehFeriado?, minAmostras? })` → média do total
  diário por dia da semana, com o tamanho da amostra. **Feriados podem ser
  excluídos** por predicado, e há um piso de amostras (`MIN_AMOSTRAS_DIA_SEMANA`
  = 3, o mesmo do aviso de queda anômala) abaixo do qual a média vem `null` em
  vez de virar ruído. O painel passa `minAmostras: 1` porque ali a média é
  informativa e não decide nada; a Compensação de horas usa o piso padrão,
  porque ali o número escolhe o dia de folga de alguém.
- `heatmapDiaSemanaHora(regs)` → matriz 7×24 com a média de venda de cada hora
  por dia da semana. Divide pelos **dias distintos** observados, e não pelo total
  de registros: sem isso, um dia da semana com mais semanas de história pareceria
  vender mais por hora só por ter mais amostras.
- `vendaMediaNaFaixa(linhaHeatmap, inicioMin, fimMin)` → soma da venda média de
  uma faixa de horas, contando as horas das pontas **proporcionalmente** (um
  turno que acaba às 14h30 leva metade da hora 14). Sem a proporção, uma faixa de
  2h30 e uma de 3h pesariam igual.

> **Por que estas três moram no domínio, e não no service:** além do painel de
> vendas, a [`compensacao-horas`](compensacao-horas.md) precisa responder "que dia
> da semana move menos?" e "que ponta do turno move menos?" para sugerir quando
> liberar alguém. Duas implementações da mesma estatística divergiriam no
> primeiro caso de borda, e as duas telas passariam a contar histórias diferentes
> sobre o mesmo dia. `calcularPerfilHorario` e `calcularPadraoDiaSemana` (ambos
> privados no service) agora **delegam** a elas.
- Parser (`vendas.parser.ts`): localiza a hora dentro da coluna "Empresa : Hora",
  prefere o valor líquido ("liq" + "valor"), ignora a linha de total e soma
  múltiplas linhas por hora.

## 7. Estados e enums
Não se aplica: o módulo não define enums nem máquina de estados (o único "estado"
relevante é `status.enviado`, um booleano do dia).

## 8. Dados que o módulo toca
- **Escreve:** `VendaHora`, `VendaDiaria`, `EstimativaVendaDia`.
- **Lê:** `VendaHora`, `VendaDiaria`, `EstimativaVendaDia`, e a meta mensal via
  `MetasService`.
- **Não toca mais:** `ConfigVendas` (tabela obsoleta desde a ADR 0017).
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `FechamentoService`, `MetasService`,
  `NotificacoesService` (opcional) e `ValidacaoDataService` (opcional).
- **É usado por:** o app (Painel de Vendas); indiretamente o módulo
  `arrecadacao` (que lê `VendaDiaria` para os percentuais dos indicadores); e a
  [`compensacao-horas`](compensacao-horas.md), que consome **só as funções puras**
  de `vendas.domain.ts` (não o service) para ranquear os dias mais fracos do
  ciclo e escolher a ponta do turno a liberar.

## 10. Regras de negócio-chave
1. **O upload substitui o dia** de vendas; não existe ajuste manual.
2. **Reenvio de um dia já enviado** só por gerente/administrador/importador.
3. O total diário fica em `VendaDiaria` — é a fonte dos percentuais dos
   indicadores base VENDAS.
4. **Estimativa com valor 0 remove** a estimativa daquele dia.
5. **A soma das estimativas do mês é a meta do mês** — não existe meta digitada
   nem endpoint de meta neste módulo (ADR 0017).
6. Avisos inteligentes são **best-effort** (nunca quebram a importação).
7. Perfis típicos (curva/heatmap/padrão) usam janela de 90 dias; tendência, 30.
8. Datas anteriores à Data Inicial do Sistema são rejeitadas na importação.

## 11. Testes
Não se aplica: o módulo não possui arquivos `*.spec.ts` próprios (a lógica de
período/hora é coberta pelos utilitários de `common/datas`).

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 `vendas.service.ts` concentra importação, painel, estimativas e avisos;
  candidato a extrair um serviço de "painel/inteligência".
- ⚠️ Sem testes automatizados próprios, o parser e o cálculo do painel dependem de
  verificação manual; formatos de arquivo diferentes podem mapear colunas erradas.
  (A **meta** do mês passou a ser coberta pelos testes de [`metas`](metas.md).)
- ⚠️ A projeção run-rate divide pelo número de dias com venda, o que pode
  distorcer o fechamento no início do mês (poucas amostras).
- ⚠️ A matemática de meta/projeção/semáforo segue **inline** no serviço e
  duplicada no app (o painel recalcula o percentual e a cor). Extrair para
  domínio puro continua pendente.
