# ADR 0017 — Meta de vendas derivada das estimativas diárias

- **Status:** Aceito
- **Data:** 2026-09-15
- **Contexto:** A meta mensal de vendas era um número **digitado** pelo gestor, e
  havia **três fontes** para o mesmo dado, competindo entre si:
  1. `MetaMensal(tipo='VENDAS', anoMes)` — o valor digitado em Centro de Controle
     ▸ Metas (fonte vigente);
  2. `ConfigVendas.metaMensal` — a meta única e antiga do Painel de Vendas, ainda
     consultada como _fallback_ quando maior que zero;
  3. `EstimativaVendaDia` — as **estimativas diárias** cadastradas na Central de
     Vendas, cuja soma do mês já era calculada e exibida, mas **não alimentava a
     meta**.

  O resultado era uma incoerência visível para o gestor: ele preenchia as
  estimativas dia a dia, via o total do mês na Central de Vendas, e o Painel de
  Vendas comparava o faturamento contra **outro** número. Além disso, o
  assistente (Cluby) lia `ConfigVendas` direto, sem passar pelo `MetasService`, e
  portanto relatava meta `0` desde que a meta migrou para `MetaMensal`. O atlas
  de Metas já registrava a consolidação numa fonte única como dívida pendente.

- **Decisão:** a meta mensal de vendas passa a ser **derivada**: é a **soma das
  estimativas diárias** do mês, e não existe mais meta de vendas digitada.
  1. **Conceito de "meta derivada" no domínio.** `TIPOS_META_DERIVADA` e
     `ehMetaDerivada(tipo)` marcam os tipos calculados a partir de outro dado do
     sistema. Hoje só `VENDAS`; a estrutura permite outros sem novo desenho.
  2. **`MetasService.resolver('VENDAS', anoMes)` soma as estimativas do mês.**
     Como todo consumidor da meta de vendas (Painel de Vendas, Resumo do Dia,
     aviso de "meta em risco", assistente) já passava por esse método, o novo
     valor se propaga por um único ponto.
  3. **Leitura direta da tabela, de propósito.** `MetasService` consulta
     `EstimativaVendaDia` pelo Prisma em vez de injetar `VendasService`, porque
     `VendasService` **já depende** de `MetasService` — injetar de volta criaria
     dependência circular.
  4. **A matemática vive no domínio puro.** `metaDeEstimativas(valores)` e
     `intervaloDoMes(anoMes)` são funções puras e testadas, usadas **tanto** pelo
     `MetasService` (meta do mês) **quanto** pelo `VendasService`
     (`listarEstimativas.totalMes`), para que Central de Vendas e Painel de Vendas
     nunca mostrem números diferentes.
  5. **Edição manual recusada, não ignorada.** `POST /metas` com `tipo=VENDAS`
     responde **409** (`MetaDerivadaNaoEditavelError`) apontando para a Central de
     Vendas. Falhar explicitamente evita a pior versão do bug: o gestor digita um
     valor, recebe "salvo" e o sistema segue usando outro número.
  6. **Fonte legada desativada.** `ConfigVendas.metaMensal` deixa de ser lida e
     escrita: caem `GET /vendas/config`, `PUT /vendas/config`, `obterConfig`,
     `definirConfig`, o `ConfigVendasDto` e o _seed_ da tabela. O assistente passa
     a usar `MetasService`.
  7. **Mês sem estimativas resolve `0`**, que o sistema já interpreta como "meta
     ainda não definida" (o painel mostra faturamento e projeção, sem comparação).

- **Consequências:**
  - ✅ **Uma fonte de verdade.** O total que o gestor vê na Central de Vendas é,
    literalmente, a meta do mês — não há dois números para conciliar.
  - ✅ **Menos trabalho de gestão:** preencher as estimativas diárias passa a ser
    o único ato necessário; a meta do mês sai de graça.
  - ✅ **Granularidade maior de graça:** a estimativa do dia já funcionava como
    "meta do dia" no painel; agora dia e mês vêm do mesmo cadastro e são
    coerentes por construção.
  - ✅ O assistente volta a relatar a meta correta (era um bug silencioso).
  - ⚠️ **A meta agora muda ao editar estimativas.** Mexer num dia altera a meta do
    mês e pode disparar/silenciar o aviso de "meta do mês em risco". É o
    comportamento desejado, mas é uma mudança de expectativa para quem estava
    acostumado a uma meta fixa.
  - ⚠️ **Registros antigos de `MetaMensal(tipo='VENDAS')` ficam inertes.** Não são
    apagados (não se descarta dado do cliente numa mudança de regra), mas deixam
    de ser lidos. Uma limpeza pode ser feita numa migração dedicada.
  - ⚠️ **A meta ficou legível por um público mais amplo do que quem a define:**
    `GET /vendas/estimativas` exige `PAINEL_VENDAS_VISUALIZAR`, enquanto `/metas`
    exige `OPERADORES_CRUD`. A meta de vendas já era visível no painel a esse
    mesmo público, então não há exposição nova — mas o desalinhamento entre as
    duas permissões continua em aberto.
  - ⚠️ **Divergência de fuso nas bordas do mês:** o backend calcula o período em
    **UTC** (`anoMesDe`), enquanto a Central de Vendas monta o mês em **Brasília
    (UTC−3)**. Nas primeiras/últimas horas do mês, "mês atual" pode diferir. É
    pré-existente e não foi alterado aqui.
  - 🔜 A tabela `config_vendas` fica **obsoleta** (marcada no schema) e pode ser
    removida numa migração dedicada.
  - 🔧 O módulo `metas` ganhou os primeiros testes próprios
    (`metas.domain.spec.ts` e `metas.service.spec.ts`), cobrindo a nova regra e
    protegendo as quatro metas digitadas, que **seguem inalteradas**.

- **Alternativas consideradas:**
  - **Manter a meta digitada e apenas sugerir a soma das estimativas.**
    Rejeitada: conserva as duas verdades e o trabalho duplicado, que é
    exatamente o problema relatado.
  - **Estimativas como padrão, com sobreposição manual opcional.** Rejeitada por
    decisão de produto: reintroduziria a ambiguidade "qual dos dois vale?" e a
    pergunta de precedência que a mudança quer eliminar.
  - **Somar as estimativas no `VendasService` e não no `MetasService`.**
    Rejeitada: deixaria o assistente e qualquer consumidor futuro fora da regra,
    além de manter `MetasService` devolvendo um valor diferente para `VENDAS`.
