> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio de estoque, insumos e requisições

# Estoque, insumos e requisições

Este tema cobre o **almoxarifado da operação**: o saldo dos insumos, as retiradas
por **fardo**, os **pedidos recorrentes** inteligentes e o fluxo de
**requisições** entre a operação e a gestão.

Detalhe técnico: [`insumos`](../../03-atlas-backend/insumos.md) e
[`requisicoes`](../../03-atlas-backend/requisicoes.md).

## 1. Saldo por movimentos

**Regra-chave 1:** o **saldo é sempre a soma dos movimentos** de estoque (entradas
positivas, consumos/retiradas negativas) — é a fonte única, em tempo real.

2. **O estoque nunca fica negativo:** um consumo ou retirada maior que o saldo é
   recusado. Consumir exatamente o saldo (deixando 0) é permitido.
3. Categorias de insumo: **sacola**, **bobina**, **pano** e **outro**.
4. **Alerta de estoque baixo** ocorre quando o **saldo ≤ limite mínimo** do
   insumo.

## 2. Fardos e embalagens

5. **Retirada por fardo:** um fardo de sacolas é retirado pelo **código de
   barras**; um fardo desconhecido é recusado e **não altera o saldo**.
6. **Consumo em embalagens** (ex.: caixas, galões) é convertido para a unidade
   base pelo fator de embalagem do insumo.

## 3. Painel proativo

O painel proativo antecipa a reposição, por insumo:

- **nível** de estoque: `CRÍTICO` (saldo ≤ limite) · `ATENÇÃO` (saldo ≤ 2× limite)
  · `OK`;
- **previsão de ruptura** (dias até o saldo zerar, pela média de consumo por dia
  da semana);
- **sugestão de reposição** (cobrir N semanas, arredondada em embalagens).

7. **Os crons de alerta apenas avisam** (estoque crítico às 07:00, ruptura
   iminente às 12:00, relatório semanal na segunda) — **nunca criam estoque nem
   requisições**.

## 4. Pedidos recorrentes

Os **pedidos recorrentes** geram sugestões automáticas de compra (o card "Pedido
da semana"), ajustadas pelo saldo/consumo.

8. **A geração de sugestões é idempotente por lote** (não duplica no mesmo dia);
   os quinzenais só a cada intervalo configurado.
9. **Confirmar** uma sugestão **dá entrada no estoque** (origem
   `PEDIDO_RECORRENTE`); **ignorar** descarta sem dar entrada. Ambas as ações
   exigem `INSUMOS_GERENCIAR`.

## 5. Requisições (fiscal → gestor)

O fiscal solicita um insumo e o gerente/supervisor **aprova** ou **nega**:

10. **Quantidade em embalagens inteiras** (inteiro > 0); a conversão para a
    unidade base ocorre **só na aprovação** (quantidade × fator de embalagem).
11. **Aprovar gera entrada no estoque** (origem `REQUISICAO`), preservando quem
    requisitou e quem aprovou no histórico de movimentos.
12. **Uma requisição só é decidida uma vez:** aprovar/negar exigem status
    `PENDENTE`.
13. **Notifica nas duas pontas:** os gestores na criação e o solicitante na
    decisão.

## 6. Regra de ouro do estoque

14. **Nada entra no estoque sem aprovação do gestor.** As entradas vêm de uma
    **entrada manual**, de uma **requisição aprovada** ou de uma **sugestão
    confirmada** — nunca de um processo automático. Os alertas proativos apenas
    chamam a atenção.

## 7. Observações

- **Criar/listar requisições e ver/consumir insumos** é liberado ao fiscal
  (`INSUMOS`). **Aprovar, dar entrada, configurar pedidos e gerir** exige
  `INSUMOS_GERENCIAR`. **Zerar o estoque** é operação administrativa
  (`ADMIN_DADOS`). Ver [Perfis e permissões](../perfis-e-permissoes.md).
- O **consumo de insumos vs. vendas** alimenta a análise de utilização — a fonte
  de vendas é o Painel de Vendas ([`vendas`](../../03-atlas-backend/vendas.md)).
