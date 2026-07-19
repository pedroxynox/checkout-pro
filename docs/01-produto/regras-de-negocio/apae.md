> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio do ciclo das sacolas APAE

# APAE

Este tema cobre o **ciclo das Sacolas APAE**: o lote de sacolas recebido, a venda
que reverte em arrecadação, o encerramento do lote e o painel de análises.

Detalhe técnico: [`lote-apae`](../../03-atlas-backend/lote-apae.md).

## 1. O ciclo do lote

Um **lote** de sacolas é aberto com uma quantidade inicial; conforme as sacolas
são vendidas, o **saldo** cai e a **quantidade vendida** cresce, revertendo em
arrecadação para a APAE.

**Regras-chave:**

1. **O saldo só diminui:** atualizar um lote com saldo **maior** que o anterior é
   recusado (o lote fica inalterado).
2. **Vendida = quantidade inicial − saldo atual;** o percentual vendido fica
   sempre entre 0% e 100%.
3. **Zerar o saldo encerra o lote automaticamente** (o lote vendido vai para o
   histórico).
4. **Reiniciar preserva o histórico:** encerrar o lote atual (congelando a
   quantidade inicial, a vendida e as datas) e abrir um novo.
5. Um lote está **`ABERTO`** ou **`ENCERRADO`**; o encerramento acontece ao zerar
   o saldo ou ao reiniciar o ciclo.

## 2. Configuração e valor arrecadado

6. A **configuração é um singleton** (`id = 'apae'`): **preço da sacola** e
   **meta mensal**, com padrões de **R$ 0,49** por sacola e meta de **500**.
7. O **valor arrecadado** é a quantidade vendida × preço da sacola.

## 3. Painel de análises

O painel consolida a saúde do ciclo:

- arrecadação do **mês** e do **mês anterior** (com variação %);
- **total histórico**;
- sacolas vendidas no mês;
- **velocidade** média de venda por dia (janela de 14 dias);
- **previsão de fim** do lote ativo;
- progresso da **meta** e **tendência** dos últimos 30 dias.

## 4. Notificações

8. O sistema **avisa** ao **atingir a meta** e quando o **lote está acabando**
   (cai a ≤ 10% do saldo).
9. As **notificações são best-effort:** nunca quebram a atualização de saldo.

## 5. Permissões

10. **Ver o lote, o painel, o histórico e atualizar o saldo** é liberado ao fiscal
    (`LOTE_APAE`). **Abrir um lote, reiniciar, limpar histórico e editar a
    configuração** exige `LOTE_APAE_GERENCIAR` (gerente/administrador). Ver
    [Perfis e permissões](../perfis-e-permissoes.md).

## 6. Observações

- A APAE é o ciclo de **doações/arrecadação social** da loja; é diferente da
  arrecadação por operador de [Arrecadação e indicadores](arrecadacao-e-indicadores.md).
- O contexto da APAE (arrecadação do mês, meta e total histórico) também alimenta
  o assistente **Cluby** — ver [`assistente`](../../03-atlas-backend/assistente.md).
