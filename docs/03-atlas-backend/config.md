> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-20 · **Cobre:** `backend/src/config/`

# Módulo: `config`

## 1. Propósito
Validação e tipagem das **variáveis de ambiente** na inicialização da aplicação:
falha rápido (no boot) se algo essencial estiver ausente ou fora do formato.

## 2. Responsabilidades e limites
- **Faz:** define o esquema tipado das variáveis (`EnvironmentVariables`),
  aplica valores padrão, converte strings para os tipos corretos e valida —
  exigindo `JWT_SECRET` e `DATABASE_URL` em produção; expõe `validateEnv` para
  o `@nestjs/config`.
- **Não faz:** não lê variáveis em runtime nos serviços (isso é papel do
  `ConfigService`); não resolve o **valor** do segredo JWT (fica em
  [`common`](common.md) `config/jwt-secret.ts`); não configura CORS
  (helper em [`common`](common.md)).

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas |
|---|---|---|
| `env.validation.ts` | Esquema das variáveis + `validateEnv` (falha rápida) | 134 |

## 4. Endpoints (rotas HTTP)
**Não expõe rotas HTTP.** Fornece a função `validateEnv`, usada na opção
`validate` do `ConfigModule` (registrado no `AppModule`). Assim, um ambiente mal
configurado impede o start em vez de falhar silenciosamente depois.

## 5. Serviços e funções

### `validateEnv(config)`
- **Recebe:** o mapa cru de variáveis (`Record<string, unknown>`).
- **Devolve:** a instância validada e tipada (`EnvironmentVariables`).
- **Efeitos:** converte com `plainToInstance` e valida com `validateSync`;
  além das regras dos decorators, checa explicitamente que em
  `NODE_ENV=production` estão presentes `JWT_SECRET` **e** `DATABASE_URL`.
- **Erros:** lança `Error` com mensagem em PT quando a configuração é inválida.

## 6. Lógica de domínio (funções puras)
- A classe `EnvironmentVariables` concentra as regras de validação via
  `class-validator`/`class-transformer` (tipos, faixas, formato de
  `HORARIO_FIM_DO_DIA` = `HH:mm`). `validateEnv` é determinística.

## 7. Estados e enums
- `Ambiente`: `development` · `test` · `production` (`NODE_ENV`).
- Variáveis e padrões:
  - `PORT` (1–65535, padrão `3000`; convertida de string);
  - `DATABASE_URL` (obrigatória em produção);
  - `DATABASE_CONNECTION_LIMIT` (≥ 1, padrão `10`; teto do pool do Prisma
    aplicado em [`prisma`](prisma.md));
  - `HORARIO_FIM_DO_DIA` (`HH:mm`, padrão `22:50`);
  - `JWT_SECRET` (obrigatória em produção) · `JWT_EXPIRES_IN`;
  - `GEMINI_API_KEY` (opcional) · `GEMINI_MODEL` (padrão `gemini-2.5-flash`);
  - `CORS_ORIGINS` (lista separada por vírgula);
  - `RETENCAO_INATIVOS_MESES` (≥ 1, padrão `3`).

## 8. Dados que o módulo toca
- **Não toca banco.** Opera apenas sobre variáveis de ambiente.
- Detalhe em [Dicionário de dados](../05-referencia-dados/dicionario-de-dados.md).

## 9. Dependências
- **Depende de:** `class-validator`, `class-transformer`.
- **É usado por:** o `AppModule` (via `ConfigModule.forRoot({ validate })`); os
  valores validados alimentam [`common`](common.md) (segredo JWT, CORS),
  [`assistente`](assistente.md) (Gemini), [`alertas`](alertas.md)
  (`HORARIO_FIM_DO_DIA`), [`storage`](storage.md) e [`prisma`](prisma.md)
  (`DATABASE_URL` e `DATABASE_CONNECTION_LIMIT`).

## 10. Regras de negócio-chave
1. **Falha rápida no boot:** ambiente inválido impede o start.
2. **Obrigatórias em produção:** `JWT_SECRET` e `DATABASE_URL` (checagem
   explícita além dos decorators).
3. **Conversão explícita de tipos** (`@Type`) — provedores enviam tudo como
   string (ex.: `PORT`).
4. **Padrões seguros para dev/teste:** o ambiente local sobe sem configuração
   mínima, mas nunca com segredo fixo versionado.

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `env.validation.spec.ts` | Padrões em dev e obrigatoriedade de `JWT_SECRET`/`DATABASE_URL` em produção | 4 |

> Contagem geral sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- 🔧 **Regras obrigatórias em dois lugares:** os decorators e as checagens
  explícitas de produção em `validateEnv`; manter em sincronia ao adicionar
  novas variáveis obrigatórias.
- ⚠️ Novas variáveis usadas por serviços **precisam** ser adicionadas ao
  esquema, senão passam sem validação (e sem documentação viva).
