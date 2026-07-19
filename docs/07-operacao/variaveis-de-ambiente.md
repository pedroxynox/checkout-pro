> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** operação — variáveis de ambiente

# Variáveis de ambiente — Check-out PRO

Referência de **todas** as variáveis de ambiente do projeto, o que fazem, seus
valores padrão e quais são **obrigatórias em produção**.

> **Fontes desta página** (mantenha em sincronia ao editar):
> - Backend, esquema validado: `backend/src/config/env.validation.ts`
> - Backend, modelo comentado: `backend/.env.example`
> - Backend, variáveis lidas em runtime: `backend/src/main.ts`,
>   `backend/src/storage/local-disk-storage.ts`, `backend/prisma/seed.ts`
> - App móvel: `mobile/src/api/config.ts`
>
> O backend **valida as variáveis no boot** (falha rápida): um ambiente
> inválido impede o start em vez de falhar silenciosamente depois. Novas
> variáveis usadas por serviços devem ser adicionadas ao esquema em
> `env.validation.ts`.

---

## 1. Backend — variáveis validadas no boot

Definidas e validadas em `env.validation.ts`. A coluna **Obrigatória em prod.**
indica as que impedem o start quando `NODE_ENV=production`.

| Variável | Descrição | Padrão | Formato / validação | Obrigatória em prod. |
|---|---|---|---|---|
| `NODE_ENV` | Ambiente de execução. | `development` | `development` \| `test` \| `production` | Não |
| `PORT` | Porta HTTP da API. | `3000` | Inteiro de 1 a 65535 (convertido de string) | Não |
| `DATABASE_URL` | String de conexão do PostgreSQL usada pelo Prisma. | — | Texto | ✅ **Sim** |
| `HORARIO_FIM_DO_DIA` | Horário de "fim do dia" para alertas de importações pendentes. | `22:50` | `HH:mm` (regex `([01]\d\|2[0-3]):[0-5]\d`) | Não |
| `JWT_SECRET` | Segredo de assinatura dos tokens JWT (autenticação). | — (em dev, gera-se um segredo aleatório efêmero por processo) | Texto — use valor longo e aleatório (`openssl rand -hex 32`) | ✅ **Sim** |
| `JWT_EXPIRES_IN` | Expiração do token de acesso. | — (no `.env.example` e no `render.yaml`: `30d`) | Texto (ex.: `8h`, `30m`, `30d`) | Não |
| `GEMINI_API_KEY` | Chave da API do Google Gemini (assistente de IA / chat flutuante). Sem ela, o assistente responde "não configurado". | — | Texto | Não* |
| `GEMINI_MODEL` | Modelo Gemini usado pelo assistente. | `gemini-2.5-flash` | Texto | Não |
| `CORS_ORIGINS` | Lista de origens permitidas para CORS, separadas por vírgula. Se vazio, em dev a origem da requisição é refletida. | — | Texto (ex.: `https://checkout-pro-web.onrender.com`) | Recomendada** |
| `RETENCAO_INATIVOS_MESES` | Janela de retenção (meses) dos colaboradores desligados antes da purga mensal apagar ficha e histórico de RRHH. | `3` | Inteiro ≥ 1 (convertido de string) | Não |

\* `GEMINI_API_KEY` é opcional para a API subir, mas **necessária** para o
assistente funcionar. Veja também a nota de cota no
[Checklist de produção](checklist-producao.md).

\** `CORS_ORIGINS` não é validada como obrigatória, mas em produção deve ser
definida para restringir quem chama a API pelo navegador (ver `main.ts`).

---

## 2. Backend — variáveis lidas em runtime (fora do esquema)

Estas variáveis **não** passam pela validação de `env.validation.ts`; são lidas
diretamente e têm padrões embutidos. Documentadas aqui para não passarem
despercebidas.

| Variável | Descrição | Padrão | Onde é usada |
|---|---|---|---|
| `SENHA_INICIAL` | Senha inicial aplicada aos usuários criados pelo seed (gerentes e fiscais). Deve ser trocada após o primeiro acesso. Re-execuções do seed não sobrescrevem senhas já alteradas. | `CheckoutPro@2025` (padrão do seed — nunca usar em produção) | `backend/prisma/seed.ts` |
| `STORAGE_DIR` | Diretório onde ficam os arquivos enviados pelos usuários (ex.: fotos dos checklists). | `uploads` | `backend/src/main.ts`, `backend/src/storage/local-disk-storage.ts` |
| `STORAGE_PUBLIC_URL` | Prefixo público sob o qual os arquivos enviados são servidos. Se começar com `/`, são servidos localmente; se for uma URL `http(s)`, a entrega é delegada a um storage externo. | `/arquivos` | `backend/src/main.ts`, `backend/src/storage/local-disk-storage.ts` |

> **Cuidado com o seed em produção:** no `render.yaml`, `SENHA_INICIAL` está
> como `sync: false` (secreta, definida no painel do serviço) e o seed **não**
> roda automaticamente no deploy. Rode-o manualmente apenas em um banco
> novo/vazio. Detalhes em [`deploy.md`](deploy.md).

---

## 3. App móvel (Expo)

Definida em `mobile/src/api/config.ts`. Variáveis públicas do Expo usam o
prefixo `EXPO_PUBLIC_`.

| Variável | Descrição | Padrão | Onde é definida |
|---|---|---|---|
| `EXPO_PUBLIC_API_URL` | URL base da API que o app consome. Barras finais são removidas automaticamente. | `http://localhost:3000` | Ambiente de build/execução; nos perfis de `mobile/eas.json` aponta para a API do Render |

Valores por perfil de build (`mobile/eas.json`):

| Perfil | `EXPO_PUBLIC_API_URL` |
|---|---|
| `development` | `http://localhost:3000` |
| `preview` (APK) | `https://checkout-pro-api.onrender.com` |
| `production` (App Bundle) | `https://checkout-pro-api.onrender.com` |

> O app usa timeout de requisição de 60s para tolerar o *cold start* de
> servidores gratuitos (Render free), que hibernam após inatividade. Veja o
> [runbook de incidentes](runbook-incidentes.md).

---

## 4. Segredos de CI/CD (não são variáveis da aplicação)

| Segredo | Onde | Para quê |
|---|---|---|
| `EXPO_TOKEN` | Secret do repositório GitHub | Autenticar o EAS Build no workflow `build-apk.yml` (nunca no código). |
| `JWT_SECRET`, `GEMINI_API_KEY`, `SENHA_INICIAL` | Painel do serviço no Render | Definidos como secretos/gerados no `render.yaml` (`generateValue`/`sync: false`). Ver [`deploy.md`](deploy.md). |

---

## 5. Resumo — o que é obrigatório em produção

Bloqueiam o start da API quando `NODE_ENV=production` (checagem explícita em
`validateEnv`, além dos decorators):

- ✅ `JWT_SECRET`
- ✅ `DATABASE_URL`

Fortemente recomendadas para produção correta e segura (ver
[Checklist de produção](checklist-producao.md)): `CORS_ORIGINS`,
`GEMINI_API_KEY` e `SENHA_INICIAL`.
