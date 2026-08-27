> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-08-26 · **Cobre:** `mobile/src/screens/escala/`

# Área: `escala`

## 1. Propósito
Publicar a escala: gerar a escala do **dia** ou da **semana**, com todo o time, em
**PDF** ou **imagem 4K**, para enviar aos colaboradores.

## 2. Quem usa (perfis)
- **Quem vê a escala** (`ESCALA_VISUALIZAR`): supervisão, gerência, administração
  e também o fiscal. Quem já podia ver a escala pode publicá-la — o documento não
  mostra nada além do que a tela de escala já mostrava.
- A tela é **só leitura**: não lança falta, não edita horário. Isso continua no
  [Quadro de Operadores](operadores.md) e no cadastro do colaborador.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `EscalaScreen.tsx` | Tela: seletor de período/dia, prévia e os dois botões de exportação | 450 |

Utilidades que fazem o trabalho pesado (fora da área, porque são puras):
| Arquivo | Papel | Linhas |
|---|---|---|
| `utils/escalaLayout.ts` | Desenho da escala (dia e semana) como **SVG**, no tamanho final | 770 |
| `utils/imagemEscala.ts` | Converte o SVG em **PNG** e dispara o download | 121 |
| `utils/logoEscala.ts` | Logo do rodapé como data URI (ponto único de troca) | 17 |

## 4. Fluxo do usuário
1. Entra por **Escalas › "Publicar escala (PDF ou imagem)"** (atalho no Quadro de
   Operadores).
2. Escolhe **Dia** ou **Semana** e a data. O futuro é liberado: publicar a escala
   de amanhã é o caso normal.
3. Confere a **prévia** — as mesmas seções, nomes e horários que vão sair no
   documento.
4. **Baixar PDF** (abre a folha de impressão do sistema; funciona no aplicativo e
   no navegador) ou **Baixar imagem 4K** (só no navegador).
5. Envia à equipe. A tela avisa para mandar **como documento** no WhatsApp.

Estados de **carregando / erro** tratados pelo `useRequisicao`; a prévia vazia é
coberta pelas próprias contagens (uma escala sem ninguém não acontece com o
cadastro em uso).

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Escala do dia | `escalaExportacaoService.dia(data)` | `GET /escala-exportacao/dia` |
| Escala da semana | `escalaExportacaoService.semana(data)` | `GET /escala-exportacao/semana` |

Módulo do backend relacionado:
[`escala-exportacao`](../03-atlas-backend/escala-exportacao.md).

## 6. Estado local e regras de UI
- Estado: `periodo` (`DIA`/`SEMANA`), `data` (ISO) e `gerando` (`PDF`/`IMAGEM`,
  para o botão mostrar progresso e não aceitar dois toques).
- **Um desenho, duas saídas.** O PDF embute o mesmo SVG que a imagem rasteriza.
  Se cada saída tivesse o seu próprio desenho, as duas iriam divergindo — e a
  equipe receberia duas escalas parecidas mas diferentes, que é pior do que
  receber uma só.
- **A prévia não é o SVG renderizado.** É uma leitura nativa dos mesmos dados.
  Interpretar o SVG em runtime só para conferir o que o PDF já mostra fiel não se
  paga; a prévia serve para confirmar **conteúdo** (quem está, quem falta, os
  horários), não a arte final.
- **O botão da imagem só aparece onde ela funciona.** A conversão usa `canvas`,
  que existe no navegador (inclusive o do celular) e não no APK. Sem suporte, a
  tela troca o botão por uma explicação apontando o PDF — um botão que não
  funciona é pior do que a ausência dele.
- **Aviso do WhatsApp.** Enviada como foto, a imagem é recomprimida e o 4K se
  perde. O aviso está na tela porque é a decepção mais provável do fluxo: gerar
  em 4K e a equipe receber algo borrado.
- **Orientação por tipo de documento**, não pela proporção: o dia é **retrato**
  (2160 px de largura — o lado curto do 4K, que é o que dá nitidez ao ampliar no
  celular) e a semana é **paisagem** (3840 px, porque a grade tem sete colunas e
  em retrato elas ficariam estreitas demais para "07:00 – 15:20").

## 7. Lógica pura / utilidades
`utils/escalaLayout.ts` (testado):
- `svgEscalaDia(escala, opcoes)` → retrato: identidade da loja, dia em destaque,
  selos de feriado/rodízio, contagens, seções por função com uma linha por pessoa
  (nome + turno à esquerda, horário à direita, separador e zebra) e rodapé.
- `svgEscalaSemana(escala, opcoes)` → paisagem: grade com pessoas nas linhas e os
  sete dias nas colunas; cada célula traz entrada/saída ou o estado.
- `htmlDeImpressao(imagem, titulo)` → documento de uma página com a folha
  proporcional ao desenho (altura livre: a escala é contínua, e forçá-la em A4
  cortaria pessoas no meio).
- `nomeArquivoEscala(tipo, referenciaISO, extensao)` → `escala-dia-2026-07-21.png`.
- Internos que merecem nota: `encurtar` (SVG não corta texto sozinho — sem isso um
  nome comprido invadiria a coluna do horário) e o escape XML (um `&` num nome
  quebraria o SVG inteiro e a escala sairia **em branco**).

`utils/imagemEscala.ts`:
- `suportaImagemPng()` → decide qual botão oferecer.
- `baixarEscalaComoPng(imagem, nome)` → rasteriza **1:1** (sem reamostragem, que é
  o que mantém o texto nítido), com **fundo branco explícito** (sem ele o PNG sai
  transparente e aplicativos de mensagem o exibem sobre fundo escuro, apagando o
  texto) e limite de segurança de lado: navegadores recusam canvas gigantes **em
  silêncio**, devolvendo um PNG em branco.
- O SVG é carregado por **blob**, não por `data:` URI: escalas grandes passam de
  centenas de milhares de caracteres e nesse tamanho a URL embutida falha em
  alguns navegadores.

`utils/logoEscala.ts`:
- O logo é **data URI** de propósito: o SVG precisa ser autossuficiente, porque um
  `<image>` apontando para URL externa não é carregado na conversão para PNG — o
  rodapé sairia em branco e só se descobriria depois de enviar a escala.
- Enquanto a constante estiver vazia, o rodapé mostra o nome da loja em texto: a
  escala continua completa, só sem a marca.

## 8. Componentes e hooks compartilhados usados
`Tela`, `Cartao`, `Segmentado`, `SeletorData`, `Botao`, `Selo`, `Carregando`,
`MensagemErro`; `useRequisicao`, `useConfigSistema`, `notificar` e
`imprimirRelatorio` (`utils/impressao`, o mesmo caminho dos relatórios de
perfil). Ver [Componentes compartilhados](componentes-compartilhados.md) e
[Hooks e utilidades](hooks-e-utilidades.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `EscalaScreen.test.tsx` | Prévia do dia (nome, horário, quem folga), PDF com o desenho, imagem com nome de arquivo previsível, aviso do WhatsApp, ausência do botão de imagem sem canvas e troca para a semana | 6 |
| `utils/escalaLayout.test.ts` | Dimensões e orientação declarada, dia da semana/data, seções, horários, folga, falta com turno preservado, horário especial, feriado, rodízio do domingo, assinatura do rodapé, logo (com e sem), escape de caracteres, grade dos sete dias e a folha de impressão | 19 |

## 10. Riscos, dívidas e pendências
- ⚠️ **A imagem não é gerada no APK** (não há `canvas`). O caminho para resolver é
  `react-native-view-shot` + `expo-sharing`, que são dependências **nativas** e só
  passam a existir num APK novo. Enquanto isso, no aplicativo vale o PDF, com o
  mesmo desenho.
- ⚠️ **O logo ainda não está embutido** (`LOGO_ESCALA_DATA_URI` é `null`): o rodapé
  sai com o nome da loja em texto até o arquivo ser colocado ali.
- 🔧 `escalaLayout.ts` calcula posições à mão porque o tamanho final em pixels é
  requisito. É legível, mas mexer no layout exige atenção aos deslocamentos; se
  crescer mais, vale extrair um pequeno "empilhador de blocos".
- ⚠️ Escalas muito grandes (centenas de pessoas) geram imagens muito altas. Há
  limite de segurança com mensagem clara, mas o caminho nesse caso é publicar por
  função.
