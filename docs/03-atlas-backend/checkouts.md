> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `backend/src/checkouts/`

# Módulo: `checkouts`

## 1. Propósito
Seção Check-Outs (PDVs): registra e acompanha **avarias de equipamentos por
caixa**, monta o tablero de estado das caixas, notifica a gestão e permite
resolver os reportes.

## 2. Responsabilidades e limites
- **Faz:** guarda a quantidade de caixas da loja; registra reportes de avaria
  (com foto opcional); monta o tablero (avarias abertas por caixa + marca de
  problema recorrente no mês); lista e resolve reportes; e envia avisos à gestão
  (nova avaria, recorrência) e ao fiscal (avaria resolvida).
- **Não faz:** autenticação/permissões (usa o decorator de
  [`permissoes`](permissoes.md)); armazenamento do arquivo de imagem em si
  (delega ao `OBJECT_STORAGE`); o envio das notificações (delega a
  [`notificacoes`](notificacoes.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `checkouts.controller.ts` | Rotas HTTP (tablero, config, reportes) | 140 |
| `checkouts.service.ts` | Regras de aplicação: reportes, tablero, notificações | 244 |
| `checkouts.domain.ts` | Regras puras: equipamentos, validações, tablero, recorrência | 142 |
| `checkouts.module.ts` | Ligações (DI) do módulo | 17 |
| `dto/checkouts.dto.ts` | Validação de entrada das rotas | 37 |

## 4. Endpoints (rotas HTTP)
> Lista canônica em [API HTTP → `checkouts`](../05-referencia-dados/api-http.md#checkouts).

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /checkouts` | `CHECKOUTS` | Tablero: quantidade de caixas + avarias abertas por caixa. |
| `GET /checkouts/config` | `CHECKOUTS` | Quantidade de check-outs configurada. |
| `PUT /checkouts/config` | `OPERADORES_CRUD` | Define a quantidade de check-outs (gerente/admin). |
| `GET /checkouts/reportes` | `CHECKOUTS` | Lista reportes por status (`?status=ABERTO`). |
| `POST /checkouts/reportes/:id/resolver` | `CHECKOUTS_GERENCIAR` | Marca um reporte como resolvido. |
| `GET /checkouts/:numero` | `CHECKOUTS` | Reportes de um check-out (abertos primeiro). |
| `POST /checkouts/:numero/reportes` | `CHECKOUTS` | Registra uma avaria (foto opcional no campo `file`). |

> As rotas estáticas (`config`, `reportes`) vêm **antes** de `:numero` para não
> colidirem com o parâmetro.

## 5. Serviços e funções

### `CheckoutsService`

#### `obterQuantidade()` / `definirQuantidade(quantidade, por?)`
Lê/atualiza a quantidade de caixas no singleton `ConfigSistema` (padrão 38).
`definirQuantidade` valida os limites (1..200) antes de gravar.

#### `tablero()`
- **Devolve:** a quantidade e, por caixa (1..N), a contagem de avarias abertas,
  os equipamentos afetados e a marca de problema recorrente no mês.
- **Efeitos:** apenas leitura (abertos + reportes do mês).

#### `reportesDoCheckout(numero)` / `listarReportes(status?)`
Reportes de uma caixa (abertos primeiro) ou lista geral por status (até 300, mais
recentes primeiro).

#### `criarReporte(input, usuario?)`
- **Recebe:** número da caixa, equipamento, descrição e foto opcional.
- **Devolve:** o `CheckoutReporte` criado.
- **Efeitos:** valida caixa e equipamento; **bloqueia duplicata** (avaria aberta
  do mesmo equipamento na mesma caixa); cria o reporte `ABERTO`; notifica quem
  tem `CHECKOUTS_GERENCIAR`; e, ao **atingir o limiar** de recorrência no mês,
  dispara um aviso extra (uma única vez).
- **Erros:** `BadRequestException` (caixa/equipamento inválido),
  `ConflictException` (avaria já aberta).

#### `resolver(id, usuario?)`
Marca o reporte como `RESOLVIDO` (idempotente) e avisa o fiscal que reportou.
Lança `NotFoundException` se o reporte não existir.

## 6. Lógica de domínio (funções puras)
- `EQUIPAMENTOS_CHECKOUT` / `ehEquipamentoValido(v)` — universo de equipamentos.
- `rotuloEquipamento(v)` — rótulo amigável para as mensagens.
- `quantidadeValida(n)` — inteiro entre `MIN_CHECKOUTS` (1) e `MAX_CHECKOUTS` (200).
- `primeiroDiaDoMes(data)` — base do contador mensal (UTC).
- `montarTablero(quantidade, abertos, reportesDoMes)` — resume avarias abertas por
  caixa e marca recorrência quando um equipamento atinge `LIMIAR_RECORRENCIA` (3)
  no mês.

## 7. Estados e enums
- `EquipamentoCheckout`: `CPU` · `TECLADO` · `SCANNER` · `PINPAD` · `MONITOR` ·
  `IMPRESSORA` · `GAVETA` · `BALANCA` · `OUTRO`.
- `StatusReporte`: `ABERTO` · `RESOLVIDO`. Transição: `ABERTO → RESOLVIDO` ao
  chamar `resolver` (irreversível pela API).

## 8. Dados que o módulo toca
- **Escreve:** `CheckoutReporte`, `ConfigSistema` (quantidade de caixas).
- **Lê:** `CheckoutReporte`, `ConfigSistema`.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `PrismaService`, `NotificacoesService`, `OBJECT_STORAGE`
  (armazenamento da foto) e o domínio de imagem de `checklist` (`ehImagem`,
  `extensaoImagemSegura`).
- **É usado por:** o app (tela Check-Outs).

## 10. Regras de negócio-chave
1. **Uma avaria aberta por equipamento/caixa**: reportar de novo o mesmo é
   bloqueado até resolver (evita ruído).
2. **Recorrência no mês**: ao atingir o 3º reporte do mesmo equipamento na mesma
   caixa, avisa a gestão uma única vez (avaliar manutenção/troca).
3. **Quantidade de caixas** limitada a 1..200; reportes de caixas acima da
   quantidade atual somem do tablero, mas o histórico permanece.
4. **Resolver é idempotente** e avisa o fiscal que reportou.
5. **Foto é opcional**, mas quando enviada é validada como imagem.
6. Notificações são **best-effort** (nunca bloqueiam o registro/resolução).

## 11. Testes
Não se aplica: o módulo não possui arquivos `*.spec.ts` próprios (a lógica pura
do tablero/recorrência em `checkouts.domain.ts` é candidata a cobertura futura).

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ `checkouts.domain.ts` (tablero/recorrência) não tem testes automatizados,
  apesar de ser lógica pura testável — candidato a spec dedicado.
- 🔧 A quantidade de caixas divide o mesmo singleton `ConfigSistema` com outras
  configurações; convém documentar quem mais escreve nesse registro.
- ⚠️ O tablero faz duas leituras da tabela de reportes (abertos + mês); em lojas
  com muito histórico, avaliar índice/consulta agregada.
