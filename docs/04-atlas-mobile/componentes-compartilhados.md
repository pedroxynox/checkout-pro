> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/components/`

# Componentes compartilhados

## 1. Propósito
Reúne os **componentes de UI reutilizáveis** do app (Expo/React Native +
TypeScript). São a base visual comum a todas as telas: enquadramento, cartões,
botões, campos, selos, estados de carregamento/erro/vazio, avisos, gráficos,
seletor de data, leitor de código de barras, diálogos e toast de notificação.
Todos consomem o [tema](hooks-e-utilidades.md#5-tema-visual) (cores,
espaçamento, tipografia, raios e sombras), de modo que a identidade visual fica
centralizada e consistente.

Todo o texto exibido é em **português (pt-BR)**.

## 2. Inventário
Todos os componentes públicos são reexportados por `components/index.ts`, então
as telas importam de `../../components`.

| Arquivo | Símbolo(s) | O que faz | Linhas |
|---|---|---|---|
| `Tela.tsx` | `Tela` | Contêiner base de tela: área segura, fundo do tema, rolagem opcional e "pull-to-refresh" (`aoAtualizar`/`atualizando`). Inclui rodapé discreto "Uso interno · Conteúdo confidencial". | 98 |
| `Cartao.tsx` | `Cartao` | Cartão de superfície com sombra leve para agrupar conteúdo; aceita `titulo`, `rodape` e estilos (`estilo`/`style`). | 54 |
| `CartaoMetrica.tsx` | `CartaoMetrica` | Cartão de métrica com ícone em caixa de cor suave, valor em destaque e rótulo curto (grades de resumo). | 90 |
| `CartaoAcao.tsx` | `CartaoAcao` | Atalho tocável com ícone, título e linha de estado (contador/urgência); pensado para grade de 3 cartões. | 101 |
| `Botao.tsx` | `Botao` | Botão padrão com variantes (`primario`, `secundario`, `perigo`, `texto`), estado `carregando` e `desabilitado`. | 93 |
| `CampoTexto.tsx` | `CampoTexto` | Campo de texto rotulado, com mensagem de `erro` e todos os props de `TextInput`. | 70 |
| `Selo.tsx` | `Selo` | Selo/etiqueta colorida (ponto + texto) para status arbitrários. | 46 |
| `Aviso.tsx` | `Aviso` | Caixa de aviso in-app com tom `info`/`alerta`/`sucesso` e ícone. | 55 |
| `Estados.tsx` | `Carregando`, `MensagemErro`, `EstadoVazio` | Feedbacks padronizados de tela: spinner, erro (com "Tentar novamente") e vazio (ícone/título/descrição). | 83 |
| `Diversos.tsx` | `Segmentado`, `LinhaInfo` | Controle segmentado (abas de seleção) e linha rótulo/valor. | 102 |
| `SeletorData.tsx` | `SeletorData` | Seletor de data anterior/seguinte sobre ISO `yyyy-mm-dd` (UTC), com limites de futuro e data mínima. | 100 |
| `Graficos.tsx` | `GraficoPizza`, `GraficoBarrasVerticais`, `montarFatias`, `CORES_GRAFICO`; tipos `FatiaGrafico`, `BarraVertical` | Gráficos sem dependências externas além de `react-native-svg`: pizza (rosca) interativa com legenda e barras verticais. | 337 |
| `LeitorCodigoBarras.tsx` | `LeitorCodigoBarras` | Modal de leitura de código de barras via `expo-camera`, com entrada manual como alternativa. | 177 |
| `MarkdownTexto.tsx` | `MarkdownTexto` | Renderizador leve de Markdown (negrito, listas, títulos) para as respostas da assistente. | 134 |
| `ProcedimentoView.tsx` | `ProcedimentoView` | Procedimento guiado: passo a passo em Markdown intercalado com as fotos do manual. | 90 |
| `ToastNotificacao.tsx` | `ToastNotificacao` | Toast no topo com a última notificação recebida via WebSocket; some sozinho ou ao toque. | 94 |
| `DialogHost.tsx` | `DialogHost` | Host único das janelas de confirmação/aviso, montado na raiz; escuta `utils/dialogos`. | 203 |
| `EmDesenvolvimento.tsx` | `EmDesenvolvimento` | Placeholder "em breve" para áreas ainda não construídas. | 66 |

## 3. Como usar / convenções
- **Importação:** sempre por `../../components` (barril `index.ts`), não pelo
  arquivo direto.
- **Idioma dos props:** a API dos componentes é em português — ex.:
  `aoPressionar`, `carregando`, `desabilitado`, `titulo`, `rotulo`, `erro`,
  `aoAtualizar`, `atualizando`, `aoMudar`.
- **Enquadramento:** toda tela deve ser envolvida por `Tela`. Para listas com
  atualização, passe `aoAtualizar`/`atualizando` (integra com
  [`useRequisicao`](hooks-e-utilidades.md#31-userequisicao)).
- **Estados de tela:** use o trio de `Estados` para o padrão
  carregando → erro → vazio, evitando telas "mudas".
- **Cores/estilos:** nunca use cores literais; sempre `cores`, `espacamento`,
  `raio`, `tipografia`, `sombra` do [tema](hooks-e-utilidades.md#5-tema-visual).
  As cores semânticas de status (verde/amarelo/vermelho) espelham a
  classificação do backend.
- **Gráficos:** monte as fatias com `montarFatias` (agrupa o excedente em
  "Outros") e use a paleta `CORES_GRAFICO`.
- **Diálogos:** não chame `Alert`/`window.confirm`; use `confirmar`/`notificar`
  de [`utils/dialogos`](hooks-e-utilidades.md#42-dialogos), exibidos pelo
  `DialogHost` (único, montado no `App.tsx`).

## 4. Dependências e integrações
- **Tema:** `../theme` — base de todos os estilos.
- **Ícones e SVG:** `@expo/vector-icons` (Ionicons), `lucide-react-native` (nas
  abas) e `react-native-svg` (gráficos).
- **Câmera:** `expo-camera` no `LeitorCodigoBarras`.
- **Contextos:** `ToastNotificacao` consome `NotificacoesContext`; `DialogHost`
  escuta `utils/dialogos`; `ProcedimentoView` monta URLs de imagem a partir de
  `API_BASE_URL`.
- **Montagem na raiz:** `DialogHost` é montado em `App.tsx`; `ToastNotificacao`
  em `RootNavigator` (dentro do app autenticado).

## 5. Testes
Cobrem os componentes com lógica não trivial (o restante é visual):

| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `SeletorData.test.tsx` | Navegação de dias e bloqueio de futuro/data mínima | 4 |
| `LeitorCodigoBarras.test.tsx` | Leitura, entrada manual e permissão de câmera | 4 |

Total: **8 casos** em 2 arquivos. Os componentes puramente visuais (ex.:
`Cartao`, `Selo`, `Aviso`) não têm teste dedicado.

## 6. Riscos e dívidas
- 🔧 `Graficos.tsx` (337 linhas) e `DialogHost.tsx` (203 linhas) concentram
  muita lógica visual; candidatos a serem quebrados se crescerem mais.
- ⚠️ `MarkdownTexto` é um renderizador **propositalmente mínimo** (negrito,
  listas e títulos). Markdown mais rico (tabelas, links, código) não é
  suportado — adequado só às respostas da assistente.
- ⚠️ `LeitorCodigoBarras` depende de hardware de câmera; a **entrada manual** é
  o caminho garantido em web/emulador (e nos testes).
