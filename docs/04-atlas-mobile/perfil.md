> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/perfil/`

# Área: `perfil`

## 1. Propósito
Aba **"Perfil"** do usuário logado: mostra a identidade (nome, login, cargo) e
oferece a ação de **sair da conta**.

## 2. Quem usa (perfis)
- **Qualquer usuário autenticado** (Gerente, Administrador, Supervisor, Fiscal,
  Importador): é o próprio perfil de quem está logado.
- Não há ações administrativas aqui — apenas visualização e logout.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

> Observação: esta é a tela do **usuário logado**. O "Perfil Inteligente" de um
> colaborador (score, indicadores, insígnias) fica em
> [`colaboradores`](colaboradores.md) (`PerfilColaboradorScreen`).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `PerfilScreen.tsx` | Identidade do usuário logado + botão Sair | 158 |

## 4. Fluxo do usuário
1. **Abrir:** a tela lê `usuario` e `perfil` do `AuthContext` (sem chamada de
   rede própria).
2. **Cabeçalho:** avatar com a inicial do nome, nome completo e cargo.
3. **Cartão:** duas linhas — Login e Cargo.
4. **Sair:** o botão "Sair da conta" chama `sair()` do `AuthContext`.
Como os dados já estão no contexto, não há estados de carregando/erro/vazio
próprios da tela.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Identidade do usuário | `useAuth()` (`usuario`, `perfil`) | — (contexto local; sem chamada nesta tela) |
| Sair | `useAuth().sair()` | — (limpa a sessão; ver módulo de autenticação) |

Módulo(s) do backend relacionado(s): autenticação/sessão via `AuthContext`
(base em [`usuarios`](../03-atlas-backend/usuarios.md) /
[`acessos`](../03-atlas-backend/acessos.md)). A tela em si é somente
apresentação.

## 6. Estado local e regras de UI
- Não guarda estado próprio; deriva tudo do `AuthContext`.
- **Nome exibido:** usa `usuario.nome` quando presente; senão **deriva do login**
  (separa por `.`/`_`/`-`, capitaliza cada parte). Fallback final: "Usuário".
- **Inicial do avatar:** primeira letra do nome (ou "U") em maiúscula.
- **Rótulo do cargo:** mapeia o perfil (`GERENTE`→Gerente,
  `ADMINISTRADOR`→Administrador, `SUPERVISOR`→Supervisor, `IMPORTADOR`→Importador,
  demais→Fiscal).

## 7. Lógica pura / utilidades
- Toda a lógica é inline na tela: derivação do nome a partir do login,
  cálculo da inicial e mapeamento do rótulo de perfil. Não há arquivo `*.util.ts`.

## 8. Componentes e hooks compartilhados usados
- `useAuth` (contexto de autenticação) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- Ícone `LogOut` (`lucide-react-native`) e tema (`cores`, `raio`, `sombra`,
  `tipografia`) — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (não há arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- 🔧 Sem teste automatizado; um smoke test simples (render do nome/cargo e
  chamada de `sair`) cobriria a regressão.
- ⚠️ O nome derivado do login é heurístico; quando o backend não envia `nome`,
  a exibição pode não bater com o nome real da pessoa.
