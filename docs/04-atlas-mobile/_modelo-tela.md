<!-- MODELO (template) de documento de área de tela do app.
     Copie este arquivo para `docs/04-atlas-mobile/<area>.md` e preencha.
     Mantenha SEMPRE estas seções, na ordem. -->

> **Estado:** 🟡 Rascunho · **Responsável:** — · **Última verificação:** AAAA-MM-DD · **Cobre:** `mobile/src/screens/<area>/`

# Área: `<nome-da-area>`

## 1. Propósito
Uma frase: o que o usuário faz nesta tela/área.

## 2. Quem usa (perfis)
Quais perfis têm acesso e o que cada um pode fazer aqui.
Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel |
|---|---|
| `XScreen.tsx` | Tela principal | 
| `componentes/...` | Componentes locais |
| `X.util.ts` | Lógica auxiliar (pura, testável) |

## 4. Fluxo do usuário
Passo a passo do que acontece na tela (abrir → carregar → agir → salvar), com
os estados de carregando/erro/vazio.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Listar | `xService.listar()` | `GET /<modulo>` |

Módulo(s) do backend relacionado(s): [`<modulo>`](../03-atlas-backend/<modulo>.md).

## 6. Estado local e regras de UI
- O que a tela guarda em memória (formulários, filtros, seleção).
- Regras de exibição/validação feitas no app (ex.: campo só aparece se ...).

## 7. Lógica pura / utilidades
Funções auxiliares testáveis usadas pela tela e o que fazem.

## 8. Componentes e hooks compartilhados usados
Ver [Componentes compartilhados](componentes-compartilhados.md) e
[Hooks e utilidades](hooks-e-utilidades.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `XScreen.test.tsx` | ... | — |

## 10. Riscos, dívidas e pendências
- ⚠️ ...
