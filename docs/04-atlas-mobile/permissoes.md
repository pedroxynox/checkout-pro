> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/permissoes/`

# Área: `permissoes`

## 1. Propósito
**Central de Permissões** — o Administrador ajusta o que cada **login** pode
acessar (desvios sobre o padrão do perfil), edita os **padrões por perfil**
(Fiscal/Supervisor/Gerente) e consulta o **histórico** (auditoria) das mudanças.

## 2. Quem usa (perfis)
- **Administrador** (funcionalidade `PERMISSOES_GERENCIAR`) — uso exclusivo.
- O próprio Administrador tem acesso total e não é ajustável na lista.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `PermissoesScreen.tsx` | Lista de logins (com busca) e atalhos | 179 |
| `PermissoesUsuarioScreen.tsx` | Ajuste de permissões por login | 291 |
| `PermissoesPerfisScreen.tsx` | Lista dos perfis ajustáveis | 108 |
| `PermissoesPerfilScreen.tsx` | Editor do padrão de um perfil | 272 |
| `PermissoesHistoricoScreen.tsx` | Histórico/auditoria de mudanças | 123 |
| `rotulos.ts` | Rótulos amigáveis e agrupamento por área | 173 |

## 4. Fluxo do usuário
1. **Lista de logins** (`PermissoesScreen`): busca por nome/matrícula/perfil e
   atalhos para "Padrões por perfil" e "Histórico"; tocar num login (não‑admin)
   abre o ajuste.
2. **Por login** (`PermissoesUsuarioScreen`): interruptores por funcionalidade,
   agrupados por área; ligar/desligar cria um **desvio** sobre o padrão do
   perfil. Salvar exige nova entrada da pessoa; há "Restaurar padrão do perfil".
3. **Padrões por perfil** (`PermissoesPerfisScreen` → `PermissoesPerfilScreen`):
   edita o padrão do perfil inteiro (afeta **todos** os usuários dele) com
   confirmação; permite restaurar o padrão original de código.
4. **Histórico** (`PermissoesHistoricoScreen`): lista as mudanças recentes (por
   login e por perfil) com autor, alvo, ação e data.
Estados de carregando/erro/vazio em todas as telas.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Listar logins | `usuariosService.listar()` | `GET /usuarios` |
| Permissões do login | `permissoesService.doUsuario(id)` | `GET /permissoes/usuario/:id` |
| Definir por login | `permissoesService.definir(id, permissoes)` | `PUT /permissoes/usuario/:id` |
| Restaurar login | `permissoesService.restaurar(id)` | `POST /permissoes/usuario/:id/restaurar` |
| Resumo dos perfis | `permissoesService.perfis()` | `GET /permissoes/perfis` |
| Padrão do perfil | `permissoesService.doPerfil(perfil)` | `GET /permissoes/perfil/:perfil` |
| Definir padrão | `permissoesService.definirPerfil(perfil, permissoes)` | `PUT /permissoes/perfil/:perfil` |
| Restaurar perfil | `permissoesService.restaurarPerfil(perfil)` | `POST /permissoes/perfil/:perfil/restaurar` |
| Histórico | `permissoesService.historico(150)` | `GET /permissoes/historico` |

Módulos do backend relacionados:
[`permissoes`](../03-atlas-backend/permissoes.md) e
[`usuarios`](../03-atlas-backend/usuarios.md).

## 6. Estado local e regras de UI
- Editores por login e por perfil guardam o conjunto de funcionalidades
  **ligadas** em memória e comparam com o estado carregado para saber se houve
  alteração (habilita/desabilita "Salvar").
- Itens são agrupados por área (`ORDEM_AREAS`) e marcados com selo
  "personalizada"/"alterada" quando divergem do padrão (perfil) ou do código.
- O Administrador não é editável na lista (mostra selo "Acesso total").
- Avisos deixam claro que salvar **desconecta** os afetados (precisam entrar de
  novo) e que ajustes por login prevalecem sobre o padrão do perfil.

## 7. Lógica pura / utilidades
- `rotuloDe(funcionalidade)`: rótulo/descrição/área para exibição (fallback: a
  própria chave); `ORDEM_AREAS`: ordem das áreas no painel.
- `normalizar` (busca sem acento) e `descreverAcao` (texto do histórico).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `Aviso`, `Botao`, `CampoTexto`, `Selo`, `Switch`,
  `EstadoVazio`, `Carregando`, `MensagemErro`, `confirmar`, `notificar`,
  `ApiError`, `formatarDataHora` — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (nenhum arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- ⚠️ Salvar padrão de perfil afeta **todos** os usuários e força novo login;
  ação sensível, protegida por confirmação, mas sem "desfazer".
- 🔧 `PermissoesUsuarioScreen` e `PermissoesPerfilScreen` compartilham muita
  lógica (agrupamento, diff, salvar/restaurar); candidatas a extrair um hook
  comum.
- 📝 `rotulos.ts` precisa acompanhar o catálogo de funcionalidades do backend;
  funcionalidades sem rótulo caem em "Outras".
