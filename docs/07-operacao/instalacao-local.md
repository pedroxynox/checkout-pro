> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** operação — instalação e execução local

# Instalação local — Check-out PRO

Guia para subir o projeto do zero em uma máquina de desenvolvimento. O
repositório é um **monorepo com npm workspaces**: o backend (`backend/`, NestJS)
e o app móvel (`mobile/`, React Native + Expo) compartilham um único
`package-lock.json` na raiz.

> Para colocar em produção, veja [`deploy.md`](deploy.md) e o
> [Checklist de produção](checklist-producao.md). Para o significado de cada
> variável de ambiente, veja [`variaveis-de-ambiente.md`](variaveis-de-ambiente.md).

---

## 1. Pré-requisitos

| Ferramenta | Versão mínima | Observação |
|---|---|---|
| **Node.js** | 20+ | O CI e os builds (Render, EAS) usam Node 20. O `package.json` da raiz aceita `>=18`, mas prefira 20 para reproduzir o ambiente de produção. |
| **npm** | 9+ | Acompanha o Node 20. É o gerenciador usado pelos workspaces. |
| **PostgreSQL** | 14+ | Banco de dados usado pelo Prisma. Pode ser local ou um container Docker. |
| **Git** | — | Para clonar o repositório. |
| **Expo Go** ou emulador Android/iOS | — | Apenas para rodar o app móvel. |

Ferramentas como o **NestJS CLI**, o **Prisma** e o **ts-node** já vêm como
dependências do projeto — não precisam ser instaladas globalmente.

---

## 2. Instalar as dependências (workspaces)

Na **raiz do repositório** (nunca dentro de `backend/` ou `mobile/`), rode uma
única vez:

```bash
npm install
```

Como é um monorepo com workspaces, esse comando instala as dependências do
backend **e** do app de uma vez, a partir do `package-lock.json` da raiz.

---

## 3. Preparar o banco de dados PostgreSQL

Garanta que um PostgreSQL esteja rodando e acessível. Exemplo rápido com Docker:

```bash
docker run --name checkout-pro-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres -e POSTGRES_DB=checkout_pro \
  -p 5432:5432 -d postgres:16
```

A URL de conexão correspondente (usada no próximo passo) é:

```
postgresql://postgres:postgres@localhost:5432/checkout_pro?schema=public
```

---

## 4. Configurar o `.env` do backend

O backend valida as variáveis de ambiente **no boot** e falha rápido se algo
essencial estiver ausente ou fora do formato (ver
[`variaveis-de-ambiente.md`](variaveis-de-ambiente.md)).

Copie o modelo versionado e ajuste os valores:

```bash
cp backend/.env.example backend/.env
```

Para desenvolvimento local, o mínimo é apontar o `DATABASE_URL` para o seu
PostgreSQL. As demais variáveis têm padrões seguros para dev:

- `DATABASE_URL` — obrigatória para o Prisma funcionar (opcional apenas porque
  em dev/teste o boot não a exige, mas as migrações precisam dela).
- `JWT_SECRET` — em dev pode ficar vazio (gera-se um segredo aleatório efêmero
  por processo). **Em produção é obrigatório.**
- `GEMINI_API_KEY` — opcional; sem ela o assistente responde "não configurado".

> Os valores de `backend/.env.example` já trazem comentários explicando cada
> variável. Consulte-os antes de alterar.

---

## 5. Gerar o Prisma Client e aplicar as migrações

Ainda com o `DATABASE_URL` configurado, rode dentro do workspace do backend:

```bash
# Aplica as migrações e cria o schema no banco (modo desenvolvimento)
npm run prisma:migrate --workspace=@checkout-pro/backend

# Gera o Prisma Client tipado (também roda automaticamente no build)
npm run prisma:generate --workspace=@checkout-pro/backend
```

Opcionalmente, popule dados iniciais (usuários do seed). A senha inicial vem da
variável `SENHA_INICIAL` (padrão de dev definido no seed — troque no primeiro
acesso):

```bash
npm run seed --workspace=@checkout-pro/backend
```

---

## 6. Rodar o backend (API NestJS)

```bash
# Produção-like (usa o start padrão do Nest)
npm run start --workspace=@checkout-pro/backend

# Ou em modo watch (recarrega ao salvar), durante o desenvolvimento
npm run start:dev --workspace=@checkout-pro/backend
```

A API sobe em `http://localhost:3000` (porta configurável via `PORT`). Verifique
a saúde do serviço:

- `GET http://localhost:3000/` — *liveness* (responde sempre 200 se o processo
  está de pé).
- `GET http://localhost:3000/health/ready` — *readiness* (checa o banco;
  responde 503 se o PostgreSQL estiver indisponível).

---

## 7. Rodar o app móvel (Expo)

O app lê a URL da API da variável pública `EXPO_PUBLIC_API_URL`; sem ela, usa o
padrão de desenvolvimento `http://localhost:3000`.

```bash
# Inicia o Metro/Expo (mostra o QR code para o Expo Go)
npm run start --workspace=@checkout-pro/mobile

# Atalhos por plataforma
npm run android --workspace=@checkout-pro/mobile
npm run ios --workspace=@checkout-pro/mobile
npm run web --workspace=@checkout-pro/mobile
```

> Ao rodar em um dispositivo físico, `localhost` aponta para o próprio celular.
> Defina `EXPO_PUBLIC_API_URL` para o IP da sua máquina na rede local (ex.:
> `EXPO_PUBLIC_API_URL=http://192.168.0.10:3000`).

---

## 8. Comandos de verificação

Antes de abrir um Pull Request, rode as mesmas verificações do CI:

```bash
# Build + testes do backend e type-check + lint + testes do app
npm run verify

# Somente backend
npm run verify:backend

# Somente app
npm run verify:mobile

# Guardião da documentação (regenera a referência e compara com o commit)
npm run docs:check
```

> **Atenção:** não rode `npm run docs:gen` "no braço" para editar arquivos
> gerados — a documentação de referência é gerada automaticamente. O
> `docs:check` já regenera e valida se está em dia.

---

## 9. Problemas comuns

| Sintoma | Causa provável | Ação |
|---|---|---|
| A API não inicia e reclama de `Configuração de ambiente inválida` | Variável obrigatória ausente/mal formatada (ex.: `HORARIO_FIM_DO_DIA` fora de `HH:mm`) | Revise o `backend/.env` conforme [`variaveis-de-ambiente.md`](variaveis-de-ambiente.md). |
| `prisma migrate` falha ao conectar | `DATABASE_URL` errada ou PostgreSQL fora do ar | Confirme o banco rodando e a URL de conexão. |
| App não conecta na API pelo celular | `EXPO_PUBLIC_API_URL` apontando para `localhost` | Use o IP da máquina na rede local. |
| `npm install` reclama de workspace | Rodou dentro de `backend/`/`mobile/` | Rode sempre na raiz do repositório. |
