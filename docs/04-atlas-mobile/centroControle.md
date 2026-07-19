> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/centroControle/`

# Área: `centroControle`

## 1. Propósito
**Centro de Controle** — o hub de gestão do app: uma tela-índice com atalhos
para as ferramentas de administração (colaboradores, metas, rodízio de domingo,
central de vendas, check-outs, relatórios, acesso, permissões, importações,
tipos de contrato, insumos e o reinício de dados operacionais).

## 2. Quem usa (perfis)
- **Gestão** (`OPERADORES_CRUD`): vê o hub e a maioria dos cards.
- Cada card pode exigir uma funcionalidade extra (ex.: `ADMIN_DADOS`,
  `USUARIOS_CRUD`, `PERMISSOES_GERENCIAR`, `ESCALA_DOMINGO_CONFIG`,
  `IMPORTACOES`); os cards sem permissão não aparecem.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `CentroControleScreen.tsx` | Hub/índice de atalhos de gestão | 169 |
| `CentralVendasScreen.tsx` | Estimativas de venda por dia do mês | 237 |
| `ConfigEscalaDomingoScreen.tsx` | Configuração do rodízio de domingo (G1/G2/G3) | 268 |
| `TiposContratoScreen.tsx` | CRUD dos tipos de contrato de jornada | 569 |
| `InsumosDadosScreen.tsx` | Zerar estoque de insumos e limpar requisições | 214 |
| `ReiniciarDadosScreen.tsx` | Reinício operacional (apaga dados de movimento) | 199 |
| `CentroControleScreen.test.tsx` | Testes de visibilidade do card de reinício | 44 |
| `ReiniciarDadosScreen.test.tsx` | Testes da confirmação "ZERAR" | 58 |

## 4. Fluxo do usuário
1. **Hub:** `CentroControleScreen` monta os cards a partir de uma lista fixa
   (`ITENS`) e filtra por `podeAcessar(funcionalidade)`. Tocar em um card navega
   para a rota correspondente (algumas telas vivem em outras áreas, ex.: Metas,
   Relatórios, Importações, Check-Outs).
2. **Central de Vendas:** escolhe o mês, digita a estimativa por dia e salva; o
   topo mostra a estimativa do mês (soma ao vivo das diárias).
3. **Rodízio de domingo:** define o 1º domingo do ciclo e quem folga em cada um
   dos 3 domingos (G1/G2/G3); vê a prévia dos próximos domingos.
4. **Tipos de contrato:** cria/edita/ativa/desativa/remove contratos de jornada
   (carga por dia, intervalos, limites e riscos de TAC, tudo em minutos).
5. **Insumos (dados):** zera o estoque de um insumo, de todos, ou limpa o
   histórico de requisições — cada ação pede confirmação.
6. **Zerar dados operacionais:** exige digitar `ZERAR` e confirmar; ao concluir,
   mostra o resumo com a contagem apagada por entidade.
Cada tela de dados trata os estados **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Estimativas do mês | `vendasService.listarEstimativas(anoMes)` | `GET /vendas/estimativas` |
| Salvar estimativas | `vendasService.definirEstimativas(anoMes, dias)` | `PUT /vendas/estimativas` |
| Ler rodízio de domingo | `configSistemaService.obterEscalaDomingo()` | `GET /config/escala-domingo` |
| Salvar rodízio | `configSistemaService.definirEscalaDomingo(...)` | `PUT /config/escala-domingo` |
| Listar contratos | `tiposContratoService.listar(true)` | `GET /tipos-contrato` |
| Criar contrato | `tiposContratoService.criar(input)` | `POST /tipos-contrato` |
| Editar contrato | `tiposContratoService.atualizar(id, input)` | `PATCH /tipos-contrato/:id` |
| Ativar/desativar | `tiposContratoService.definirAtivo(id, ativo)` | `PATCH /tipos-contrato/:id/ativo` |
| Remover contrato | `tiposContratoService.remover(id)` | `DELETE /tipos-contrato/:id` |
| Insumos proativos | `insumosService.listarProativo()` | `GET /insumos/proativo` |
| Zerar 1 insumo | `insumosService.zerarEstoqueInsumo(id)` | `DELETE /insumos/:id/movimentos` |
| Zerar todos | `insumosService.zerarEstoque()` | `DELETE /insumos/movimentos` |
| Limpar requisições | `requisicoesService.limparTodas()` | `DELETE /requisicoes` |
| Reinício operacional | `adminService.zerarDados({confirmacao:'ZERAR'})` | `POST /admin/reset-operacional` |

Módulos do backend relacionados:
[`vendas`](../03-atlas-backend/vendas.md),
[`escala-domingo`](../03-atlas-backend/escala-domingo.md),
[`tipos-contrato`](../03-atlas-backend/tipos-contrato.md),
[`insumos`](../03-atlas-backend/insumos.md),
[`requisicoes`](../03-atlas-backend/requisicoes.md) e
[`reset-operacional`](../03-atlas-backend/reset-operacional.md).

## 6. Estado local e regras de UI
- O hub monta os cards de uma lista fixa e só exibe os que `podeAcessar` libera.
- **Central de Vendas:** guarda os valores digitados por data (mapa iso→texto),
  com máscara de milhar; a estimativa do mês é a soma ao vivo das diárias.
- **Rodízio de domingo:** valida que a data de referência é um domingo e que os
  3 grupos (G1/G2/G3) foram escolhidos sem repetição antes de salvar.
- **Tipos de contrato:** valida nome obrigatório, `intervalo mínimo < máximo` e
  a ordem `risco 1h30 ≤ risco 1h40 ≤ limite de extras`; o contrato **padrão**
  não pode ser desativado nem removido.
- **Reiniciar dados:** o botão só habilita quando o texto digitado é `ZERAR`
  (validação também exigida pelo backend); depois exibe o resumo por entidade.

## 7. Lógica pura / utilidades
- Central de Vendas: `mesAtual`, `deslocarMes`, `rotuloMes`, `diasDoMes`,
  `parseValor`.
- Rodízio: `gruposQueTrabalham`, `diaMes`, `isoMaisDiasDiaMes`.
- Tipos de contrato: `formVazio`, `formDe`, `inteiro`, `hhmm` (minutos → "7h").
- Reinício: `rotuloEntidade` (rótulos pt-BR das tabelas do resumo).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `useAuth` (`podeAcessar`), `Tela`, `Cartao`, `Botao`, `CampoTexto`, `Aviso`,
  `Selo`, `EstadoVazio`, `Carregando`, `MensagemErro`, `ApiError`, `notificar`,
  `confirmar` — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `CentroControleScreen.test.tsx` | Card de reinício só com `ADMIN_DADOS` | 2 |
| `ReiniciarDadosScreen.test.tsx` | Exige "ZERAR" e mostra o resumo | 2 |

## 10. Riscos, dívidas e pendências
- 🔧 `TiposContratoScreen.tsx` é grande (569 linhas), com formulário extenso;
  candidato a quebrar em componentes/seções menores.
- ⚠️ Várias ações são **irreversíveis** (zerar estoque, limpar requisições,
  reinício operacional). A confirmação por diálogo e a palavra `ZERAR` mitigam,
  mas a proteção real fica no backend.
- 📝 Os cards do hub apontam para rotas de outras áreas; manter a lista `ITENS`
  em sincronia com as rotas registradas em `AppNavigator`.
