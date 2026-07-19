> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/checklist/`

# Área: `checklist`

## 1. Propósito
Registrar e auditar os **checklists de abertura e fechamento** por foto: no dia
selecionado mostra status rico (feito no prazo/atrasado/pendente/não feito), a
janela de execução, quem enviou e o print, com **métricas do mês** no topo e um
**calendário** do mês embaixo; sinaliza foto repetida (anti-fraude).

## 2. Quem usa (perfis)
- **Equipe** que executa os checklists: envia a foto (câmera/galeria) no próprio
  dia e consulta o status.
- **Gestão/auditoria**: acompanha métricas de cumprimento, o print enviado e o
  histórico no calendário.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `ChecklistScreen.tsx` | Tela principal: cards de abertura/fechamento, métricas e calendário do mês | 717 |

## 4. Fluxo do usuário
1. **Dia:** `ChecklistScreen` seleciona o dia e carrega o estado dos dois
   checklists, as métricas do mês e o histórico do mês.
2. **Enviar:** no próprio dia, o card de cada checklist permite **tirar foto**
   ou escolher **da galeria** (pede permissão via `expo-image-picker`); ao
   enviar, marca "Feito" e mostra quem enviou/quando e a miniatura do print.
3. **Auditoria:** toca na miniatura para ampliar em tela cheia; se o print for
   idêntico a outro já enviado, aparece um aviso anti-fraude.
4. **Calendário:** mostra, por dia, dois pontos (abertura e fechamento) com
   cores por status; toca num dia válido para carregá-lo e navega entre meses
   dentro dos limites permitidos.
Trata **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Estado do dia | `checklistService.estado(data)` | `GET /checklist/estado` |
| Métricas do mês | `checklistService.metricas(data)` | `GET /checklist/metricas` |
| Histórico do mês | `checklistService.historicoMes(data)` | `GET /checklist/historico-mes` |
| Enviar imagem | `checklistService.enviarImagem(tipo, imagem, data)` | `POST /checklist/:tipo/imagem` |

Módulo do backend relacionado: [`checklist`](../03-atlas-backend/checklist.md).

## 6. Estado local e regras de UI
- **Só é possível carregar no próprio dia**: dias passados ficam travados (sem
  preenchimento retroativo) e dias futuros ainda não chegaram; a regra também é
  garantida no backend (`podeCarregar`/`mensagemBloqueio`).
- `statusVisual` define o rótulo/cor: feito no prazo (verde), atrasado/pendente
  (amarelo), não feito (vermelho); no calendário, dias futuros usam azul ("a
  fazer") para não parecerem atrasados.
- A imagem é montada como `FormData` (uri/name/type) e a URL do print é composta
  a partir de `API_BASE_URL`.
- A navegação de mês fica dentro de `[Data_Inicial_Sistema, hoje]`; o
  visualizador de foto é um `Modal` em tela cheia.

## 7. Lógica pura / utilidades
- `corStatus`/`visual` (cor e rótulo por status), `urlImagem` (compõe a URL do
  print) e `mudarMes` (navega respeitando os limites).
- `CalendarioMes`: monta a grade do mês com células vazias de alinhamento e dois
  pontos de status por dia.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `SeletorData`, `Botao`, `Aviso`, `MensagemErro`,
  `Carregando`, `Modal`/`Image`/`Alert` (RN), `expo-image-picker`; `ApiError`
  — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (a área não possui arquivos `*.test.tsx`/`*.test.ts`).

## 10. Riscos, dívidas e pendências
- 🔧 `ChecklistScreen.tsx` concentra card, calendário e visualizador num só
  arquivo; o calendário poderia virar componente compartilhado.
- ⚠️ A detecção de print duplicado é sinalização (aviso), não bloqueio; a
  auditoria final é humana.
- ⚠️ O envio depende de permissão de câmera/galeria do dispositivo; sem
  concessão, exibe alerta e não envia.
