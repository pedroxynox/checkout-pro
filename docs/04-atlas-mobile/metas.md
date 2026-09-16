> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-09-15 · **Cobre:** `mobile/src/screens/metas/`

# Área: `metas`

## 1. Propósito
Centro de Controle ▸ **Metas**: acompanhar as metas **mensais** de cada indicador
(Vendas, Recargas de Celular, Cancelamento de Itens, Cancelamento de Cupom e
Devoluções) no mês escolhido, e **definir** as quatro que são digitadas.

A meta de **Vendas não é digitada aqui**: ela é a soma das estimativas diárias
cadastradas na Central de Vendas e aparece como somente leitura, com atalho para
essa tela. Ver
[ADR 0017](../02-arquitetura/decisoes/0017-meta-de-vendas-derivada-das-estimativas.md).

## 2. Quem usa (perfis)
- **Gestor** (`OPERADORES_CRUD`): define/edita as metas mensais digitadas e
  consulta a de Vendas.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel |
|---|---|
| `MetasScreen.tsx` | Seletor de mês + cards de meta por indicador |

## 4. Fluxo do usuário
1. **Escolher o mês:** seletor no topo (◀/▶) que desloca o período mensal
   (`AAAA-MM`); o padrão é o mês atual (dia-calendário de Brasília, UTC−3).
2. **Carregar:** a tela busca `metasService.listar(anoMes)`; estados
   **carregando / erro**.
3. **Editar meta digitada:** os cards das quatro metas digitadas mostram o valor
   atual (R$ ou %) e um botão "Editar meta"; abre o campo, valida (número ≥ 0) e
   salva via `definir`, recarregando a lista e notificando.
4. **Consultar a meta de Vendas:** o card mostra o valor calculado, a frase de
   origem e um botão **"Abrir Central de Vendas"**, que navega para a tela onde
   as estimativas diárias são cadastradas. Não há botão de editar.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Listar metas do mês | `metasService.listar(anoMes)` | `GET /metas?anoMes=AAAA-MM` |
| Definir/atualizar meta digitada | `metasService.definir(tipo, anoMes, meta)` | `POST /metas` |

Módulo(s) do backend relacionado(s): [`metas`](../03-atlas-backend/metas.md) e,
para a origem da meta de Vendas, [`vendas`](../03-atlas-backend/vendas.md).

> `POST /metas` com `tipo=VENDAS` responde **409**. A tela não permite chegar
> nesse caso (o card é somente leitura), mas o backend recusa de qualquer forma.

## 6. Estado local e regras de UI
- Estado local: `anoMes` (período), `editTipo` + `valor` (edição de uma meta),
  `salvando`.
- Ao trocar de mês, fecha qualquer edição aberta (`editTipo = null`).
- **Meta derivada:** quando `derivada` é verdadeiro (só Vendas), o card não
  oferece edição — exibe o texto de `origem` e o atalho para a Central de Vendas.
- **Unidade por indicador:** `REAIS` (R$), `PERCENTUAL` (%) ou
  **`REAIS_POR_UNIDADE`** (R$ por sacola); o rótulo do campo, a formatação do
  valor e o texto de ajuda variam conforme a unidade. As três condições ficam em
  helpers próprios (`formatarValor`, `ajudaUnidade`, `rotuloCampo`) porque antes
  eram ternários que **caíam no ramo de `PERCENTUAL`** para qualquer unidade
  desconhecida — o que faria a meta de Sacolas aparecer como "28,00%".
- **Sacolas** (`REAIS_POR_UNIDADE`) é exibida como "R$ 28,00 por sacola": o "por
  sacola" é parte do número, sem ele o valor não se entende. A ajuda explica que
  é um **piso** — acima dele significa usar menos sacolas para vender o mesmo.
- No campo, o valor 0 é exibido vazio para facilitar a digitação; a entrada usa
  máscara de milhar e é convertida com `parseNumeroBR`.
- Quando `definida` é falso, a card explica o porquê conforme o regime: nas
  digitadas, "valor padrão (ainda não definida)"; em Vendas, "sem estimativas
  cadastradas neste mês".

## 7. Lógica pura / utilidades
- `mesAtual()`, `deslocarMes(anoMes, delta)` e `rotuloMes(anoMes)` vêm de
  `../utils/periodoMensal` — fonte única do período mensal, partilhada com o
  histórico de Indicadores. Ver [Hooks e utilidades](hooks-e-utilidades.md).
- `formatarValor(item)` e `ajudaUnidade(item)`: formatação/ajuda conforme a
  unidade (R$ ou %); `ICONES` por tipo de meta.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carga das metas do mês) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `CampoTexto`, `Botao`, `Carregando`, `MensagemErro`,
  `ApiError`, `notificar` e utilidades de formato
  (`formatarMoeda`, `formatarPercentual`, `mascaraMilhar`, `parseNumeroBR`) —
  ver [Componentes compartilhados](componentes-compartilhados.md).
- Navegação tipada (`PropsTela<'Metas'>`) para o atalho à Central de Vendas —
  ver [Navegação](navegacao.md).

## 9. Testes
Não se aplica (não há arquivo de teste nesta área). A regra da meta derivada é
coberta no backend por `metas.domain.spec.ts` e `metas.service.spec.ts`.

## 10. Riscos, dívidas e pendências
- 🔧 Sem testes automatizados na tela; a lógica de datas saiu para
  `utils/periodoMensal.ts`, que **tem** testes. A validação de valores segue
  candidata a teste unitário.
- ⚠️ **Permissões desalinhadas:** esta tela exige `OPERADORES_CRUD`, mas quem
  altera de fato a meta de Vendas precisa de `PAINEL_VENDAS_EDITAR` (Central de
  Vendas). O atalho pode levar a uma tela sem permissão para certos perfis.
- ⚠️ A meta de Vendas já mudou de lugar duas vezes (Painel de Vendas → Metas →
  derivada das estimativas); atenção a telas/documentos antigos que mencionem os
  locais anteriores.
