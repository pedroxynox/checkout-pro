> **Estado:** 🟡 Rascunho/parcial · **Responsável:** Produto · **Última verificação:** 2026-10-15 · **Cobre:** roteiro e prompts (Google Flow) do vídeo institucional

# Vídeo de apresentação — roteiro e prompts para o Google Flow

Roteiro completo do vídeo institucional do Check-out PRO, voltado à **direção do
supermercado e a investidores**, feito **100% dentro do Google Flow** (sem editor
externo): imagens de referência, prompts prontos para colar, narração em
português do Brasil gerada pelo próprio Flow e montagem final no **Criador de
cenas**.

**Ficha técnica:** 2 min 40 s · 16:9 · animação 3D + motion graphics + prints
reais do app · narração em off (pt-BR) · plano **Google AI Pro**.

> **Fontes de verdade usadas:** [Resumo executivo](../00-visao-geral/resumo-executivo.md),
> [Regras de negócio](../01-produto/regras-de-negocio/) e o
> [Atlas do mobile](../04-atlas-mobile/). A narração **não cita números** do
> projeto para não envelhecer (a fonte única é [Estado e métricas](estado-e-metricas.md)).

---

## 1. Tom, duração e voz

- **Tom:** executivo, seguro, sem exagero; benefício antes da função; frases
  curtas. Ato 1 tenso e frio → virada luminosa no clipe 04 → confiança
  crescente → fechamento calmo.
- **Duração:** 2 min 40 s. Problema e solução nos primeiros 40 s (quando a
  diretoria decide se continua assistindo).
- **Voz:** a narração é gerada pelo Flow dentro de cada clipe. Todo prompt traz
  **a mesma descrição de voz**; se um clipe sair com voz diferente, gere de novo.
- **Sem trilha musical:** cada clipe geraria uma música diferente e os cortes
  ficariam evidentes. O vídeo usa voz + som ambiente.

| Ato | Clipes | Tempo | Mensagem |
|---|---|---|---|
| 1 · O problema | 01–03 | 0:00–0:30 | A operação de hoje é manual, espalhada e cara. |
| 2 · A solução | 04 | 0:30–0:40 | Apresentação do Check-out PRO. |
| 3 · Um dia na loja | 05–12 | 0:40–2:00 | Da abertura ao fechamento, módulo por módulo. |
| 4 · Por dentro | 13–14 | 2:00–2:20 | Arquitetura, segurança e qualidade. |
| 5 · Resultado | 15–16 | 2:20–2:40 | Ganho para a gestão e assinatura. |

---

## 2. Regras de produção

1. **Modelo:** **Omni Flash** em todos os vídeos. Nos ajustes, deixe
   **1 resultado por pedido** (para não gastar o dobro).
2. **Sem marca do supermercado:** vermelho e branco, mas nenhum logotipo, nome,
   fachada ou sinalização legível. Os prompts já trazem essa trava.
3. **Telas do app:** só aparecem pelos **prints reais** (§5). O Flow nunca
   desenha a interface: ele deforma letras e números.
4. **Dados fictícios (LGPD):** o `backend/prisma/seed.ts` cadastra **nomes de
   colaboradores reais**. Tire os prints num ambiente de demonstração com nomes
   e números fictícios.
5. **Prompts em inglês** (o modelo responde melhor); a fala da narração vai em
   português, entre aspas.

### 2.1 Orçamento no plano Google AI Pro

Fonte: [Gestionar tus puntos de Google Flow](https://support.google.com/flow/answer/16526234?hl=es) (consultado em 2026-10-15).

- O plano Pro dá **1.000 pontos/mês** + **50 pontos/dia** (os diários não acumulam).
- Omni Flash 720p: **10 s = 15**, **6 s = 10**, **4 s = 7** pontos por vídeo.
  Em 360p custa cerca de metade — use para testar o enquadramento.
- Interpolação para **1080p é gratuita** no Pro (4K não está disponível).
- **Uma passada completa** (11 clipes de 10 s + 5 de 6 s + 5 de 4 s) ≈ **250
  pontos**. Com duas tentativas por clipe, ≈ 500. Cabe no mês com folga.

### 2.2 O que o vídeo **não** pode afirmar (fidelidade ao produto)

| Não dizer/mostrar | Por quê |
|---|---|
| "Inteligência artificial", assistente virtual | O app não tem IA; a assistente foi retirada em out/2026. |
| Push no celular com o app fechado (Android) | Depende do Firebase/FCM, ainda pendente. |
| "Funciona 100% offline" | Só o **registro de ponto** tem fila offline. |
| Que o sistema verifica todas as regras do TAC | Hoje verifica parte delas (ver [Ponto, jornada e TAC](../01-produto/regras-de-negocio/ponto-jornada-e-tac.md)). |
| Várias lojas / rede | O foco atual é uma loja 100% operacional. |

---

## 3. Passo a passo no Flow

1. **Criar as 10 imagens de referência** (§4) e salvá-las no projeto com o nome
   indicado (`fiscal`, `celular`…).
2. **Tirar os 5 prints** do app (§5.1) e subi-los ao projeto (`p1` … `p5`).
3. **Criar as 5 imagens de tela** (§5.2): o print colocado dentro do celular.
4. **Gerar os 16 clipes** (§6) e os **5 clipes de tela** (§5.3). Em cada
   prompt, chame as referências digitando `@` e o nome.
5. **Interpolar para 1080p** os escolhidos.
6. **Montar no Criador de cenas** na ordem da §7, recortar as pontas e
   **baixar** o vídeo final.

---

## 4. Imagens de referência (criar antes dos clipes)

| Nome | Usada em |
|---|---|
| `fiscal` | 05, 06, 11 |
| `supervisor` | 02, 08, 15 |
| `gerente` | 12, 15 |
| `loja-dia` | 01, 05, 08 |
| `loja-noite` | 12 |
| `celular` | 04, 05, 06, 08, 12 e telas T1–T4 |
| `relogio-ponto` | 03, 06 |
| `almoxarifado` | 11 |
| `escritorio` | 02, 15 |
| `espaco-3d` | 03, 04, 07, 09, 10, 13, 14, 16 e telas T1–T5 |

**`fiscal`**
```text
Photorealistic character reference sheet on a plain light-gray studio background. The same Brazilian woman in her late 20s shown three times side by side: front view, three-quarter view and full body. Medium-brown skin, dark hair in a low ponytail, plain red polo shirt with no logo, blank white ID badge on a red lanyard. Neutral friendly expression, soft even studio light. No text, no logos.
```

**`supervisor`**
```text
Photorealistic character reference sheet on a plain light-gray studio background. The same Brazilian man in his mid-40s shown three times side by side: front view, three-quarter view and full body. Light-brown skin, short dark hair graying at the temples, neat short beard, plain white button-up shirt, blank ID badge on a red lanyard. Neutral confident expression, soft even studio light. No text, no logos.
```

**`gerente`**
```text
Photorealistic character reference sheet on a plain light-gray studio background. The same Brazilian woman in her 50s shown three times side by side: front view, three-quarter view and full body. Short dark hair with silver streaks, navy blazer over a white blouse, calm confident posture. Soft even studio light. No text, no logos.
```

**`loja-dia`**
```text
Photorealistic wide photo of a modern supermarket front-end in daylight: a long row of twelve checkout lanes with white counters and deep red accents, polished light-gray floor, glass entrance, bright clean cinematic lighting. No people, no logos, no brand names, no readable signs or text.
```

**`loja-noite`**
```text
Photorealistic wide photo of a modern supermarket front-end at night after closing: a long row of checkout lanes with white counters and deep red accents, most ceiling lights dimmed, a few warm lights on, dark blue night visible through the glass entrance, quiet and orderly. No people, no logos, no readable signs or text.
```

**`celular`**
```text
Photorealistic product photo of a sleek modern smartphone with thin bezels and a matte dark graphite frame, no brand marks. The screen is turned off, glossy black with a subtle reflection. Front view on a plain light-gray background.
```

**`relogio-ponto`**
```text
Photorealistic close-up of a generic wall-mounted electronic employee time clock, white and gray, no brand, on a white wall near a staff entrance, with a small thermal paper receipt coming out of the printer slot. The receipt shows only faint unreadable lines. Soft cinematic light.
```

**`almoxarifado`**
```text
Photorealistic clean, well-organized supermarket stockroom: metal shelves with rolls of plastic bags, receipt paper rolls, cleaning cloths and alcohol bottles, all in plain unlabeled packaging. White walls with a thin red stripe, bright neutral lighting. No logos, no text.
```

**`escritorio`**
```text
Photorealistic bright modern management office with a glass wall overlooking a supermarket checkout area with white and red lanes. A large wall-mounted screen showing a softly blurred navy-blue dashboard with no readable text. White desk, minimal decor. No people, no logos, no text.
```

**`espaco-3d`**
```text
Abstract 3D environment for corporate motion graphics: deep navy blue void (#0A2540) with a subtle gradient to #0F4C81, soft volumetric light, faint floating particles, a few floating frosted-glass cards with rounded corners and simple white icons, thin glowing lines connecting them. No text.
```

---

## 5. Telas reais do app (prints)

### 5.1 Prints a tirar

| Print | Tela do app | O que deve aparecer | Vai depois do clipe |
|---|---|---|---|
| `p1` | Checklist | Card de abertura "feito no prazo" | 05 |
| `p2` | Ponto | Jornada do dia com as batidas | 06 |
| `p3` | Jornada de equipe | Uma pessoa com risco de TAC | 08 |
| `p4` | Fechamento | "Tudo pronto!" | 12 |
| `p5` | Centro de Controle (web) | Visão geral | 15 |

- **Celular (`p1`–`p4`):** print no APK Android, na maior resolução; recorte a
  barra de status se houver notificações pessoais.
- **Web (`p5`):** navegador em tela cheia, 1920 × 1080, zoom 100%.

### 5.2 Imagens de tela (print dentro do aparelho)

No modo **imagem**, adicione o print e as referências indicadas e use o prompt.
Salve o resultado como `t1` … `t5`. **Amplie e confira** se todas as letras e
números do print ficaram iguais; se algo mudou, gere de novo.

**`t1` a `t4`** (trocar `@p1` por `@p2`, `@p3`, `@p4`):
```text
Place the attached app screenshot @p1 exactly as it is onto the screen of the smartphone @celular. The phone stands upright, slightly angled, centered on the deep navy background of @espaco-3d with soft light and faint particles. Keep every word, number, icon and color of the screenshot unchanged and sharp. 16:9 frame.
```

**`t5`:**
```text
Place the attached web screenshot @p5 exactly as it is onto the screen of a sleek modern thin-bezel monitor with no brand marks. The monitor is centered, slightly angled, on the deep navy background of @espaco-3d with soft light and faint particles. Keep every word, number, icon and color of the screenshot unchanged and sharp. 16:9 frame.
```

### 5.3 Clipes de tela (4 s cada)

Modo **vídeo**, Omni Flash, **4 s**, com a imagem `t1`…`t5` como **frame
inicial**. O mesmo prompt para os cinco:

```text
Camera completely still except for a very slow, smooth push-in. The device and everything on its screen stay exactly the same: no text, number, icon or layout changes, no screen animation. Only the faint background particles drift gently. Audio: one soft, clean interface chime at the start, then silence. No voice, no music.
```

> Se o Omni Flash não aceitar frame inicial na sua conta, use o **Veo 3.1 Fast**
> (4 s, 20 pontos) com o mesmo prompt.

---

## 6. Clipes

Todos em Omni Flash, 16:9. Cada prompt já está completo — é só colar e chamar
as referências com `@`.

### Clipe 01 — A loja acorda · 10 s

```text
Premium corporate product film, photorealistic, soft cinematic lighting, shallow depth of field, smooth slow camera, 16:9.
SCENE: The empty, modern supermarket front-end of @loja-dia at dawn: a long row of checkout lanes with white counters and deep red accents, glass entrance with blue pre-dawn light outside. No people.
ACTION: 0-4s: overhead lights switch on row by row, from the far end toward the camera. 4-8s: slow dolly forward along the lanes as the conveyor belts start moving. 8-10s: camera settles on the closest checkout lane, warm light filling the frame.
CAMERA: low-angle, slow steady dolly-in.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "Cinco e meia da manhã. Antes do primeiro cliente, a frente de caixa precisa estar pronta."
AUDIO: hum of lights powering on, soft echo of an empty store. No music.
AVOID: logos, brand names, readable text or signs, subtitles, on-screen speakers.
```

### Clipe 02 — O caos de hoje · 10 s

```text
Premium corporate product film, photorealistic, cool desaturated tones, shallow depth of field, smooth slow camera, 16:9.
SCENE: A cramped back-office desk in the style of @escritorio, but cluttered: paper schedules, handwritten time sheets, sticky notes and a laptop with a blurred, messy spreadsheet. A smartphone lies on the desk. @supervisor stands at the desk.
ACTION: 0-3s: he flips through papers, searching. 3-7s: the phone buzzes, a sticky note falls to the floor, he rubs his forehead. 7-10s: camera slowly pulls back revealing the whole cluttered desk.
CAMERA: medium shot, slow pull-back.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "Hoje, essa operação depende de papéis, planilhas e mensagens. A informação existe, mas chega tarde."
AUDIO: paper rustling, phone vibrating, muffled store noise. No music. The man does not speak.
AVOID: logos, brand names, readable text, subtitles, distorted hands.
```

### Clipe 03 — O custo invisível · 10 s

```text
Premium corporate motion graphics, stylized 3D, 16:9.
SCENE: The dark navy void of @espaco-3d. Small thermal-paper receipts like the one from @relogio-ponto float and fall slowly. Behind them, a large translucent analog clock face.
ACTION: 0-3s: receipts fall and stack into a growing pile. 3-7s: the clock hands spin faster and blur; a red glow pulses through the pile with each tick. 7-10s: thin red cracks of light spread across the pile, camera pushes in, frame fades to black.
CAMERA: slow push-in, slight tilt.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "E o que não se vê custa caro: horas extras fora do limite e riscos trabalhistas descobertos tarde demais."
AUDIO: ticking that accelerates, low tension drone, deep thud at the end. No music.
AVOID: readable text or numbers, subtitles.
```

### Clipe 04 — Check-out PRO · 10 s

```text
Premium corporate motion graphics, photorealistic 3D, 16:9.
SCENE: The navy void of @espaco-3d. The smartphone @celular rises into frame; its screen glows with a soft, out-of-focus navy-blue light, no readable content.
ACTION: 0-4s: the phone rises and slowly turns to face the camera. 4-7s: a thin red-and-white light ribbon sweeps around it. 7-10s: the phone holds still in the center with a gentle glow.
CAMERA: smooth short orbit, then hold.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "O Check-out PRO reúne toda a frente de caixa num só lugar. No celular e no navegador."
AUDIO: soft whoosh, crystalline chime, rising bass swell. No music.
AVOID: logos, brand names, readable text, subtitles.
```

### Clipe 05 — Checklist de abertura · 6 s → depois tela `t1`

```text
Premium corporate product film, photorealistic, bright morning light, shallow depth of field, 16:9.
SCENE: The checkout area of @loja-dia, lanes ready and clean. @fiscal holds the smartphone @celular.
ACTION: 0-3s: she raises the phone, its back facing the camera, and points it at the checkouts as if taking a photo; soft white flash. 3-6s: she looks at the screen (screen facing her, not visible to the camera), a soft navy glow on her face, she smiles slightly.
CAMERA: medium shot from the front, slow push-in.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "A abertura é comprovada por foto, no horário certo."
AUDIO: camera shutter, morning store ambience. No music. The woman does not speak.
AVOID: logos, readable text, visible phone screen content, subtitles, distorted hands.
```

### Clipe 06 — Ponto pelo comprovante · 6 s → depois tela `t2`

```text
Premium corporate product film, photorealistic, soft cinematic light, shallow depth of field, 16:9.
SCENE: The time clock of @relogio-ponto near the staff entrance, a clean white counter beside it. @fiscal with the smartphone @celular.
ACTION: 0-3s: macro shot, the time clock prints a small thermal receipt; she tears it off. 3-6s: she places the receipt on the counter and photographs it with the phone held above it, back of the phone facing the camera; a glowing scan line passes over the receipt.
CAMERA: macro, then medium side shot.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "O ponto vem do comprovante. O aplicativo lê e calcula a jornada."
AUDIO: thermal printer whir, paper tear, digital scan sweep. No music. The woman does not speak.
AVOID: logos, readable text on the receipt, visible phone screen content, subtitles.
```

### Clipe 07 — Equipe em tempo real · 10 s

```text
Premium corporate motion graphics, stylized 3D, 16:9.
SCENE: A 3D miniature of a supermarket checkout front-end, white with red accents, seen from above, with small figurines at the lanes, floating in the navy space of @espaco-3d. Above each figurine floats a status pill: green (working), amber (on break), gray (not arrived yet). A floating navy tablet shows a grid of matching cards without text.
ACTION: 0-3s: camera descends from top-down over the miniature. 3-7s: one figurine walks toward the break room and its pill turns from green to amber; a pulse of light travels along a thin line to the tablet. 7-10s: camera tilts to the tablet, where the matching card updates instantly.
CAMERA: slow descending crane, then tilt.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "A supervisão vê a equipe inteira em tempo real: quem trabalha, quem está em intervalo, quem falta chegar."
AUDIO: subtle interface ticks, soft ambient pad. No music.
AVOID: readable text, logos, subtitles.
```

### Clipe 08 — Aviso antes do limite · 6 s → depois tela `t3`

```text
Premium corporate product film, photorealistic, soft cinematic light, shallow depth of field, 16:9.
SCENE: Supermarket aisle next to the checkouts of @loja-dia, customers softly blurred. @supervisor holds the smartphone @celular.
ACTION: 0-2s: he walks briskly; the phone chimes, he stops and looks at the screen (screen facing him, not visible to the camera). 2-6s: he looks up toward a checkout lane where a cashier is still working, nods with decision and walks toward her.
CAMERA: smooth front tracking shot, then wide.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "Se uma jornada se aproxima do limite, a supervisão é avisada."
AUDIO: soft app alert tone, footsteps, store ambience. No music. The man does not speak.
AVOID: logos, readable text, visible phone screen content, subtitles.
```

### Clipe 09 — Escala e rodízio de domingos · 10 s

```text
Premium corporate motion graphics, stylized 3D, 16:9.
SCENE: The navy space of @espaco-3d. A floating white monthly calendar with red accents and no text; the Sunday column is highlighted. Three groups of small avatar tokens in navy, green and amber.
ACTION: 0-4s: the three groups rotate across the Sundays like a carousel, each group resting on one Sunday out of three. 4-7s: the calendar folds into a clean document page. 7-10s: the page slides into a smartphone, which fans out into several phones, as if sent to the whole team.
CAMERA: slow orbit, then push-in.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "O rodízio de domingos é calculado automaticamente, e a escala chega à equipe em segundos."
AUDIO: soft mechanical clicks, whoosh, light chime. No music.
AVOID: readable text or numbers, logos, subtitles.
```

### Clipe 10 — Vendas, metas e indicadores · 10 s

```text
Premium corporate motion graphics, photorealistic close-up then stylized 3D, 16:9.
SCENE: A store office desktop computer whose monitor shows blurred file icons, then the navy space of @espaco-3d.
ACTION: 0-2s: close-up of a hand clicking a mouse; file icons on the monitor glow one after another. 2-5s: the icons fly out of the screen as light streams and form a navy dashboard: an hourly sales area chart drawing itself left to right and a circular progress ring filling toward a goal marker. 5-10s: camera arcs to four floating navy glass cards with simple icons (a coin with a heart, a mobile phone, a receipt with an X, a return arrow); their status dots settle green, green, amber, green, and the amber card gently pulses.
CAMERA: close-up, pull-out into 3D space, then slow arc.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "Vendas, metas e indicadores viram painéis claros, com projeção do mês e semáforos que mostram onde agir."
AUDIO: mouse click, data streaming sound, soft glassy interface sounds. No music.
AVOID: readable text or numbers, logos, subtitles.
```

### Clipe 11 — Insumos · 10 s

```text
Premium corporate product film, photorealistic with light holographic graphics, 16:9.
SCENE: The stockroom of @almoxarifado. @fiscal is there.
ACTION: 0-3s: she takes a box of receipt paper rolls from a shelf. 3-7s: holographic level bars above each shelf section adjust; one bar drops near its minimum and turns amber. 7-10s: a floating navy card with a simple checklist icon appears and receives a green check mark.
CAMERA: medium shot, slow lateral slide.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "O almoxarifado fica sob controle: cada saída é registrada, e o sistema sugere o pedido da semana."
AUDIO: cardboard handling, soft interface ticks, stockroom ambience. No music. The woman does not speak.
AVOID: logos, readable labels or text, subtitles.
```

### Clipe 12 — Fechamento do dia · 6 s → depois tela `t4`

```text
Premium corporate product film, photorealistic, night, soft warm light, 16:9.
SCENE: The checkout area of @loja-noite, last customer leaving through the glass doors. @gerente holds the smartphone @celular.
ACTION: 0-3s: she looks at the phone (screen facing her, not visible to the camera), soft navy glow on her face. 3-6s: she exhales calmly and puts the phone in her blazer pocket; the overhead lights switch off row by row.
CAMERA: medium shot, then wide static shot.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "No fim do dia, um resumo mostra o que foi concluído."
AUDIO: lights clicking off, quiet store. No music. The woman does not speak.
AVOID: logos, readable text, visible phone screen content, subtitles.
```

### Clipe 13 — Arquitetura · 10 s

```text
Premium corporate motion graphics, abstract 3D, 16:9.
SCENE: The navy space of @espaco-3d with three stacked translucent layers. Top: a smartphone and a laptop with glowing navy screens. Middle: a glowing processing core with three concentric rings. Bottom: a cylindrical database.
ACTION: 0-4s: light pulses travel from the devices down through the rings to the database and back; small shield icons lock onto the path. 4-7s: beside the phone, a wifi icon turns off and one pulse waits inside a small queue box. 7-10s: the wifi icon turns back on and the waiting pulse is released down the path.
CAMERA: slow orbit around the stack.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "Por trás, uma arquitetura sólida e em tempo real. Sem internet, o ponto é guardado e sincronizado depois."
AUDIO: soft digital hum, data pulses, gentle lock clicks. No music.
AVOID: readable text, logos, subtitles.
```

### Clipe 14 — Segurança e qualidade · 10 s

```text
Premium corporate motion graphics, abstract 3D, 16:9.
SCENE: A corridor of glass gates in the navy space of @espaco-3d. Three key-cards float forward: red, white and navy.
ACTION: 0-4s: each gate opens only for the matching key-card; some gates stay closed. 4-7s: camera rises above the corridor revealing a vast grid of small check marks lighting up green in a wave. 7-10s: the grid converges into a single glowing shield.
CAMERA: forward glide, then crane up.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "Cada perfil acessa só o que precisa, e testes automáticos validam cada mudança antes de chegar à loja."
AUDIO: soft gate clicks, cascading positive ticks, resolved tone. No music.
AVOID: readable text, logos, subtitles.
```

### Clipe 15 — Resultado · 6 s → depois tela `t5`

```text
Premium corporate product film, photorealistic, bright daylight, shallow depth of field, 16:9.
SCENE: The office of @escritorio, glass wall overlooking the busy, organized checkout area with customers. @gerente and @supervisor stand side by side in front of the wall screen.
ACTION: 0-3s: she points at the screen, he nods, both relaxed. 3-6s: camera slowly moves past them toward the glass, revealing the checkouts running smoothly.
CAMERA: slow push forward.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says: "Menos retrabalho, mais controle e decisões apoiadas em dados."
AUDIO: calm office ambience, muffled store sounds. No music. Nobody on screen speaks.
AVOID: logos, readable text, subtitles.
```

### Clipe 16 — Assinatura · 10 s

Primeiro crie a imagem `logo-final` (modo imagem, adicionando
`mobile/assets/Logo.png` como `@logo`):
```text
Place the attached logo @logo exactly as it is, in white, centered on the deep navy gradient background of @espaco-3d, with a thin horizontal red-and-white light line below it and faint particles. Do not change the logo shape or letters. 16:9 frame.
```
Depois gere o vídeo com `logo-final` como **frame inicial**:
```text
Premium corporate motion graphics, 16:9. The logo stays perfectly still and unchanged in the center for the whole clip. Only a subtle glow breathes around it and faint particles drift slowly in the background. Camera completely static.
VOICE-OVER: a mature, calm, confident female narrator speaking Brazilian Portuguese, warm studio voice, unhurried pace, says after one second: "Check-out PRO. A frente de caixa sob controle."
AUDIO: a final soft chime and a resolving bass note. No music.
AVOID: any change to the logo, extra text, subtitles.
```

---

## 7. Montagem no Criador de cenas

Adicione à cena (**Mais → Adicionar à cena**) nesta ordem:

| # | Peça | Duração | Acumulado |
|---|---|---|---|
| 1 | Clipe 01 | 10 s | 0:10 |
| 2 | Clipe 02 | 10 s | 0:20 |
| 3 | Clipe 03 | 10 s | 0:30 |
| 4 | Clipe 04 | 10 s | 0:40 |
| 5 | Clipe 05 + tela `t1` | 6 + 4 s | 0:50 |
| 6 | Clipe 06 + tela `t2` | 6 + 4 s | 1:00 |
| 7 | Clipe 07 | 10 s | 1:10 |
| 8 | Clipe 08 + tela `t3` | 6 + 4 s | 1:20 |
| 9 | Clipe 09 | 10 s | 1:30 |
| 10 | Clipe 10 | 10 s | 1:40 |
| 11 | Clipe 11 | 10 s | 1:50 |
| 12 | Clipe 12 + tela `t4` | 6 + 4 s | 2:00 |
| 13 | Clipe 13 | 10 s | 2:10 |
| 14 | Clipe 14 | 10 s | 2:20 |
| 15 | Clipe 15 + tela `t5` | 6 + 4 s | 2:30 |
| 16 | Clipe 16 | 10 s | 2:40 |

**Revisão antes de baixar:** voz igual em todos os clipes, nenhuma marca do
supermercado, nenhum nome real nos prints, nada da tabela da §2.2.
