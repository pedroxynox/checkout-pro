> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/checkouts/`

# Área: `checkouts`

## 1. Propósito
Quadro das caixas (PDVs) para **reportar e acompanhar avarias** de equipamentos
(CPU, teclado, scanner, pinpad, monitor, impressora, gaveta, balança, outro),
com foto opcional, resolução pela gestão e configuração da quantidade de caixas.

## 2. Quem usa (perfis)
- **Todo fiscal** (`CHECKOUTS`): vê o quadro, abre uma caixa e **reporta** avaria.
- **Gestão** (`CHECKOUTS_GERENCIAR`): marca avarias como **resolvidas**.
- **Gestor/admin**: configura a quantidade de check-outs em Centro de Controle
  (rota `CheckOutsConfig`).
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `CheckOutsScreen.tsx` | Quadro das caixas (verde = ok, vermelho = avaria) | 200 |
| `CheckOutDetalheScreen.tsx` | Detalhe: reportar avaria e listar abertas/resolvidas | 336 |
| `CheckOutsConfigScreen.tsx` | Configurar quantidade de check-outs | 93 |

## 4. Fluxo do usuário
1. **Quadro** (`CheckOutsScreen`): carrega o quadro de caixas; um aviso resume quantas
   caixas têm avaria aberta. As caixas ficam ordenadas por prioridade (com
   avaria primeiro, mais avarias antes; depois em ordem numérica). Cada card
   mostra o PDV, o status, os equipamentos e a marca de **falha recorrente**.
2. **Detalhe** (`CheckOutDetalheScreen`): seleciona o equipamento (chips),
   descreve o problema, opcionalmente **anexa foto** (galeria) e reporta.
   Lista as avarias **abertas** e **resolvidas**; a gestão pode marcar como
   resolvido. Fotos podem ser ampliadas em overlay.
3. **Configuração** (`CheckOutsConfigScreen`): define quantas caixas existem
   (1 a 200), numeradas de 1 até o total.
Cada tela trata os estados **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Quadro | `checkoutsService.tablero()` | `GET /checkouts` |
| Avarias da caixa | `checkoutsService.doCheckout(numero)` | `GET /checkouts/:numero` |
| Reportar avaria (+foto) | `checkoutsService.reportar(numero, dados, foto?)` | `POST /checkouts/:numero/reportes` |
| Resolver avaria | `checkoutsService.resolver(id)` | `POST /checkouts/reportes/:id/resolver` |
| Ler configuração | `checkoutsService.config()` | `GET /checkouts/config` |
| Definir configuração | `checkoutsService.definirConfig(qtd)` | `PUT /checkouts/config` |

Módulo do backend relacionado: [`checkouts`](../03-atlas-backend/checkouts.md).

## 6. Estado local e regras de UI
- O detalhe guarda o equipamento selecionado, a descrição, a foto escolhida e
  os flags de envio/imagem ampliada.
- **Validação do reporte:** exige equipamento e descrição não vazia antes de
  enviar; a foto é opcional.
- **Avaria duplicada:** se o backend responde `409`, a tela mostra o aviso
  "Já reportada" (avaria já aberta do mesmo equipamento na caixa) e recarrega.
- **Foto:** requer permissão de galeria (`expo-image-picker`); o envio usa
  `FormData` (upload multipart). A URL da imagem é montada com `API_BASE_URL`.
- **Configuração:** aceita apenas inteiros entre 1 e 200.

## 7. Lógica pura / utilidades
- `rotuloPdv(numero)`: formata "PDV 01", "PDV 02"… (dois dígitos).
- `ROTULO_EQUIPAMENTO`: rótulos amigáveis dos equipamentos.
- `urlImagem(caminho)`: monta a URL absoluta da foto a partir do `API_BASE_URL`.
- Ordenação do quadro por prioridade de avaria (no `CheckOutsScreen`).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `Botao`, `CampoTexto`, `Aviso`, `Carregando`,
  `MensagemErro`, `EstadoVazio`, `Selo`, `ApiError`, `notificar`,
  `formatarDataHora` — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (sem arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- ⚠️ O reporte com foto depende de permissão de galeria; se negada, o envio
  segue sem imagem.
- ⚠️ As URLs de foto dependem de `API_BASE_URL` correto no ambiente do app.
