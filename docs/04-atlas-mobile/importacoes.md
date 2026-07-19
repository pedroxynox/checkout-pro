> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/importacoes/`

# Área: `importacoes`

## 1. Propósito
Carga dos **arquivos .txt do dia** deixados no computador da loja: as 5
arrecadações (Troco Solidário, Recargas, Cancelamento de Itens, Cancelamento de
Cupom e Devoluções) e as Vendas por hora, com progresso da sequência e marca
persistente de "carregado".

## 2. Quem usa (perfis)
- **Usuário de carga** (`IMPORTACOES`), tipicamente o perfil **IMPORTADOR**
  deixado no PC da loja; também acessível ao gestor via Centro de Controle.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `ImportacoesScreen.tsx` | Carga dos arquivos do dia (sequência 1..6) | 398 |
| `ImportacoesScreen.test.tsx` | Teste de componente da tela de carga | 43 |

## 4. Fluxo do usuário
1. **Seleção do dia:** o `SeletorData` define o dia de referência (mínimo é a
   data inicial do sistema; padrão é hoje).
2. **Status real:** a tela consulta em paralelo o status das arrecadações e das
   vendas no dia; o progresso mostra "X de N arquivos carregados" e destaca o
   **próximo** pendente da sequência.
3. **Carregar:** para cada item, o usuário escolhe o arquivo (`expo-document-picker`)
   e envia; ao concluir, o item fica marcado como "Carregado" (persistente).
4. **Sem movimento:** para arrecadações (não para vendas), é possível marcar o
   indicador como "Sem movimento" no dia.
5. **Fechamento:** quando o último arquivo é resolvido, o backend sinaliza
   `fechamentoConcluido` e a tela exibe "Fechamento realizado com sucesso!" e
   notifica que os gestores foram avisados.
A tela trata os estados **carregando / erro** e mantém avisos de sucesso/erro
por envio.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Status das arrecadações | `arrecadacaoService.status(data)` | `GET /arrecadacao/status` |
| Status das vendas | `vendasService.status(data)` | `GET /vendas/status` |
| Enviar arrecadação | `arrecadacaoService.upload(tipo, ref, data)` | `POST /arrecadacao/upload` |
| Marcar sem movimento | `arrecadacaoService.marcarSemMovimento(tipo, data)` | `POST /arrecadacao/sem-movimento` |
| Enviar vendas | `vendasService.upload(ref, data)` | `POST /vendas/upload` |

Módulos do backend relacionados: [`arrecadacao`](../03-atlas-backend/arrecadacao.md)
e [`vendas`](../03-atlas-backend/vendas.md).

## 6. Estado local e regras de UI
- A tela guarda o dia selecionado, o item que está enviando (`enviando`) e o
  último aviso (ok/erro).
- **Sequência:** os itens (`ITENS`) são as 5 arrecadações (de `ARRECADACAO`) +
  "Vendas por hora"; `resolvidos` conta os que não estão `PENDENTE` e
  `proximoId` é o primeiro pendente (fica destacado com o selo "Próximo").
- **Selo por status:** `ENVIADO` → "Carregado" (verde); `SEM_MOVIMENTO` →
  "Sem movimento" (cinza); demais → "Pendente" (amarelo).
- **Vendas** não têm opção "Sem movimento"; e o botão vira "Recarregar" quando
  o item já está `ENVIADO`.
- Após cada envio, o status real é recarregado para manter a marca persistente.

## 7. Lógica pura / utilidades
- `escolherArquivo()`: abre o seletor de documentos e retorna o arquivo (ou null).
- `statusDe(item)`: resolve o status atual de cada item a partir do servidor.
- `seloDe(status)`: escolhe o selo visual conforme o status.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (status do dia) e `useConfigSistema` (data inicial) — ver
  [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `Botao`, `Carregando`, `MensagemErro`, `Selo`,
  `SeletorData`, `ApiError`, `notificar`, `formatarMoeda`/`hojeISO`,
  rótulos `ARRECADACAO` — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `ImportacoesScreen.test.tsx` | Lista dos itens carregáveis (5 arrecadações + vendas) e botões de carregar | 2 |

## 10. Riscos, dívidas e pendências
- ⚠️ A carga depende do formato dos arquivos .txt gerados na loja; arquivos fora
  do padrão são rejeitados pelo backend e exibidos como erro no aviso.
- 🔧 O tipo de MIME aceito no seletor é permissivo (`*/*`); a validação real do
  conteúdo fica no backend.
