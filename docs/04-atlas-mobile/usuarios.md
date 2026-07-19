> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/usuarios/`

# Área: `usuarios`

## 1. Propósito
Tela **"Acesso"** — lista todas as pessoas com acesso ao app (login) e permite
**redefinir a senha** e **revogar o acesso** (excluir). O cadastro da pessoa e a
criação do login são feitos em **Colaboradores**.

## 2. Quem usa (perfis)
- **Gerente** (funcionalidade `USUARIOS_CRUD`) — uso restrito.
- Não é possível excluir a si mesmo (o próprio login aparece marcado como
  "você").
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `UsuariosScreen.tsx` | Lista de contas de acesso, redefinir senha e excluir | 195 |

## 4. Fluxo do usuário
1. Abre a tela e carrega a lista de pessoas com acesso.
2. Para **redefinir a senha**, toca no ícone de chave, digita a nova senha
   (mínimo 6 caracteres) e salva — o campo aparece inline no cartão.
3. Para **revogar o acesso**, toca no ícone de lixeira (indisponível para o
   próprio login) e confirma a exclusão.
Estados: carregando, erro (com "tentar novamente") e vazio ("Nenhuma pessoa
cadastrada").

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Listar | `usuariosService.listar()` | `GET /usuarios` |
| Redefinir senha | `usuariosService.redefinirSenha(id, senha)` | `PATCH /usuarios/:id/senha` |
| Excluir | `usuariosService.remover(id)` | `DELETE /usuarios/:id` |

- O **cadastro** (`POST /usuarios`) existe no serviço, mas é acionado no fluxo de
  Colaboradores, não aqui.

Módulo do backend relacionado: [`usuarios`](../03-atlas-backend/usuarios.md).

## 6. Estado local e regras de UI
- Guarda em memória qual login está com o campo de redefinição aberto
  (`redefinindoId`) e o texto da nova senha.
- Valida no cliente: nova senha com **mínimo de 6 caracteres**.
- O botão de excluir não aparece para o usuário logado (`ehEu`).
- A exclusão pede confirmação (diálogo) antes de chamar o backend.

## 7. Lógica pura / utilidades
- `ROTULO_PERFIL`: mapeia o perfil para o rótulo em pt-BR exibido no cartão.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `useAuth` (para identificar o próprio login), `Tela`, `Cartao`, `Botao`,
  `CampoTexto`, `EstadoVazio`, `Carregando`, `MensagemErro`, `confirmar`,
  `notificar`, `ApiError` — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (nenhum arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- ⚠️ A exclusão é **irreversível** e revoga o acesso; protegida por confirmação,
  mas sem "desfazer".
- 📝 A separação de responsabilidades (cadastro em Colaboradores, gestão de
  acesso aqui) pode confundir; a intro da tela explica, mas vale reforçar no
  onboarding. Para permissões finas por login, ver a área
  [`permissoes`](permissoes.md).
