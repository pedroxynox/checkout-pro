<!-- MODELO (template) de documento de módulo do backend.
     Copie este arquivo para `docs/03-atlas-backend/<modulo>.md` e preencha.
     Não inclua este modelo no índice. Mantenha SEMPRE estas seções, na ordem. -->

> **Estado:** 🟡 Rascunho · **Responsável:** — · **Última verificação:** AAAA-MM-DD · **Cobre:** `backend/src/<modulo>/`

# Módulo: `<nome-do-modulo>`

## 1. Propósito
Uma frase, em linguagem de negócio: para que serve este módulo.

## 2. Responsabilidades e limites
- **Faz:** ...
- **Não faz** (fica em outro módulo): ...

## 3. Arquivos do módulo
| Arquivo | Papel | Linhas (aprox.) |
|---|---|---|
| `x.controller.ts` | Expõe as rotas HTTP | — |
| `x.service.ts` | Regras de aplicação / acesso a dados | — |
| `x.domain.ts` | Regras puras (sem Nest/Prisma) | — |
| `x.module.ts` | Ligações (DI) do módulo | — |
| `dto/*.ts` | Validação de entrada | — |

## 4. Endpoints (rotas HTTP)
> A lista canônica e sempre atualizada está na [API HTTP](../05-referencia-dados/api-http.md#<modulo>). Aqui explicamos o que cada rota faz.

| Método + Rota | Permissão | O que faz |
|---|---|---|
| `GET /<modulo>` | `<FUNCIONALIDADE>` | ... |

## 5. Serviços e funções
Para cada função pública relevante:

### `nomeDaFuncao(args)`
- **Recebe:** ...
- **Devolve:** ...
- **Efeitos** (o que lê/escreve, eventos, notificações): ...
- **Regras aplicadas:** ...
- **Erros possíveis:** ...

## 6. Lógica de domínio (funções puras)
Funções sem dependência de banco/framework e as invariantes que garantem.
- `funcaoPura(...)` → o que calcula e qual regra representa.

## 7. Estados e enums
Valores possíveis e transições (quando houver máquina de estados).
- `EnumX`: `A`, `B`, `C`. Transições: `A → B` quando ...

## 8. Dados que o módulo toca
Tabelas do Prisma lidas/escritas (ver [Dicionário](../05-referencia-dados/dicionario-de-dados.md)).
- Lê: `TabelaX`, `TabelaY`
- Escreve: `TabelaZ`

## 9. Dependências
- **Depende de:** `<outros módulos/serviços>`
- **É usado por:** `<quem consome este módulo>`

## 10. Regras de negócio-chave
Lista objetiva das regras que este módulo garante (com o "porquê").

## 11. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `x.service.spec.ts` | ... | — |

> Contagem sempre atualizada no [Catálogo de testes](../06-qualidade/catalogo-de-testes.md).

## 12. Riscos, dívidas e pendências
- ⚠️ ...
- 🔧 (dívida técnica) ...
- ⛔ (risco) ...
