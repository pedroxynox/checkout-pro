# Check-out PRO — Gestão Inteligente de Supermercado

Aplicação web e Android para gestão da frente de caixa de supermercado. O produto reúne operação diária, pessoas, jornada, ponto, indicadores, estoque, checklists, notificações e a assistente **Cluby** em um monorepo com backend NestJS e app Expo/React Native.

> UI e domínio em Português do Brasil. Estado deste documento: **15/07/2026**. O código descrito está mesclado na `main` até o commit `e8c32be`; este registro não confirma que o último commit já tenha sido implantado no Render.

## Estado atual

- Backend: build validado; **71 suítes / 410 testes**.
- Mobile: type-check e lint validados; **23 suítes / 85 testes**.
- Última migração Prisma: `9zq_alerta_tac_enviado`.
- Alertas preventivos de TAC entregues nos PRs **#234 e #235**:
  - `>= 1h30` de horas extras: **Risco de TAC**;
  - `>= 1h40`: **Risco alto de TAC**;
  - `> 1h50`: **TAC**;
  - destinatários: supervisores e gerentes;
  - envio best-effort, sem bloquear a batida;
  - deduplicação por pessoa/dia/etapa **persistente** (tabela `AlertaTacEnviado`, reserva atômica por índice único), compartilhada entre a batida e o cron: sobrevive a reinícios e coordena múltiplas instâncias.
- Central de Jornada, feriados e contrato `6x1-2x1` entregues nos PRs **#224 e #225**.
- Auditoria de segurança, privacidade, atomicidade, dependências e desempenho consolidada nos PRs **#211–#214 e #223**.
- Dependabot ajustado para reduzir upgrades incompatíveis/major nos PRs **#226 e #232**.

## Funcionalidades principais

- **Acessos e pessoas:** login por matrícula, JWT com revogação por `tokenVersion`, permissões por funcionalidade, Cadastro Unificado de Colaboradores e perfis de gerente desenvolvedor, gerente, supervisor, fiscal e importador.
- **Operação diária:** importação de vendas e arrecadação por `.txt`, fechamento inteligente, metas, indicadores, painel de vendas e tratamento de lançamentos não reconhecidos.
- **Registro de Ponto:** batidas manuais ou por comprovante fotografado, OCR no servidor/web e ML Kit no Android, confirmação antes da gravação, jornada calculada e alertas de risco/TAC.
- **Central de Jornada:** ciclo de apuração **26→25** e consolidação de operadores, supervisores e fiscais; o backend compara até 12 ciclos e o app exibe atualmente seis, com carga trabalhada/base diária, extras 50%/100%, horas devidas, atestados, faltas, TAC e saldo.
- **Escala e calendário:** contrato `SEIS_X_UM_DOIS_X_UM`; feriados nacionais automáticos e estaduais/municipais manuais; feriado segue a regra de domingo.
- **RRHH:** faltas e justificativas, incidências/sanções, solicitações de advertência, contratos de experiência, feedforward e perfil inteligente do colaborador.
- **Estoque e rotinas:** insumos, requisições, pedidos recorrentes, Sacolas APAE, checklist com imagem/hash e notificações.
- **Cluby:** assistente com Google Gemini e conversa persistida; procedimentos/normativas em escala continuam desativados até a implantação de RAG.
- **Notificações:** in-app, WebSocket e envio real pelo Expo Push Service. Para Android em produção ainda é necessário configurar FCM e gerar/publicar novo APK.

## Arquitetura

```text
mobile/ (Expo / React Native / Web)
       └── HTTPS + JWT + Socket.IO
backend/ (NestJS / Prisma / Cron)
       └── PostgreSQL + Gemini + Expo Push Service
```

O backend segue, por módulo, `controller → service → domain/Prisma`. Regras puras ficam em `*.domain.ts`; DTOs validam entrada; erros de domínio são traduzidos por filtro global. O mobile separa API, autenticação, componentes, navegação, telas, offline, tema e utilitários.

| Camada | Tecnologias |
| --- | --- |
| Backend | Node.js, NestJS 10, TypeScript strict, Prisma 5, PostgreSQL, JWT, Socket.IO, `@nestjs/schedule` |
| Mobile | React Native 0.76, Expo SDK 52, React Navigation, SQLite/offline |
| IA e push | Gemini `gemini-2.5-flash`, Expo Push Service; FCM necessário no APK Android |
| Qualidade | Jest, fast-check, Testing Library, ESLint, Prettier |
| Infra | Render, PostgreSQL, EAS Build |

## Estrutura do repositório

```text
backend/
├── prisma/                 # schema, migrations e seed
├── assets/procedimentos/   # imagens do piloto de normativas
└── src/                    # módulos NestJS
mobile/
├── assets/                 # marca e ícones
└── src/
    ├── api/ auth/ navigation/
    ├── components/ hooks/ offline/
    ├── screens/ theme/ utils/
    └── ...
docs/                       # operação, auditorias e ADRs
.kiro/steering/             # handoff técnico e estado operacional
```

## Instalação local

Pré-requisitos: Node.js 18 ou superior e PostgreSQL.

```bash
npm install

cd backend
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run start:dev

# em outro terminal
cd mobile
EXPO_PUBLIC_API_URL=http://localhost:3000 npm run start
```

## Variáveis importantes

### Backend

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | conexão PostgreSQL; obrigatória em produção |
| `JWT_SECRET` | assinatura JWT; obrigatória em produção |
| `JWT_EXPIRES_IN` | validade do token; padrão `30d` |
| `CORS_ORIGINS` | allowlist da web em produção |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Cluby; modelo padrão `gemini-2.5-flash` |
| `HORARIO_FIM_DO_DIA` | horário dos alertas operacionais |
| `SENHA_INICIAL` | senha usada pelo seed |
| `RETENCAO_INATIVOS_MESES` | retenção antes da purga; padrão 12 meses |

### Mobile

| Variável | Uso |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | URL pública da API |

A entrega de push Android depende também das credenciais **Firebase Cloud Messaging (FCM)** vinculadas ao projeto Expo/EAS; depois da configuração é obrigatório recompilar e distribuir o APK.

## Verificação

```bash
# backend
cd backend
npm run prisma:generate
npm run prisma:validate
npm run build
npm test

# mobile
cd mobile
npm run type-check
npm run lint
npm test -- --runInBand
```

Os quatro arquivos com diferenças Prettier históricas (`alertas.service.spec.ts`, `fiscais.service.ts`, `insumos.service.ts` e `test/helpers/fake-prisma.ts`) já foram formatados em PR isolado (apenas estilo, sem diff funcional). Com o Prettier 3.9.5, o `--check` global ainda aponta 9 arquivos de domínio por deriva de versão da ferramenta; o CI os normaliza no ato via `eslint --fix`, então não quebram a validação.

## Deploy e APK

- Render hospeda API, web estática e PostgreSQL.
- O código em `main` pode acionar deploy automático, mas **merge não é prova de deploy concluído**; conferir painel, logs e `/health/ready`.
- Migrations devem rodar em **Pre-Deploy Command**; o processo web deve iniciar sem ficar aguardando advisory lock do Prisma.
- O banco deve usar plano persistente/estável antes da entrega ao cliente.

```bash
cd mobile
eas build -p android --profile preview
```

## Pendências prioritárias

1. Configurar FCM e publicar novo APK para ativar push Android com o app fechado.
2. Validar OCR/ML Kit com comprovantes reais em aparelho Android.
3. Migrar o PostgreSQL do Render para plano persistente e mover migrations para Pre-Deploy.
4. Contratar tier do Gemini compatível com uso multiusuário.
5. Decidir/implementar as áreas ocultas: Alertas de Fila, Normativas e Indicador de Quebra.
6. Implantar RAG com pgvector e object storage antes de reativar normativas em escala.
7. Preparar `reset:cliente` + seed limpo antes da entrega; multi-tenancy permanece parqueado.
8. **Concluído.** Deduplicação persistente dos alertas TAC (tabela `AlertaTacEnviado`, migration `9zq`): sobrevive a reinícios e coordena múltiplas instâncias.

## Documentação

- [`PROJECT_UNDERSTANDING.md`](PROJECT_UNDERSTANDING.md) — snapshot canônico e completo do produto.
- [`REGISTRO_DE_MUDANCAS.md`](REGISTRO_DE_MUDANCAS.md) — histórico cronológico das entregas.
- [`GUIA_QA.md`](GUIA_QA.md) — validação manual por perfil e por fluxo.
- [`.kiro/steering/estado-e-pendientes.md`](.kiro/steering/estado-e-pendientes.md) — handoff operacional e prioridades.
- [`.kiro/steering/arquitetura.md`](.kiro/steering/arquitetura.md) — mapa técnico.
- [`docs/ESTADO_Y_PROXIMOS_PASOS.md`](docs/ESTADO_Y_PROXIMOS_PASOS.md) — índice de compatibilidade que aponta para as fontes canônicas.

## Convenções

- UI, domínio, código, commits e PRs em Português do Brasil; handoff pode ser em espanhol.
- TypeScript `strict`; evitar `any`.
- Novas regras: domínio puro + testes quando aplicável; migrations aditivas por padrão.
- Nova migration deve ordenar depois de `9zq_alerta_tac_enviado`.
- Trabalhar em branch e PR; não publicar diretamente em `main` sem pedido explícito.
