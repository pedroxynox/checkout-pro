> **Estado:** 🟡 Rascunho/parcial · **Responsável:** Produto · **Última verificação:** 2026-10-15 · **Cobre:** roteiro e prompts (Google Flow) do vídeo institucional

# Vídeo de apresentação — roteiro e prompts para o Google Flow

Roteiro completo do vídeo institucional do Check-out PRO, voltado à **direção do
supermercado e a investidores**. Contém a bíblia visual, a narração em
português do Brasil e um prompt pronto por clipe de **10 segundos**.

**Ficha técnica:** 17 clipes × 10 s = **2 min 50 s** · 16:9 · motion graphics
com telas do app + animação 3D · narração em off (pt-BR).

> **Fontes de verdade usadas:** [Resumo executivo](../00-visao-geral/resumo-executivo.md),
> [Regras de negócio](../01-produto/regras-de-negocio/) e o
> [Atlas do mobile](../04-atlas-mobile/). A narração **não cita números** do
> projeto para não envelhecer; se quiser mostrá-los em tela, use os valores
> atuais de [Estado e métricas](estado-e-metricas.md).

---

## 1. Regras de produção (ler antes de gerar)

1. **Modelo:** no Flow, clipes de 10 s exigem o **Gemini Omni Flash** (o Veo 3.1
   gera no máximo 8 s). Confirme o modelo antes de gastar créditos.
2. **Sem marca do supermercado:** cores vermelho e branco, mas **nenhum logotipo,
   nome, fachada ou sinalização legível**. Todos os prompts já trazem essa trava.
3. **Texto e números de tela não vêm do Flow.** IA de vídeo deforma letras. Os
   prompts pedem telas **sem texto legível**; na edição, substitua a tela do
   celular/monitor pela **gravação real do app** (versão web) e adicione os
   títulos.
4. **Dados fictícios (LGPD):** grave as telas com dados de teste — nunca nomes,
   fotos ou jornadas de colaboradores reais.
5. **Áudio:** os clipes saem só com **som ambiente**. Narração e trilha entram na
   edição, com **uma única voz** do início ao fim (TTS ou locutor), para não
   variar de timbre entre clipes.
6. **Consistência:** cole o **Bloco de estilo** (§2.1) no início de todo prompt e
   o bloco do personagem (§2.2) sempre que ele aparecer. Gere antes as imagens de
   referência dos personagens e use-as como *Ingredients* no Flow.
7. **Variações:** gere 2–4 versões por clipe e escolha a melhor.
8. **Prompts em inglês** (o modelo responde melhor); narração e títulos em
   português.

### O que o vídeo **não** pode afirmar (fidelidade ao produto)

| Não dizer/mostrar | Por quê |
|---|---|
| "Inteligência artificial", assistente virtual | O app não tem IA; a assistente foi retirada em out/2026. |
| Push no celular com o app fechado (Android) | Depende do Firebase/FCM, ainda pendente. O clipe 8 mostra o **aviso dentro do app**. |
| "Funciona 100% offline" | Só o **registro de ponto** tem fila offline. |
| Que o sistema verifica todas as regras do TAC | Hoje verifica parte delas (ver [Ponto, jornada e TAC](../01-produto/regras-de-negocio/ponto-jornada-e-tac.md)). A narração fala em "aviso antes do limite", sem prometer cobertura total. |
| Várias lojas / rede | O foco atual é uma loja 100% operacional. |

---

## 2. Bíblia visual

### 2.1 Bloco de estilo (colar no início de TODO prompt)

```text
STYLE: Premium corporate product film. Photorealistic 3D environments blended with clean, minimal motion-graphics UI. Supermarket front-end in red and white: deep red accents (#C8102E), clean white surfaces, polished light-gray floor. App interface in navy blue gradient (#0A2540 to #0F4C81) with white rounded cards and status colors green (#10B981), amber (#F59E0B) and red (#EF4444). Soft cinematic lighting, shallow depth of field, smooth slow camera moves, 24fps, 16:9. Avoid: logos, brand names, readable signage, readable text or numbers on any screen or paper, subtitles, watermarks, distorted hands, extra fingers.
```

### 2.2 Personagens (fictícios)

| Personagem | Bloco para colar |
|---|---|
| **FISCAL** | `FISCAL: a Brazilian woman in her late 20s, medium-brown skin, dark hair in a low ponytail, plain red polo shirt with no logo, blank white ID badge on a red lanyard.` |
| **SUPERVISOR** | `SUPERVISOR: a Brazilian man in his mid-40s, light-brown skin, short dark hair graying at the temples, neat short beard, plain white button-up shirt, blank ID badge on a red lanyard.` |
| **GERENTE** | `GERENTE: a Brazilian woman in her 50s, short dark hair with silver streaks, navy blazer over a white blouse, calm and confident posture.` |

### 2.3 Paleta e regras de cor

| Uso | Cor |
|---|---|
| Ambiente da loja (sem marca) | Vermelho `#C8102E` + branco |
| Identidade do app | Azul-marinho `#0A2540` → `#0F4C81` |
| Status ok / atenção / crítico | `#10B981` / `#F59E0B` / `#EF4444` |
| Ato 1 (problema) | Tons frios e dessaturados |
| Ato 2 em diante | Cores limpas, luz quente na loja, azul no app |

### 2.4 Narração e trilha

- **Voz:** feminina, madura, calma e confiante, português do Brasil, ritmo
  pausado. Cada fala tem até ~20 palavras e cabe em 10 s com respiro.
- **Trilha:** corporativa cinematográfica, 100–110 BPM. Ato 1 com pulso grave e
  piano tenso; virada luminosa no clipe 4; crescendo leve até o clipe 16;
  resolução no 17.

---

## 3. Estrutura e linha do tempo

| Ato | Clipes | Tempo | Mensagem |
|---|---|---|---|
| 1 · O problema | 01–03 | 0:00–0:30 | A operação de hoje é manual, espalhada e cara. |
| 2 · A solução | 04 | 0:30–0:40 | Apresentação do Check-out PRO. |
| 3 · Um dia na loja | 05–13 | 0:40–2:10 | Da abertura ao fechamento, módulo por módulo. |
| 4 · Por dentro | 14–15 | 2:10–2:30 | Arquitetura, segurança e qualidade. |
| 5 · Resultado | 16–17 | 2:30–2:50 | Ganho para a gestão e assinatura. |

---

## 4. Clipes

Formato de cada clipe: **prompt** (colar no Flow após o Bloco de estilo) ·
**narração** · **edição** (tela real a inserir e textos em tela).

### Clipe 01 — A loja acorda (0:00–0:10)

```text
[STYLE BLOCK]
SCENE: Wide shot of an empty, modern supermarket front-end at dawn: a long row of twelve checkout lanes with white counters and deep red accents, polished floor, glass entrance with blue pre-dawn light outside. No people.
ACTION: 0-4s: overhead lights switch on row by row, from the far end toward the camera. 4-8s: slow dolly forward along the lanes as the conveyor belts start moving. 8-10s: camera settles on the closest checkout lane, warm light filling the frame.
CAMERA: low-angle, slow steady dolly-in, anamorphic look.
AUDIO: hum of lights powering on, soft echo of an empty store, a register booting with a short beep. No music, no voice.
```

**Narração:** "Cinco e meia da manhã. Antes do primeiro cliente chegar, a frente de caixa já precisa estar pronta."
**Edição:** sem texto.

### Clipe 02 — O caos de hoje (0:10–0:20)

```text
[STYLE BLOCK] [SUPERVISOR]
SCENE: Cramped back-office desk behind the checkout area, cool desaturated tones. The desk overflows with paper schedules, handwritten time sheets, sticky notes and a laptop showing a blurred, cluttered spreadsheet. A smartphone lies on the desk.
ACTION: 0-3s: SUPERVISOR flips through papers, searching. 3-7s: the phone buzzes with a stack of blurred notifications, a sticky note falls to the floor, he rubs his forehead. 7-10s: camera slowly pulls back revealing the whole cluttered desk.
CAMERA: medium shot, slow pull-back.
AUDIO: paper rustling, phone vibrating, muffled store noise. No music, no voice.
```

**Narração:** "Hoje, essa operação vive em papéis, planilhas e mensagens soltas. A informação existe, mas chega tarde e espalhada."
**Edição:** sem texto.

### Clipe 03 — O custo invisível (0:20–0:30)

```text
[STYLE BLOCK]
SCENE: Stylized 3D in a dark navy void. Small thermal-paper time-clock receipts float and fall slowly. Behind them, a large translucent analog clock face.
ACTION: 0-3s: receipts fall and stack into a growing pile. 3-7s: the clock hands spin faster and blur; a red glow pulses through the pile with each tick. 7-10s: thin red cracks of light spread across the pile, camera pushes in, frame fades to black with red edges.
CAMERA: slow push-in, slight tilt.
AUDIO: ticking that accelerates, low tension drone, deep thud at the end. No music, no voice.
```

**Narração:** "E o que não se vê custa caro: horas extras além do limite e riscos trabalhistas descobertos tarde demais."
**Edição:** sem texto.

### Clipe 04 — Check-out PRO (0:30–0:40)

```text
[STYLE BLOCK]
SCENE: 3D reveal in darkness. A sleek modern smartphone rises into frame and rotates; its screen lights up with a navy-blue dashboard of white rounded cards (no readable text). Behind it, a laptop browser window materializes showing the same navy dashboard.
ACTION: 0-4s: phone rises and turns toward the camera as the screen powers on. 4-7s: the laptop appears in sync; a thin red-and-white light ribbon sweeps around both devices. 7-10s: devices drift apart, leaving clean empty space in the center for a logo.
CAMERA: smooth 90-degree orbit, then hold.
AUDIO: soft whoosh, crystalline chime, rising bass swell. No music, no voice.
```

**Narração:** "Por isso nasceu o Check-out PRO: a frente de caixa inteira, num só lugar, no celular e no navegador."
**Edição:** inserir `mobile/assets/Logo.png` no espaço central (7–10 s). Na tela do celular, gravação da Home.

### Clipe 05 — Checklist de abertura (0:40–0:50)

```text
[STYLE BLOCK] [FISCAL]
SCENE: Morning, bright checkout area, lanes ready and clean, red and white tones.
ACTION: 0-3s: over-the-shoulder view, FISCAL raises her smartphone and frames the row of checkouts in the camera viewfinder. 3-6s: she taps, a soft white flash; the screen switches to a navy app card that animates from gray to green with a check icon. 6-10s: she lowers the phone with a slight smile; rack focus from the phone to the lanes.
CAMERA: over-the-shoulder, then rack focus.
AUDIO: camera shutter, soft confirmation chime, morning store ambience. No music, no voice.
```

**Narração:** "O dia começa com o checklist de abertura. Uma foto comprova que tudo está pronto, no horário certo."
**Edição:** tela real — **Checklist** (card de abertura "no prazo"). Texto: "Checklist com foto".

### Clipe 06 — Ponto pelo comprovante (0:50–1:00)

```text
[STYLE BLOCK] [FISCAL]
SCENE: Wall-mounted employee time clock near the staff entrance.
ACTION: 0-3s: macro shot, the time clock prints a small thermal paper receipt; FISCAL tears it off. 3-6s: she places it on a counter and photographs it with her smartphone; a glowing scan line passes over the receipt. 6-10s: abstract glowing data fragments (no readable text) lift off the paper and fly into the phone, where a horizontal workday timeline fills in with four markers.
CAMERA: macro, then pull back to medium shot.
AUDIO: thermal printer whir, paper tear, digital scan sweep. No music, no voice.
```

**Narração:** "O ponto é registrado a partir do comprovante do relógio. O aplicativo lê a foto e calcula a jornada sozinho."
**Edição:** tela real — **Ponto** (jornada do dia). Texto: "Leitura automática do comprovante".

### Clipe 07 — Equipe em tempo real (1:00–1:10)

```text
[STYLE BLOCK]
SCENE: Stylized 3D miniature of the checkout front-end, white with red accents, seen from above, with small figurines at the lanes. Above each figurine floats a status pill: green (working), amber (on break), gray (not arrived yet). A floating navy tablet shows a grid of matching cards.
ACTION: 0-3s: camera descends from top-down over the miniature. 3-7s: one figurine walks toward the break room and its pill turns from green to amber; a pulse of light travels along a thin line to the tablet. 7-10s: camera tilts to the tablet, where the matching card updates instantly.
CAMERA: slow descending crane, then tilt.
AUDIO: subtle UI ticks, soft ambient pad. No music, no voice.
```

**Narração:** "A supervisão enxerga toda a equipe em tempo real: quem está trabalhando, em intervalo ou ainda não chegou."
**Edição:** tela real — **Jornada de equipe**. Texto: "Equipe em tempo real".

### Clipe 08 — Aviso antes do limite (1:10–1:20)

```text
[STYLE BLOCK] [SUPERVISOR]
SCENE: Supermarket aisle next to the checkout area, customers softly blurred in the background.
ACTION: 0-3s: SUPERVISOR walks briskly holding his smartphone. 3-6s: inside the open app, a navy card pulses amber, then red, with a warning triangle icon; he stops and reads. 6-10s: he looks toward a checkout lane where a cashier is still working, nods with decision and walks toward her.
CAMERA: smooth tracking shot, then close-up on the phone, then over-the-shoulder.
AUDIO: soft in-app alert tone, footsteps, store ambience. No music, no voice.
```

**Narração:** "Quando uma jornada se aproxima do limite, o sistema avisa a supervisão. A decisão acontece antes do problema."
**Edição:** tela real — alerta de **risco de TAC** dentro do app. Texto: "Alerta de risco de TAC". Não mostrar notificação de sistema com o app fechado.

### Clipe 09 — Escala e rodízio de domingos (1:20–1:30)

```text
[STYLE BLOCK]
SCENE: 3D motion graphics in navy space. A floating white monthly calendar with red accents; the Sunday column is highlighted. Three groups of small avatar tokens in navy, green and amber.
ACTION: 0-4s: the three groups rotate across the Sundays like a carousel, each group resting on one Sunday out of three. 4-7s: the calendar folds into a clean document page. 7-10s: the page slides into a smartphone, which fans out into several phones, as if sent to the whole team.
CAMERA: slow orbit, then push-in.
AUDIO: soft mechanical clicks, whoosh, light chime. No music, no voice.
```

**Narração:** "O rodízio de domingos é calculado automaticamente, e a escala chega à equipe em PDF ou imagem."
**Edição:** tela real — **Escala** (publicar). Texto: "Escala e rodízio de domingos".

### Clipe 10 — Vendas e metas (1:30–1:40)

```text
[STYLE BLOCK]
SCENE: Store office desktop computer, monitor showing blurred file icons.
ACTION: 0-3s: close-up of a hand clicking a mouse; six document icons on the monitor glow one after another. 3-6s: the icons fly out of the screen as light streams into 3D space. 6-10s: the streams form a navy dashboard: an hourly sales area chart drawing itself left to right, a circular progress ring filling toward a goal marker, and a heatmap grid lighting up.
CAMERA: close-up, then pull-out into 3D space.
AUDIO: mouse click, data streaming sound, rising tone. No music, no voice.
```

**Narração:** "Os arquivos de vendas do dia viram painéis claros: faturamento por hora, meta do mês e projeção de fechamento."
**Edição:** telas reais — **Importações** (0–3 s) e **Painel de Vendas** (6–10 s). Texto: "Vendas, metas e projeção".

### Clipe 11 — Indicadores (1:40–1:50)

```text
[STYLE BLOCK]
SCENE: 3D space with four floating navy glass cards in an arc. Icons only: a coin with a heart, a mobile phone, a receipt with an X, a return arrow. Each card has a traffic-light dot.
ACTION: 0-4s: cards slide into position; their dots settle green, green, amber, green. 4-7s: a small podium with three blank avatar tokens rises in front of the cards. 7-10s: the amber card gently pulses as the camera arcs toward it.
CAMERA: slow arc, ending on the amber card.
AUDIO: soft glassy UI sounds, gentle pad. No music, no voice.
```

**Narração:** "Troco solidário, recargas, cancelamentos e devoluções ganham semáforos, destaques e ranking, acompanhados dia a dia."
**Edição:** tela real — **Indicadores**. Texto: "Indicadores com semáforo".

### Clipe 12 — Insumos (1:50–2:00)

```text
[STYLE BLOCK] [FISCAL]
SCENE: Clean stockroom with shelves holding plastic bag rolls, receipt paper rolls, cleaning cloths and alcohol bottles in plain unlabeled packaging.
ACTION: 0-3s: FISCAL takes a box of receipt paper rolls from a shelf. 3-7s: holographic level bars above each shelf section adjust; one bar drops near its minimum and turns amber. 7-10s: a floating navy card with a checklist appears and receives a green check mark.
CAMERA: medium shot, slow lateral slide.
AUDIO: cardboard handling, soft UI ticks, stockroom ambience. No music, no voice.
```

**Narração:** "No almoxarifado, sacolas e bobinas são controladas. O sistema sugere o pedido da semana, e o estoque nunca fica negativo."
**Edição:** tela real — **Insumos** (estoque e pedido da semana). Texto: "Insumos e requisições".

### Clipe 13 — Fechamento do dia (2:00–2:10)

```text
[STYLE BLOCK] [GERENTE]
SCENE: Night, supermarket checkout area, last customer leaving through the glass doors.
ACTION: 0-3s: GERENTE stands by the checkouts holding her smartphone. 3-7s: on screen, a progress ring completes and turns green, then a gauge needle rises into the green zone. 7-10s: she exhales calmly and puts the phone in her blazer pocket; the overhead lights switch off row by row, mirroring the opening scene.
CAMERA: medium shot, then wide static shot.
AUDIO: soft completion chime, lights clicking off, quiet store. No music, no voice.
```

**Narração:** "No fechamento, um resumo mostra o que foi concluído e o que falta. A gestão encerra o dia com segurança."
**Edição:** telas reais — **Fechamento** ("Tudo pronto!") e **Saúde do negócio** da Home. Texto: "Fechamento do dia".

### Clipe 14 — Arquitetura (2:10–2:20)

```text
[STYLE BLOCK]
SCENE: Abstract 3D in navy space, three stacked translucent layers. Top: a smartphone and a laptop. Middle: a glowing processing core with three concentric rings. Bottom: a cylindrical database.
ACTION: 0-4s: light pulses travel from the devices down through the rings to the database and back; small shield icons lock onto the path. 4-7s: beside the phone, a wifi icon turns off and one pulse waits inside a small queue box. 7-10s: the wifi icon turns back on and the waiting pulse is released down the path.
CAMERA: slow orbit around the stack.
AUDIO: soft digital hum, data pulses, gentle lock clicks. No music, no voice.
```

**Narração:** "Por trás, uma arquitetura sólida e em tempo real. Sem internet, o ponto fica guardado e sincroniza ao reconectar."
**Edição:** rótulos em tela — "App Android e Web" · "API NestJS" · "PostgreSQL" · "Acesso com token seguro" · "Fila offline do ponto".

### Clipe 15 — Segurança e qualidade (2:20–2:30)

```text
[STYLE BLOCK]
SCENE: 3D corridor of glass gates in navy space. Three key-cards float forward: red, white and navy.
ACTION: 0-4s: each gate opens only for the matching key-card; some gates stay closed. 4-7s: camera rises above the corridor revealing a vast grid of small check marks lighting up green in a wave. 7-10s: the grid converges into a single glowing shield.
CAMERA: forward glide, then crane up.
AUDIO: soft gate clicks, cascading positive ticks, resolved tone. No music, no voice.
```

**Narração:** "Cada pessoa acessa apenas o que precisa, e testes automáticos validam cada mudança antes de chegar à loja."
**Edição:** texto — "Perfis e permissões" · "Testes automáticos". Opcional: números atuais de [Estado e métricas](estado-e-metricas.md).

### Clipe 16 — Resultado (2:30–2:40)

```text
[STYLE BLOCK] [GERENTE] [SUPERVISOR]
SCENE: Bright modern management office with a glass wall overlooking the busy, organized checkout area with customers.
ACTION: 0-4s: GERENTE and SUPERVISOR stand side by side in front of a large wall screen showing a navy dashboard (no readable text). 4-7s: she points at a green card, he nods, both relaxed. 7-10s: camera slowly moves past them toward the glass, revealing the checkouts running smoothly.
CAMERA: slow push forward.
AUDIO: calm office ambience, muffled store sounds. No music, no voice.
```

**Narração:** "Menos retrabalho, mais controle e decisões apoiadas em dados. A gestão deixa de correr atrás da informação."
**Edição:** tela real na parede — **Home / Centro de Controle**.

### Clipe 17 — Assinatura (2:40–2:50)

```text
[STYLE BLOCK]
SCENE: Clean navy gradient background (#0A2540 to #0F4C81).
ACTION: 0-4s: a thin red-and-white light line draws a horizontal stroke across the frame. 4-6s: soft particles converge to the center, leaving clean empty space for a logo. 6-10s: static hold with a subtle glow.
CAMERA: locked-off, static.
AUDIO: final chime and a resolving bass note. No music, no voice.
```

**Narração:** "Check-out PRO. A frente de caixa sob controle."
**Edição:** `mobile/assets/Logo.png` no centro (6–10 s), com o slogan "Gestão inteligente" do próprio logo.

---

## 5. Fluxo de trabalho sugerido

1. **Referências:** gere no Flow uma imagem de cada personagem (§2.2) e do
   ambiente da loja; guarde as melhores para usar como *Ingredients*.
2. **Clipes:** Omni Flash, 10 s, 16:9 — Bloco de estilo + personagens + prompt.
3. **Telas reais:** grave o app (web) com dados de teste, na ordem dos clipes.
4. **Edição** (CapCut, Premiere ou DaVinci): substituir telas, aplicar títulos,
   gravar a narração com uma voz só, adicionar a trilha e uniformizar a cor.
5. **Revisão final:** conferir a tabela "O que o vídeo não pode afirmar" (§1) e
   que não aparece nenhuma marca do supermercado.
