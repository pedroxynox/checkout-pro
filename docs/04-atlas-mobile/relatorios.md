> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/relatorios/`

# Área: `relatorios`

## 1. Propósito
Gerar **relatórios em PDF** dos operadores (uma folha A4 por operador, com
score, indicadores, faltas, incidências e gráficos), escolhendo o período e
baixando de **todos** os operadores ativos de uma vez ou de **um** individualmente.

## 2. Quem usa (perfis)
- **Gestão**: a tela é acessada por Centro de Controle (área restrita ao gestor,
  `OPERADORES_CRUD`).
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `RelatoriosScreen.tsx` | Seleção de período e geração de PDF (todos/individual) | 225 |

## 4. Fluxo do usuário
1. **Carregamento:** a tela lista os operadores ativos (`funcao: 'OPERADOR'`,
   `ativo: true`).
2. **Período:** escolhe entre **Mês atual** (padrão, igual à tela de perfil) ou
   **Escolher período** (intervalo com dois seletores de data).
3. **Todos:** o botão "Baixar relatório de todos (N)" busca o perfil de cada
   operador no período, monta o HTML e abre a impressão (PDF).
4. **Individual:** cada linha tem um botão "PDF" que gera o relatório de um único
   operador.
Trata os estados **carregando / erro / vazio**; durante a geração, os botões
mostram "Gerando..." e ficam desabilitados.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Listar operadores ativos | `colaboradoresService.listar({ funcao: 'OPERADOR', ativo: true })` | `GET /colaboradores` |
| Perfil (por operador) | `colaboradoresService.perfil(id, periodo)` | `GET /colaboradores/:id/perfil` |

Módulo do backend relacionado: [`colaboradores`](../03-atlas-backend/colaboradores.md).

> A geração do PDF é feita **no cliente** (`expo-print`) a partir dos dados de
> perfil que a API já entrega; não há endpoint específico de relatório.

## 6. Estado local e regras de UI
- A tela guarda o modo de período (`MES` / `PERIODO`), as datas de início/fim e
  a chave do PDF em geração (`id` do operador ou `'TODOS'`; `null` = nada gerando).
- No modo `MES`, o período é o mês corrente calculado a partir de `hojeISO()`;
  no modo `PERIODO`, usa as datas escolhidas.
- Enquanto um PDF é gerado, todos os botões ficam **desabilitados** (`ocupado`).
- Se não houver operadores ativos, avisa e não tenta gerar.

## 7. Lógica pura / utilidades
- `mesAtual(hoje)`: calcula início/fim do mês corrente (de `utils/relatorioPerfil`).
- `rotuloPeriodo(inicio, fim)`: rótulo legível do período.
- `htmlRelatorio(perfis, opcoes)`: monta o HTML do relatório (uma página por operador).
- `imprimirRelatorio(html)`: dispara a impressão/geração de PDF (`utils/impressao`).
- `gerarPara(chave, lista, titulo)`: busca os perfis e imprime.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (lista de operadores) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `Botao`, `Carregando`, `MensagemErro`, `EstadoVazio`,
  `SeletorData`, `Segmentado`, `ApiError`, `notificar`, `hojeISO` — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (sem arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- ⚠️ Gerar "todos" faz uma chamada de perfil por operador (`Promise.all`); com
  muitos operadores, pode ficar pesado e depende da rede.
- 🔧 O envio automático por e-mail ainda não existe (previsto para etapa futura).
