> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/metas/`

# Área: `metas`

## 1. Propósito
Centro de Controle ▸ **Metas**: definir as metas **mensais** de cada indicador
(Vendas, Recargas de Celular, Cancelamento de Itens, Cancelamento de Cupom e
Devoluções) para o mês escolhido; inclui também a configuração das **Sacolas
APAE** (preço e meta geral).

## 2. Quem usa (perfis)
- **Gestor** (`OPERADORES_CRUD`): define/edita as metas mensais dos indicadores.
- A seção **Sacolas APAE** só aparece para quem tem `LOTE_APAE_GERENCIAR`.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `MetasScreen.tsx` | Seletor de mês + cards de meta por indicador + Sacolas APAE | 378 |

## 4. Fluxo do usuário
1. **Escolher o mês:** seletor no topo (◀/▶) que desloca o período mensal
   (`AAAA-MM`); o padrão é o mês atual (dia-calendário de Brasília, UTC−3).
2. **Carregar:** a tela busca `metasService.listar(anoMes)`; estados
   **carregando / erro**.
3. **Editar meta:** cada card mostra o valor atual (R$ ou %) e um botão "Editar
   meta"; abre o campo, valida (número ≥ 0) e salva via `definir`, recarregando
   a lista e notificando.
4. **Sacolas APAE** (só `LOTE_APAE_GERENCIAR`): edita preço da sacola e meta
   mensal (valores gerais, não variam por mês) e pode **limpar o histórico** de
   lotes (confirmação obrigatória; ação irreversível).

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Listar metas do mês | `metasService.listar(anoMes)` | `GET /metas?anoMes=AAAA-MM` |
| Definir/atualizar meta | `metasService.definir(tipo, anoMes, meta)` | `POST /metas` |
| Config das Sacolas APAE | `loteApaeService.config()` | `GET /lote-apae/config` |
| Salvar config APAE | `loteApaeService.definirConfig({ precoSacola, metaMensal })` | `PUT /lote-apae/config` |
| Limpar histórico APAE | `loteApaeService.limparHistorico()` | `DELETE /lote-apae/historico` |

Módulo(s) do backend relacionado(s): [`metas`](../03-atlas-backend/metas.md) e
[`lote-apae`](../03-atlas-backend/lote-apae.md).

## 6. Estado local e regras de UI
- Estado local: `anoMes` (período), `editTipo` + `valor` (edição de uma meta),
  `salvando`; para APAE: `precoApae`, `metaApae`, `salvandoApae`, `limpandoApae`.
- Ao trocar de mês, fecha qualquer edição aberta (`editTipo = null`).
- **Unidade por indicador:** `REAIS` (R$) ou `PERCENTUAL` (%); o rótulo do campo,
  a formatação do valor e o texto de ajuda variam conforme a unidade.
- No campo, o valor 0 é exibido vazio para facilitar a digitação; a entrada usa
  máscara de milhar e é convertida com `parseNumeroBR`.
- A card mostra "valor padrão (ainda não definida)" quando `definida` é falso.

## 7. Lógica pura / utilidades
- `mesAtual()`: mês corrente `AAAA-MM` no fuso de Brasília (UTC−3).
- `deslocarMes(anoMes, delta)`: desloca o período em N meses.
- `rotuloMes(anoMes)`: rótulo por extenso (ex.: "Junho de 2026").
- `formatarValor(item)` e `ajudaUnidade(item)`: formatação/ajuda conforme a
  unidade (R$ ou %); `ICONES` por tipo de meta.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (duas cargas: metas e config APAE) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `CampoTexto`, `Botao`, `Carregando`, `MensagemErro`,
  `ApiError`, `confirmar`/`notificar` e utilidades de formato
  (`formatarMoeda`, `formatarPercentual`, `mascaraMilhar`, `parseNumeroBR`) —
  ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (não há arquivo de teste nesta área).

## 10. Riscos, dívidas e pendências
- 🔧 Sem testes automatizados; a lógica de datas (`mesAtual`/`deslocarMes`/
  `rotuloMes`) e a validação de valores são boas candidatas a teste unitário.
- ⚠️ A meta de Vendas passou a ser definida aqui (antes era no Painel de
  Vendas); atenção a documentação/telas antigas que ainda mencionem o local
  anterior.
