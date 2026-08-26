> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-08-26 · **Cobre:** regras de negócio de arrecadação e indicadores

# Arrecadação e indicadores

Este tema cobre a importação e a inteligência dos **indicadores por operador** —
troco solidário, recargas de celular, cancelamentos e devoluções — além das
**metas** e dos **destaques do mês**.

Detalhe técnico: [`arrecadacao`](../../03-atlas-backend/arrecadacao.md),
[`metas`](../../03-atlas-backend/metas.md) e, para os percentuais sobre vendas,
[`vendas`](../../03-atlas-backend/vendas.md).

## 1. Os indicadores

O sistema acompanha cinco tipos de arrecadação/indicador por operador:

- **Troco solidário**
- **Recargas de celular**
- **Cancelamento de itens**
- **Cancelamento de cupom**
- **Devoluções**

Cada tipo tem uma **base** e um **sentido**:

- base **FIXA** (alvo em R$, "maior é melhor" — ex.: troco solidário, recargas);
- base **VENDAS** (avaliado por **% sobre as vendas**, "menor é melhor" — ex.:
  cancelamentos e devoluções).

## 2. Importação dos arquivos

**Regras-chave:**

1. **O upload substitui o dia inteiro** daquele tipo — reenviar corrige.
2. **"Sem movimento":** um tipo pode ser marcado como "sem movimento" no dia; um
   **movimento real desfaz** a marca automaticamente.
3. **Datas anteriores à Data Inicial do Sistema são rejeitadas** na importação e
   na marca de "sem movimento".
4. O status de cada tipo no dia é **`ENVIADO`**, **`SEM_MOVIMENTO`** ou
   **`PENDENTE`** (alimenta o [fechamento do dia](checklist-e-fechamento.md)).

## 3. Cadastrados × não reconhecidos

5. **Ranking, detalhe, destaques e anomalias consideram só colaboradores
   cadastrados** (casados por matrícula/login). Os lançamentos **sem cadastro**
   vão para uma linha/fila de **"não reconhecidos"**, para associar ou criar
   cadastro depois.

## 4. Metas

As metas dos indicadores são **mensais** (`AAAA-MM`), resolvidas com *fallback* em
cadeia (registro salvo do mês → meta legada de vendas, quando aplicável → padrão
de configuração), de modo que **nunca falta um valor**.

**Regras-chave:**

6. **Metas são por período mensal**; cada tipo tem um valor por mês.
7. **`TROCO_SOLIDÁRIO` não é gerido junto das metas mensais** — segue a meta
   global própria de arrecadação.
8. **Definir metas** é ação de gestão (`ADMIN_DADOS` na arrecadação;
   `OPERADORES_CRUD` no Centro de Controle ▸ Metas).

## 5. Inteligência dos indicadores

A partir dos dados, o sistema gera:

- **tendência** (série temporal, padrão 30 dias);
- **comparativo** (mês/semana atual vs. período anterior);
- **projeção** de fechamento do mês + meta diária derivada;
- **destaques do mês** (premiação);
- **anomalias** (ofensores);
- **painel "Precisa de atenção"** (metas em risco + operadores acima da média);
- **histórico mensal** (janela móvel, ver seção 6).

## 6. Histórico mensal e janela de retenção

Os indicadores **não são reiniciados** no dia 1º. O que acontece no virar do mês
é apenas a troca do **mês de referência**: os meses anteriores continuam
consultáveis pelo seletor de mês do painel e pelo cartão de **evolução mês a
mês** no detalhe de cada indicador.

14. **Cada mês é julgado pela meta que valia nele** (a `MetaMensal` do próprio
    período), nunca pela meta de hoje. Trocar a meta em setembro não reescreve o
    resultado de agosto.
15. **Foto do mês fechado.** No dia 1º o sistema congela uma foto de cada
    indicador do mês que acabou (total, itens, vendas da loja, percentual, meta e
    semáforo). A foto é o que o histórico lê: um mês fechado deixa de mudar de
    valor. O mês corrente segue calculado ao vivo (parcial).
16. **Janela móvel de 24 meses** (configurável em
    `RETENCAO_INDICADORES_MESES`). Depois de congelar, o sistema **apaga** o que
    ficou fora da janela: lançamentos, marcas de "sem movimento", vendas (dia e
    hora) e as fotos antigas. Entra um mês novo, sai o mais antigo. A limpeza é
    **irreversível** e só acontece se o congelamento tiver dado certo.
17. **Evolução com o sentido certo.** A variação de um mês para o outro é sempre
    apresentada junto da leitura de **melhora ou piora**: em cancelamentos e
    devoluções, **cair é melhorar**. Variação abaixo de 1 ponto percentual conta
    como estável (é ruído).
18. **Mês sem movimento não é mês em zero.** Um período sem nenhum lançamento nem
    venda é marcado como "sem dados" e **não serve de base de comparação** — do
    contrário produziria variações sem significado.

## 7. Destaques do mês — só operadores concorrem

**Regra-chave 9 (importante):** **só operadores concorrem aos destaques do mês.**
Fiscais, supervisores e gestores ficam de fora dos rankings de destaque (operam
caixa raramente).

Os destaques cobrem o top em troco, recargas, cancelamento de itens e o **"menos
cancelou"**:

10. O **"menos cancelou"** exige operador **ativo**, com contribuição no mês e
    **assiduidade perfeita** (sem faltas), e é medido em **% sobre as vendas** da
    loja.

## 8. Anomalias e painel de atenção

11. **Anomalias/ofensores** exigem **pelo menos 3 pessoas** na equipe e um valor
    **≥ 2× a média** da equipe em cancelamentos/devoluções.
12. Indicadores base **VENDAS** são avaliados por **%** (menor é melhor); base
    **FIXA** por valor/ritmo (maior é melhor).
13. O **resumo diário automático** (cron das 08:00) monta o panorama do dia
    anterior (semáforo por indicador, destaques e anomalias) e avisa quem tem
    `INDICADORES_VISUALIZAR`.

## 9. Observações

- Os **percentuais sobre vendas** usam o total diário de vendas, cuja fonte é o
  Painel de Vendas — ver [`vendas`](../../03-atlas-backend/vendas.md).
- **Visualizar** indicadores é liberado a todos os perfis operacionais
  (`INDICADORES_VISUALIZAR`); **importar** os arquivos exige `IMPORTACOES`
  (administrador/importador). Ver [Perfis e permissões](../perfis-e-permissoes.md).
