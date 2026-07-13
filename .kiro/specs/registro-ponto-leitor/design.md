# Design — Registro de Ponto (leitor de papelito)

## 1. Arquitetura geral

Captura no telefone → leitura/validação no backend → persistência → painel.

```
[App/Web]  câmera/foto (Fase B) ou entrada manual (Fase A)
    │
    ├── (Fase B) POST /ponto/ocr  { imagem }  ──► OCR na nuvem + parser do papelito
    │                                            devolve { nome, data, hora, confianca }
    │
    └── POST /ponto/batidas  { pessoaId, tipoPessoa, data, hora, origem, comprovante? }
                                    │
                              [Backend NestJS]
                                    │
                        grava BatidaPonto (Prisma) + auditoria
                                    │
                    GET /ponto/dia?pessoaId&data ──► jornada calculada
```

Princípios (seguindo o projeto):
- **Lógica pura** de cálculo de jornada isolada em `ponto.domain.ts` (testável
  com fast-check, como `fiscais.domain.ts`).
- **Permissões** na fonte única `acessos.domain.ts`, espelhadas no mobile
  (ADR 0002), aplicadas com `@Funcionalidade` + `PerfilGuard`.
- **Migração aditiva** em `prisma/migrations` (novo diretório numerado).
- Reaproveitar as constantes de carga horária esperada já existentes em
  `fiscais.domain.ts` (`jornadaEsperadaMs`) para não duplicar regra.

A nova seção **coexiste** com o fluxo atual de status do fiscal; não o remove.

## 2. Modelo de dados (Prisma)

Novo enum e novo modelo. Identificação polimórfica no padrão de `Ausencia`
(`pessoaId` = id de fiscal ou operador; `colaboradorId` opcional para ligar ao
cadastro central).

```prisma
enum TipoBatida {
  ENTRADA
  SAIDA_INTERVALO
  RETORNO_INTERVALO
  ENCERRAMENTO
  EXTRA
}

enum OrigemBatida {
  MANUAL   // Fase A: digitada/confirmada
  LEITOR   // Fase B: extraída do papelito por OCR
  EDITADO  // corrigida depois
}

enum TipoPessoaPonto {
  FISCAL
  OPERADOR
}

model BatidaPonto {
  id             String          @id @default(cuid())
  pessoaId       String          // id do fiscal (ou operador no futuro)
  tipoPessoa     TipoPessoaPonto @default(FISCAL)
  colaboradorId  String?         // liga ao cadastro central quando houver
  data           DateTime        // bucket do dia (inicioDoDia), como nos demais módulos
  hora           DateTime        // momento exato da batida (UTC)
  tipo           TipoBatida
  origem         OrigemBatida    @default(MANUAL)
  confianca      Float?          // confiança do OCR (Fase B)
  comprovanteUrl String?         // imagem do papelito (opcional)
  registradoPor  String          // usuarioId de quem registrou
  registradoPorNome String?
  criadoEm       DateTime        @default(now())
  atualizadoEm   DateTime        @updatedAt

  @@index([pessoaId, data])
  @@map("batidas_ponto")
}
```

Observações:
- Não usamos uma linha por dia com 4 colunas fixas: guardamos **uma linha por
  batida**. Isso suporta dias com 2 batidas (sem intervalo), com extras, e a
  reclassificação ao remover uma batida.
- O `tipo` é **derivado da ordem** ao gravar, mas fica **armazenado** para poder
  ser corrigido manualmente.
- Reaproveitamos o `RegistroPontoFiscal` atual? **Não** — ele é um log de status
  (3 estados) com semântica diferente. A nova tabela é dedicada às batidas do
  relógio físico.

Migração: `prisma/migrations/<proximo>_registro_ponto/migration.sql` (CREATE
TYPE dos enums + CREATE TABLE `batidas_ponto` + índices). Aditiva.

## 3. Domínio puro — `backend/src/ponto/ponto.domain.ts`

Funções sem I/O (fáceis de testar):
- `classificarBatidas(batidas): BatidaClassificada[]` — ordena por `hora` e
  atribui ENTRADA/SAIDA_INTERVALO/RETORNO_INTERVALO/ENCERRAMENTO à 1ª..4ª;
  as demais viram EXTRA.
- `calcularJornadaDia(batidas, agora, base): JornadaPonto` retornando:
  - `trabalhadoMs` = (saídaIntervalo − entrada) + (encerramento − retorno);
    se só há entrada aberta, conta até `agora`. **O intervalo NÃO conta como
    jornada** (ex.: 3h + 2h intervalo + 4h = 7h trabalhadas).
  - `intervaloMs` = retorno − saídaIntervalo.
  - `status`: SEM_REGISTRO | TRABALHANDO | EM_INTERVALO | ENCERRADO | INCOMPLETO.
  - `horasExtrasMs` = max(0, trabalhadoMs − base).
  - **Classificação das extras (adicional):**
    - `horasExtras50Ms` — extras de **Seg a Sáb** (adicional de 50%).
    - `horasExtras100Ms` — extras de **Domingo** (adicional de 100%).
    (num mesmo dia só uma das duas é > 0, conforme o dia da semana.)
  - `alertaIminente`: boolean = `horasExtrasMs >= ALERTA_EXTRAS_MS` (1h45) e
    ainda trabalhando (não encerrado). Dispara os avisos de "vai exceder".
  - `tac`: boolean e `motivosTac: string[]` — vira **TAC** quando:
    - `horasExtrasMs > LIMITE_EXTRAS_MS` (passou de 1h50), OU
    - `intervaloMs < INTERVALO_MINIMO_MS` (intervalo menor que 1h).
  - `intervaloAcimaMaximo`: boolean = `intervaloMs > INTERVALO_MAXIMO_MS` (3h) —
    intervalo fora do permitido (sinalizar).
  - `faltando`: lista do que falta (ex.: "retorno do intervalo").
- Reusa `jornadaEsperadaMs(diaSemana)` de `fiscais.domain.ts` como **base** (ou
  move para um util compartilhado).
- Parâmetros por dia (constantes documentadas e ajustáveis):

  | Dia     | Base trabalhada | Alerta a partir de | Limite extras (→TAC) | Adicional extras | Intervalo (min–máx / esperado) |
  |---------|-----------------|--------------------|----------------------|------------------|--------------------------------|
  | Seg–Qui | 7h00            | 1h45               | 1h50                 | 50%              | 1h – 3h / 2h                   |
  | Sex–Sáb | 8h00            | 1h45               | 1h50                 | 50%              | 1h – 3h / 2h                   |
  | Dom     | 7h20            | 1h45               | 1h50                 | 100%             | 1h – 3h / 2h                   |

  - `ALERTA_EXTRAS_MS` = 1h45 (6 300 000 ms) — início dos avisos por minuto.
  - `LIMITE_EXTRAS_MS` = 1h50 (6 600 000 ms) — acima disso é TAC.
  - `INTERVALO_ESPERADO_MS` = 2h (7 200 000 ms).
  - `INTERVALO_MINIMO_MS` = 1h (3 600 000 ms) — abaixo disso é TAC.
  - `INTERVALO_MAXIMO_MS` = 3h (10 800 000 ms) — acima disso é irregular.
  - Base = `jornadaEsperadaMs(diaSemana)` (Dom 7h20, Seg–Qui 7h, Sex–Sáb 8h).

> **TAC** = classificação/rótulo que o usuário usa para marcar o dia como
> irregular (excesso de extras ou intervalo curto). O termo é mantido como está;
> o significado/legenda pode ser ajustado.

### 3.1 Alertas de excesso (serviço agendado)
`backend/src/ponto/ponto-alertas.service.ts` — cron **a cada 1 minuto**: para
cada colaborador **ainda trabalhando hoje** com `horasExtrasMs >= 1h45`, envia
notificação ("Fulano vai exceder o horário diário permitido"). O colaborador
**continua podendo bater/carregar papelito**; ao passar de 1h50 o dia fica TAC.
Reaproveita `NotificacoesModule` (mesmo padrão de `fiscais-horario.service.ts`).

## 4. Backend — módulo `ponto`

Arquivos: `ponto.module.ts`, `ponto.controller.ts`, `ponto.service.ts`,
`ponto.domain.ts`, `dto/ponto.dto.ts` (+ `.spec.ts`).

Endpoints (base `/ponto`):
- `POST /ponto/batidas` — cria batida. `@Funcionalidade('PONTO_REGISTRAR')`.
  Body: `{ pessoaId, tipoPessoa, colaboradorId?, data, hora, origem?, comprovanteUrl? }`.
  Valida data (aviso se ≠ hoje), duplicidade de hora, e classifica.
- `PATCH /ponto/batidas/:id` — edita hora/tipo. `PONTO_REGISTRAR`.
- `DELETE /ponto/batidas/:id` — remove e reclassifica. `PONTO_REGISTRAR`.
- `GET /ponto/dia?pessoaId&tipoPessoa&data` — batidas + jornada calculada.
  `PONTO_VISUALIZAR`.
- `GET /ponto/pessoas?busca=` — busca colaboradores por nome/matrícula para
  seleção (reusa dados de `Colaborador`/`Fiscal`). `PONTO_REGISTRAR`.
- **(Fase B)** `POST /ponto/ocr` — recebe imagem, chama o serviço de OCR,
  aplica o parser do formato do papelito e devolve `{ nome, data, hora,
  confianca, candidatosColaborador[] }`. `PONTO_REGISTRAR`.

Serviço de OCR (Fase B): interface `LeitorPapelitoService` com implementação
`OcrNuvemService` (provedor de nuvem via chave). Interface permite trocar por
implementação local/servidor próprio sem mudar o controller. O **parser do
formato do papelito** é uma função pura testável (regex sobre o texto extraído:
nome, `dd/mm/aaaa`, `HH:mm`).

## 5. Permissões

Em `backend/src/acessos/acessos.domain.ts`:
- Adicionar `PONTO_REGISTRAR` e `PONTO_VISUALIZAR` a `TODAS_FUNCIONALIDADES`.
- Incluir ambas em `FUNCIONALIDADES_FISCAL` (e, por herança, supervisor/gerente).
- `GERENTE_DESENVOLVEDOR` já recebe tudo automaticamente.

Espelhar as duas strings em `mobile/src/auth/funcionalidades.ts` (ADR 0002).

## 6. Mobile / Web

- **Serviço:** `mobile/src/api/services/ponto.ts` (`pontoService`): `registrarBatida`,
  `editarBatida`, `removerBatida`, `jornadaDoDia`, `buscarPessoas`, e (Fase B)
  `lerPapelito(imagem)`.
- **Tipos:** adicionar em `mobile/src/api/types.ts` (`BatidaPonto`, `TipoBatida`,
  `JornadaPonto`, etc.).
- **Navegação:** nova entrada em `mobile/src/navigation/areas.ts`
  (`{ rota: 'RegistroPonto', titulo: 'Registro de Ponto', funcionalidade:
  'PONTO_VISUALIZAR', icone: ... }`), tipo de rota em `navigation/types.ts`,
  screen registrada em `AppNavigator.tsx` com guarda `podeAcessar`, e path em
  `RootNavigator.tsx` (deep link).
- **Telas** (`mobile/src/screens/ponto/`):
  - `RegistroPontoScreen.tsx` — busca/seleção do colaborador + jornada do dia +
    lista das batidas (com editar/remover) + botão "Registrar batida".
  - `RegistrarBatidaModal` — Fase A: seletor de data/hora + confirmar.
    Fase B: abre câmera/foto, chama `/ponto/ocr`, pré-preenche e confirma.
  - Modo **lote**: estado que, após confirmar, volta para nova leitura e mantém
    resumo da sessão.
- **Câmera (Fase B):** reutilizar o padrão de `components/LeitorCodigoBarras.tsx`
  (`CameraView` + `useCameraPermissions`) para captura ao vivo no app; na web
  (iPhone/Safari) usar captura por foto (`expo-image-picker`/input file). O
  resultado é sempre uma imagem enviada a `/ponto/ocr`.

## 7. Cálculo de horas (resumo)

- **A hora que vale é a do papelito** (`hora` da batida), NÃO a hora em que foi
  carregada/registrada (`criadoEm`). Ex.: bate às 12:10 e carrega às 12:15 → o
  sistema grava a saída às **12:10** e conta o trabalho até 12:10. O relógio do
  dia começa a andar a partir da 1ª batida (ex.: entrada 07:56 conta desde 07:56).
- Trabalhado = (saída_intervalo − entrada) + (encerramento − retorno).
  **O intervalo não conta como jornada** (3h + 2h intervalo + 4h = 7h).
- Sem intervalo (2 batidas) = última − primeira.
- Intervalo = retorno − saída_intervalo. Permitido **1h a 3h** (esperado 2h);
  **< 1h → TAC**; **> 3h → irregular**.
- Extra = max(0, trabalhado − base_do_dia).
- Base do dia: Dom 7h20 · Seg–Qui 7h · Sex–Sáb 8h.
- **Adicional das extras:** Seg–Sáb = 50% · Domingo = 100%.
- Alerta "vai exceder" a partir de **1h45** (a cada minuto); **> 1h50 → TAC**.

## 8. Testes
- `ponto.domain.spec.ts`: classificação das 4 batidas, cálculo de trabalhado/
  intervalo/extra, casos incompletos, batidas fora de ordem, extras.
- Parser do papelito (Fase B): testes de exemplos de texto do papelito.
- Mobile: teste da screen (render, seleção, registro manual) com serviço mockado.

## 9. Riscos e mitigações
- **OCR nunca é 100%** → confirmação/edição manual sempre disponível; parser
  focado no formato fixo do papelito aumenta muito o acerto.
- **Chave da nuvem (Fase B)** → depende de conta/credencial do usuário;
  isolada atrás de interface para trocar por servidor próprio se preferir.
- **iPhone/Safari** → captura por foto (não ao vivo); mesmo endpoint de OCR.
- **Correspondência de nome** → busca com candidatos e confirmação humana.

## 10. Faseamento
- **Fase A (agora):** modelo + migração + domínio + serviço/controller + perms +
  serviço/tipos mobile + tela com registro manual + painel de jornada + testes.
- **Fase B (depois):** captura de imagem + endpoint `/ponto/ocr` + parser +
  integração no modal + comprovante.
