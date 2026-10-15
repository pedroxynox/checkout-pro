> **Estado:** 🟡 Rascunho/parcial · **Responsável:** Produto · **Última verificação:** 2026-10-15 · **Cobre:** roteiro e prompts (Google Flow) do vídeo institucional

# Vídeo de apresentação — roteiro e prompts para o Google Flow

Roteiro completo do vídeo institucional do Check-out PRO, voltado à **direção do
supermercado e a investidores**: tom, duração, imagens de referência, telas do
app, narração em português do Brasil e um prompt pronto por clipe de **10 s**.

**Ficha técnica:** 16 clipes × 10 s = **2 min 40 s** · 16:9 · motion graphics
com telas reais do app + animação 3D · narração em off (pt-BR).

> **Fontes de verdade usadas:** [Resumo executivo](../00-visao-geral/resumo-executivo.md),
> [Regras de negócio](../01-produto/regras-de-negocio/) e o
> [Atlas do mobile](../04-atlas-mobile/). A narração **não cita números** do
> projeto para não envelhecer; se quiser mostrá-los em tela, use os valores
> atuais de [Estado e métricas](estado-e-metricas.md).

---

## 1. Tom e duração

### 1.1 Tom

| Diretriz | Na prática |
|---|---|
| **Executivo, seguro, sem exagero** | Nada de "revolucionário" ou "incrível". O produto convence pelo que faz. |
| **Benefício antes da função** | "A supervisão age antes do problema", não "o sistema tem um módulo de alertas". |
| **Frases curtas** | No máximo ~18 palavras por clipe, com respiro no final. |
| **Arco emocional** | Ato 1 tenso e frio → virada luminosa no clipe 04 → confiança crescente → fechamento calmo. |
| **Linguagem do cliente** | Termos da loja (ponto, jornada, escala, fechamento), não termos técnicos — exceto no ato 4, que é para investidores. |

### 1.2 Duração: por que 2 min 40 s

- Diretoria e investidores costumam decidir nos **primeiros 30–40 s**; o
  problema e a solução ficam todos nesse trecho.
- **Vendas, metas e indicadores** foram unidos num só clipe (são o mesmo assunto
  para quem decide) — de 17 para **16 clipes**.
- Cada módulo aparece **uma vez**, com uma ideia só. Ritmo constante de 10 s.

| Ato | Clipes | Tempo | Mensagem |
|---|---|---|---|
| 1 · O problema | 01–03 | 0:00–0:30 | A operação de hoje é manual, espalhada e cara. |
| 2 · A solução | 04 | 0:30–0:40 | Apresentação do Check-out PRO. |
| 3 · Um dia na loja | 05–12 | 0:40–2:00 | Da abertura ao fechamento, módulo por módulo. |
| 4 · Por dentro | 13–14 | 2:00–2:20 | Arquitetura, segurança e qualidade. |
| 5 · Resultado | 15–16 | 2:20–2:40 | Ganho para a gestão e assinatura. |

### 1.3 Voz e trilha

- **Voz:** feminina, madura, calma e confiante, português do Brasil, ritmo
  pausado. Uma única voz no vídeo inteiro (TTS ou locutor), gravada na edição.
- **Trilha:** corporativa cinematográfica, 100–110 BPM. Pulso grave e piano
  tenso no ato 1; virada luminosa no clipe 04; crescendo leve até o 15;
  resolução no 16.

---

## 2. Regras de produção

1. **Modelo:** clipes de 10 s exigem o **Gemini Omni Flash** no Flow (o Veo 3.1
   gera no máximo 8 s).
2. **Sem marca do supermercado:** vermelho e branco, mas **nenhum logotipo,
   nome, fachada ou sinalização legível**.
3. **Prompts em inglês** (o modelo responde melhor); narração e títulos em
   português.
4. **Áudio:** os clipes saem só com som ambiente; voz e trilha entram na edição.
5. **Consistência:** todo prompt começa com o **Bloco de estilo** (§3.1) e leva
   o bloco do personagem (§3.2) quando ele aparece, além das imagens de
   referência indicadas (§4) como *Ingredients*.
6. **Variações:** gere 2–4 versões por clipe e escolha a melhor.

### 2.1 Orçamento no plano Google AI Pro

Fonte: [Gestionar tus puntos de Google Flow](https://support.google.com/flow/answer/16526234?hl=es) (consultado em 2026-10-15).

- O plano Pro dá **1.000 pontos/mês** + **50 pontos/dia** (os diários não acumulam).
- Omni Flash, 10 s: **15 pontos em 720p** e **7 em 360p**, por vídeo gerado
  (um pedido pode gerar 2 vídeos).
- Interpolação para **1080p é gratuita** no Pro; 4K não está disponível.
- Omni Flash, 6 s: **10 pontos em 720p** e **5 em 360p**.
- **Estratégia:** testar enquadramento em 360p, gerar a versão final em 720p e
  interpolar para 1080p. 11 clipes de 10 s + 5 de 6 s × ~2 tentativas finais
  ≈ 430–860 pontos.

### O que o vídeo **não** pode afirmar (fidelidade ao produto)

| Não dizer/mostrar | Por quê |
|---|---|
| "Inteligência artificial", assistente virtual | O app não tem IA; a assistente foi retirada em out/2026. |
| Push no celular com o app fechado (Android) | Depende do Firebase/FCM, ainda pendente. O clipe 08 mostra o **aviso dentro do app**. |
| "Funciona 100% offline" | Só o **registro de ponto** tem fila offline. |
| Que o sistema verifica todas as regras do TAC | Hoje verifica parte delas (ver [Ponto, jornada e TAC](../01-produto/regras-de-negocio/ponto-jornada-e-tac.md)). |
| Várias lojas / rede | O foco atual é uma loja 100% operacional. |

---

## 3. Bíblia visual

### 3.1 Bloco de estilo (colar no início de TODO prompt)

```text
STYLE: Premium corporate product film. Photorealistic 3D environments blended with clean, minimal motion-graphics UI. Supermarket front-end in red and white: deep red accents (#C8102E), clean white surfaces, polished light-gray floor. App interface in navy blue gradient (#0A2540 to #0F4C81) with white rounded cards and status colors green (#10B981), amber (#F59E0B) and red (#EF4444). Soft cinematic lighting, shallow depth of field, smooth slow camera moves, 24fps, 16:9. Avoid: logos, brand names, readable signage, readable text or numbers on any screen or paper, subtitles, watermarks, distorted hands, extra fingers.
```

### 3.2 Personagens (fictícios)

| Personagem | Bloco para colar |
|---|---|
| **FISCAL** | `FISCAL: a Brazilian woman in her late 20s, medium-brown skin, dark hair in a low ponytail, plain red polo shirt with no logo, blank white ID badge on a red lanyard.` |
| **SUPERVISOR** | `SUPERVISOR: a Brazilian man in his mid-40s, light-brown skin, short dark hair graying at the temples, neat short beard, plain white button-up shirt, blank ID badge on a red lanyard.` |
| **GERENTE** | `GERENTE: a Brazilian woman in her 50s, short dark hair with silver streaks, navy blazer over a white blouse, calm and confident posture.` |

### 3.3 Paleta

| Uso | Cor |
|---|---|
| Ambiente da loja (sem marca) | Vermelho `#C8102E` + branco |
| Identidade do app | Azul-marinho `#0A2540` → `#0F4C81` |
| Status ok / atenção / crítico | `#10B981` / `#F59E0B` / `#EF4444` |
| Ato 1 | Tons frios e dessaturados |

---

## 4. Imagens de referência (criar ANTES dos clipes)

Gere estas imagens no próprio Flow (geração de imagem), escolha a melhor de cada
uma e use-as como *Ingredients* nos clipes indicados. Cole o **Bloco de estilo**
antes de cada prompt. São 10 imagens.

| # | Imagem | Usada nos clipes |
|---|---|---|
| R1 | Ficha da FISCAL | 05, 06, 11 |
| R2 | Ficha do SUPERVISOR | 02, 08, 15 |
| R3 | Ficha da GERENTE | 12, 15 |
| R4 | Frente de caixa (dia) | 01, 05, 08 |
| R5 | Frente de caixa (noite) | 12 |
| R6 | Smartphone padrão | 04, 05, 06, 08, 12 |
| R7 | Relógio de ponto e comprovante | 03, 06 |
| R8 | Almoxarifado | 11 |
| R9 | Escritório da gerência | 02, 15 |
| R10 | Estilo do espaço 3D azul-marinho | 03, 04, 07, 09, 10, 13, 14, 16 |

**R1 — FISCAL**
```text
[STYLE BLOCK] [FISCAL]
Character reference sheet on a plain light-gray studio background: the same woman shown three times side by side — front view, three-quarter view and full body. Neutral friendly expression, soft even studio light, photorealistic.
```

**R2 — SUPERVISOR**
```text
[STYLE BLOCK] [SUPERVISOR]
Character reference sheet on a plain light-gray studio background: the same man shown three times side by side — front view, three-quarter view and full body. Neutral confident expression, soft even studio light, photorealistic.
```

**R3 — GERENTE**
```text
[STYLE BLOCK] [GERENTE]
Character reference sheet on a plain light-gray studio background: the same woman shown three times side by side — front view, three-quarter view and full body. Calm confident expression, soft even studio light, photorealistic.
```

**R4 — Frente de caixa (dia)**
```text
[STYLE BLOCK]
Wide establishing photo of a modern, unbranded supermarket front-end in daylight: a long row of twelve checkout lanes with white counters and deep red accents, polished light-gray floor, glass entrance, bright clean lighting. No people, no logos, no signage.
```

**R5 — Frente de caixa (noite)**
```text
[STYLE BLOCK]
The same supermarket front-end at night after closing: most overhead lights dimmed, a few warm lights on, dark blue night visible through the glass entrance, quiet and orderly. No people, no logos, no signage.
```

**R6 — Smartphone padrão**
```text
[STYLE BLOCK]
Product photo of a sleek modern smartphone with thin bezels, matte dark graphite frame, no brand marks. The screen is turned off, glossy black with a subtle reflection. Front view, plain light-gray background.
```

**R7 — Relógio de ponto**
```text
[STYLE BLOCK]
Close-up product photo of a generic wall-mounted electronic employee time clock, white and gray, no brand, mounted on a white wall near a staff entrance, with a small thermal paper receipt coming out of the printer slot. The receipt shows only faint unreadable lines.
```

**R8 — Almoxarifado**
```text
[STYLE BLOCK]
Clean, well-organized supermarket stockroom: metal shelves with rolls of plastic bags, receipt paper rolls, cleaning cloths and alcohol bottles, all in plain unlabeled packaging. Bright neutral lighting, white walls with a thin red stripe.
```

**R9 — Escritório da gerência**
```text
[STYLE BLOCK]
Bright modern management office with a glass wall overlooking a supermarket checkout area. A large wall-mounted screen showing a softly blurred navy-blue dashboard with no readable text. White desk, minimal decor, no logos.
```

**R10 — Espaço 3D**
```text
[STYLE BLOCK]
Abstract 3D environment for motion graphics: deep navy blue void (#0A2540) with a subtle gradient toward #0F4C81, soft volumetric light, faint floating particles, floating frosted-glass cards with rounded corners and simple white icons, thin glowing lines connecting them. No text.
```

---

## 5. Telas do app (prints)

O Flow **não consegue mostrar as telas reais** do app: ele inventa a interface e
deforma letras e números. Por isso as telas entram como **prints (capturas de
tela) do app**, montados na edição — nunca gerados pelo Flow.

### 5.1 Como funciona

1. **Nos clipes com pessoa usando o celular** (05, 06, 08, 12, 15), o Flow gera
   só **6 s** de cena, com a tela **virada para a pessoa** (a câmera não vê o
   conteúdo). Os **4 s finais** são o **inserto do print**, feito no editor.
2. **No clipe 04** a tela aparece apenas como um brilho azul desfocado; o
   destaque é o logo.
3. **Nos clipes 3D** (03, 07, 09, 10, 13, 14, 16), a interface é simbólica
   (cartões e ícones sem texto). Prints são opcionais, como cartão flutuante
   nos 2–3 s finais (§5.3).
4. **Não use o print como imagem inicial no Flow:** ao animar, o modelo
   deforma o texto do print.

### 5.2 Como montar o inserto do print (CapCut ou similar)

Padrão único para todos os insertos, para o vídeo ficar consistente:

- **Fundo:** a imagem `espaco-3d` (R10), levemente desfocada.
- **Print:** cantos arredondados, sombra suave, ocupando ~70% da altura.
- **Entrada:** sobe de baixo com leve desfoque de movimento (0,5 s).
- **Movimento:** zoom lento de 100% → 108% durante o inserto.
- **Destaque (opcional):** um anel ou retângulo branco suave sobre o elemento
  principal (ex.: o card "no prazo").
- **Título:** texto curto em branco, no canto inferior esquerdo.

### 5.3 Lista de prints

| Print | Tela do app | O que deve aparecer | Clipe |
|---|---|---|---|
| P1 | Checklist | Card de abertura "feito no prazo" | 05 |
| P2 | Ponto | Jornada do dia com as batidas preenchidas | 06 |
| P3 | Jornada de equipe | Card com risco de TAC destacado | 08 |
| P4 | Fechamento | "Tudo pronto!" com a barra completa | 12 |
| P5 | Centro de Controle ou Painel de Vendas (web) | Visão geral | 15 |
| P6 *(opcional)* | Jornada de equipe | Equipe com estados (trabalhando/intervalo) | 07 |
| P7 *(opcional)* | Escala | Escala do dia/semana | 09 |
| P8 *(opcional)* | Painel de Vendas / Indicadores | Curva horária ou semáforos | 10 |
| P9 *(opcional)* | Insumos | Estoque e pedido da semana | 11 |

### 5.4 Como tirar os prints

- **Celular:** print no APK Android (botão de energia + volume), na maior
  resolução do aparelho. Recorte a barra de status (hora, bateria) se tiver
  notificações pessoais.
- **Web (P5):** navegador em tela cheia, 1920 × 1080, zoom 100%.
- **Dados fictícios (LGPD):** o `backend/prisma/seed.ts` cadastra **nomes de
  colaboradores reais**. **Não tire prints com esse banco.** Use um ambiente de
  demonstração com nomes e números fictícios.
- Confira cada print: sem nomes reais, sem marca do supermercado, sem erros na
  tela.

---

## 6. Clipes

Cada clipe: **referências** (Ingredients) · **prompt** (após o Bloco de estilo)
· **narração** · **edição**.

### Clipe 01 — A loja acorda (0:00–0:10)

**Referências:** R4
```text
[STYLE BLOCK]
SCENE: Wide shot of the empty, modern supermarket front-end at dawn: a long row of twelve checkout lanes with white counters and deep red accents, polished floor, glass entrance with blue pre-dawn light outside. No people.
ACTION: 0-4s: overhead lights switch on row by row, from the far end toward the camera. 4-8s: slow dolly forward along the lanes as the conveyor belts start moving. 8-10s: camera settles on the closest checkout lane, warm light filling the frame.
CAMERA: low-angle, slow steady dolly-in, anamorphic look.
AUDIO: hum of lights powering on, soft echo of an empty store, a register booting with a short beep. No music, no voice.
```
**Narração:** "Cinco e meia da manhã. Antes do primeiro cliente, a frente de caixa precisa estar pronta."
**Edição:** sem texto.

### Clipe 02 — O caos de hoje (0:10–0:20)

**Referências:** R2, R9
```text
[STYLE BLOCK] [SUPERVISOR]
SCENE: Cramped back-office desk behind the checkout area, cool desaturated tones. The desk overflows with paper schedules, handwritten time sheets, sticky notes and a laptop showing a blurred, cluttered spreadsheet. A smartphone lies face up on the desk.
ACTION: 0-3s: SUPERVISOR flips through papers, searching. 3-7s: the phone buzzes with a stack of blurred notifications, a sticky note falls to the floor, he rubs his forehead. 7-10s: camera slowly pulls back revealing the whole cluttered desk.
CAMERA: medium shot, slow pull-back.
AUDIO: paper rustling, phone vibrating, muffled store noise. No music, no voice.
```
**Narração:** "Hoje, essa operação depende de papéis, planilhas e mensagens. A informação existe, mas chega tarde."
**Edição:** sem texto.

### Clipe 03 — O custo invisível (0:20–0:30)

**Referências:** R7, R10
```text
[STYLE BLOCK]
SCENE: Stylized 3D in a dark navy void. Small thermal-paper time-clock receipts float and fall slowly. Behind them, a large translucent analog clock face.
ACTION: 0-3s: receipts fall and stack into a growing pile. 3-7s: the clock hands spin faster and blur; a red glow pulses through the pile with each tick. 7-10s: thin red cracks of light spread across the pile, camera pushes in, frame fades to black with red edges.
CAMERA: slow push-in, slight tilt.
AUDIO: ticking that accelerates, low tension drone, deep thud at the end. No music, no voice.
```
**Narração:** "E o que não se vê custa caro: horas extras fora do limite e riscos trabalhistas descobertos tarde demais."
**Edição:** sem texto.

### Clipe 04 — Check-out PRO (0:30–0:40)

**Referências:** R6, R10
```text
[STYLE BLOCK]
SCENE: 3D reveal in the navy void. A sleek modern smartphone rises into frame and rotates toward the camera; its screen glows with a soft, out-of-focus navy-blue light, no readable content.
ACTION: 0-4s: the phone rises and slowly turns to face the camera. 4-6s: a thin red-and-white light ribbon sweeps around it. 6-10s: the phone holds perfectly still, centered and facing the camera, slightly to the left, leaving clean empty space on the right for a logo.
CAMERA: smooth short orbit, then locked-off hold for the last 4 seconds.
AUDIO: soft whoosh, crystalline chime, rising bass swell. No music, no voice.
```
**Narração:** "O Check-out PRO reúne toda a frente de caixa num só lugar. No celular e no navegador."
**Edição:** inserir `mobile/assets/Logo.png` à direita (6–10 s).

### Clipe 05 — Checklist de abertura (0:40–0:50)

**Referências:** R1, R4, R6
```text
[STYLE BLOCK] [FISCAL]
SCENE: Morning, bright checkout area, lanes ready and clean, red and white tones.
DURATION: 6 seconds.
ACTION: 0-3s: FISCAL raises her smartphone, its back facing the camera, and points it at the row of checkouts as if taking a photo; soft white flash. 3-6s: she looks at the screen (screen facing her, not visible to the camera), a soft navy glow lights her face, she smiles slightly.
CAMERA: medium shot from the front, slow push-in.
AUDIO: camera shutter, soft confirmation chime, morning store ambience. No music, no voice.
```
**Narração:** "A abertura é comprovada por foto, no horário certo. Sem papel, sem dúvida."
**Edição:** 0–6 s clipe do Flow; 6–10 s inserto do print **P1** (§5.2). Texto: "Checklist com foto".

### Clipe 06 — Ponto pelo comprovante (0:50–1:00)

**Referências:** R1, R6, R7
```text
[STYLE BLOCK] [FISCAL]
SCENE: Wall-mounted employee time clock near the staff entrance, and a clean white counter beside it.
DURATION: 6 seconds.
ACTION: 0-3s: macro shot, the time clock prints a small thermal paper receipt; FISCAL tears it off. 3-6s: she places the receipt on the counter and photographs it with her smartphone held above it, back of the phone facing the camera; a glowing scan line passes over the receipt.
CAMERA: macro, then medium side shot.
AUDIO: thermal printer whir, paper tear, digital scan sweep. No music, no voice.
```
**Narração:** "O ponto vem do comprovante do relógio. O aplicativo lê a foto e calcula a jornada."
**Edição:** 0–6 s clipe do Flow; 6–10 s inserto do print **P2**. Texto: "Leitura automática do comprovante".

### Clipe 07 — Equipe em tempo real (1:00–1:10)

**Referências:** R10
```text
[STYLE BLOCK]
SCENE: Stylized 3D miniature of the checkout front-end, white with red accents, seen from above, with small figurines at the lanes. Above each figurine floats a status pill: green (working), amber (on break), gray (not arrived yet). A floating navy tablet shows a grid of matching cards without text.
ACTION: 0-3s: camera descends from top-down over the miniature. 3-7s: one figurine walks toward the break room and its pill turns from green to amber; a pulse of light travels along a thin line to the tablet. 7-10s: camera tilts to the tablet, where the matching card updates instantly.
CAMERA: slow descending crane, then tilt.
AUDIO: subtle UI ticks, soft ambient pad. No music, no voice.
```
**Narração:** "A supervisão vê a equipe inteira em tempo real: quem trabalha, quem está em intervalo, quem falta chegar."
**Edição:** texto: "Equipe em tempo real".

### Clipe 08 — Aviso antes do limite (1:10–1:20)

**Referências:** R2, R4, R6
```text
[STYLE BLOCK] [SUPERVISOR]
SCENE: Supermarket aisle next to the checkout area, customers softly blurred in the background.
DURATION: 6 seconds.
ACTION: 0-2s: SUPERVISOR walks briskly holding his smartphone; he stops when it chimes and looks at the screen (screen facing him, not visible to the camera). 2-6s: he looks up toward a checkout lane where a cashier is still working, nods with decision and walks toward her.
CAMERA: smooth front tracking shot, then wide.
AUDIO: soft in-app alert tone, footsteps, store ambience. No music, no voice.
```
**Narração:** "Se uma jornada se aproxima do limite, o sistema avisa. A supervisão age antes do problema."
**Edição:** 0–6 s clipe do Flow; 6–10 s inserto do print **P3**. Texto: "Alerta de risco de TAC".

### Clipe 09 — Escala e rodízio de domingos (1:20–1:30)

**Referências:** R10
```text
[STYLE BLOCK]
SCENE: 3D motion graphics in the navy void. A floating white monthly calendar with red accents and no text; the Sunday column is highlighted. Three groups of small avatar tokens in navy, green and amber.
ACTION: 0-4s: the three groups rotate across the Sundays like a carousel, each group resting on one Sunday out of three. 4-7s: the calendar folds into a clean document page. 7-10s: the page slides into a smartphone, which fans out into several phones, as if sent to the whole team.
CAMERA: slow orbit, then push-in.
AUDIO: soft mechanical clicks, whoosh, light chime. No music, no voice.
```
**Narração:** "O rodízio de domingos é calculado automaticamente, e a escala chega à equipe em segundos."
**Edição:** texto: "Escala e rodízio de domingos".

### Clipe 10 — Vendas, metas e indicadores (1:30–1:40)

**Referências:** R10
```text
[STYLE BLOCK]
SCENE: Store office desktop computer whose monitor shows blurred file icons, then the navy void.
ACTION: 0-2s: close-up of a hand clicking a mouse; document icons on the monitor glow one after another. 2-5s: the icons fly out of the screen as light streams and form a navy dashboard: an hourly sales area chart drawing itself left to right and a circular progress ring filling toward a goal marker. 5-10s: camera arcs to four floating navy glass cards with simple icons (a coin with a heart, a mobile phone, a receipt with an X, a return arrow); their traffic-light dots settle green, green, amber, green, and the amber card gently pulses.
CAMERA: close-up, pull-out into 3D space, then slow arc.
AUDIO: mouse click, data streaming sound, soft glassy UI sounds. No music, no voice.
```
**Narração:** "Vendas, metas e indicadores viram painéis claros, com projeção do mês e semáforos que mostram onde agir."
**Edição:** texto: "Vendas, metas e indicadores".

### Clipe 11 — Insumos (1:40–1:50)

**Referências:** R1, R8
```text
[STYLE BLOCK] [FISCAL]
SCENE: Clean stockroom with shelves holding plastic bag rolls, receipt paper rolls, cleaning cloths and alcohol bottles in plain unlabeled packaging.
ACTION: 0-3s: FISCAL takes a box of receipt paper rolls from a shelf. 3-7s: holographic level bars above each shelf section adjust; one bar drops near its minimum and turns amber. 7-10s: a floating navy card with a simple checklist icon appears and receives a green check mark.
CAMERA: medium shot, slow lateral slide.
AUDIO: cardboard handling, soft UI ticks, stockroom ambience. No music, no voice.
```
**Narração:** "O almoxarifado fica sob controle: cada saída é registrada, e o sistema sugere o pedido da semana."
**Edição:** texto: "Insumos e requisições".

### Clipe 12 — Fechamento do dia (1:50–2:00)

**Referências:** R3, R5, R6
```text
[STYLE BLOCK] [GERENTE]
SCENE: Night, supermarket checkout area, last customer leaving through the glass doors.
DURATION: 6 seconds.
ACTION: 0-3s: GERENTE stands by the checkouts looking at her smartphone (screen facing her, not visible to the camera), soft navy glow on her face. 3-6s: she exhales calmly and puts the phone in her blazer pocket; the overhead lights switch off row by row, mirroring the opening scene.
CAMERA: medium shot, then wide static shot.
AUDIO: soft completion chime, lights clicking off, quiet store. No music, no voice.
```
**Narração:** "No fim do dia, um resumo mostra o que foi concluído e o que falta. Nada fica para trás."
**Edição:** 0–6 s clipe do Flow; 6–10 s inserto do print **P4**. Texto: "Fechamento do dia".

### Clipe 13 — Arquitetura (2:00–2:10)

**Referências:** R10
```text
[STYLE BLOCK]
SCENE: Abstract 3D in the navy void, three stacked translucent layers. Top: a smartphone and a laptop with glowing navy screens. Middle: a glowing processing core with three concentric rings. Bottom: a cylindrical database.
ACTION: 0-4s: light pulses travel from the devices down through the rings to the database and back; small shield icons lock onto the path. 4-7s: beside the phone, a wifi icon turns off and one pulse waits inside a small queue box. 7-10s: the wifi icon turns back on and the waiting pulse is released down the path.
CAMERA: slow orbit around the stack.
AUDIO: soft digital hum, data pulses, gentle lock clicks. No music, no voice.
```
**Narração:** "Por trás, uma arquitetura sólida e em tempo real. Sem internet, o ponto é guardado e sincronizado depois."
**Edição:** rótulos — "App Android e Web" · "API NestJS" · "PostgreSQL" · "Acesso com token seguro" · "Fila offline do ponto".

### Clipe 14 — Segurança e qualidade (2:10–2:20)

**Referências:** R10
```text
[STYLE BLOCK]
SCENE: 3D corridor of glass gates in the navy void. Three key-cards float forward: red, white and navy.
ACTION: 0-4s: each gate opens only for the matching key-card; some gates stay closed. 4-7s: camera rises above the corridor revealing a vast grid of small check marks lighting up green in a wave. 7-10s: the grid converges into a single glowing shield.
CAMERA: forward glide, then crane up.
AUDIO: soft gate clicks, cascading positive ticks, resolved tone. No music, no voice.
```
**Narração:** "Cada perfil acessa só o que precisa, e testes automáticos validam cada mudança antes de chegar à loja."
**Edição:** texto — "Perfis e permissões" · "Testes automáticos". Opcional: números atuais de [Estado e métricas](estado-e-metricas.md).

### Clipe 15 — Resultado (2:20–2:30)

**Referências:** R2, R3, R9
```text
[STYLE BLOCK] [GERENTE] [SUPERVISOR]
SCENE: Bright modern management office with a glass wall overlooking the busy, organized checkout area with customers. A large wall-mounted screen shows a softly blurred navy-blue dashboard with no readable text.
DURATION: 6 seconds.
ACTION: 0-3s: GERENTE and SUPERVISOR stand side by side in front of the wall screen; she points at it, he nods, both relaxed. 3-6s: camera slowly moves past them toward the glass, revealing the checkouts running smoothly.
CAMERA: slow push forward.
AUDIO: calm office ambience, muffled store sounds. No music, no voice.
```
**Narração:** "Menos retrabalho, mais controle, decisões com dados. A gestão deixa de buscar informação e passa a ser avisada."
**Edição:** 0–6 s clipe do Flow; 6–10 s inserto do print **P5**.

### Clipe 16 — Assinatura (2:30–2:40)

**Referências:** R10
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

## 7. Ordem de trabalho

1. **Imagens de referência** R1–R10 (§4) — escolher e guardar as melhores.
2. **Prints do app** (§5.3) num ambiente com dados fictícios.
3. **Clipes** 01–16 no Flow (Omni Flash, 16:9; 6 s nos clipes 05, 06, 08, 12 e 15; 10 s nos demais), com as referências.
4. **Edição:** insertos dos prints (§5.2), títulos, narração (uma voz), trilha e
   correção de cor.
5. **Revisão final:** conferir a tabela "O que o vídeo não pode afirmar" (§2) e
   que não aparece nenhuma marca do supermercado nem nome real.
