> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** visão de negócio do Check-out PRO

# Resumo executivo

Documento para o **dono do negócio** e para a gestão. Explica, em linguagem
simples, o que o Check-out PRO faz, como ele ajuda a operação do supermercado e
em que ponto o projeto está hoje — sem jargão técnico.

> **Números do projeto** (tamanho, testes, telas, tabelas): não são repetidos
> aqui. A fonte única e sempre atualizada é
> [Estado e métricas](../08-gestao/estado-e-metricas.md).

---

## O que é o Check-out PRO

O Check-out PRO é um sistema para **gerir a frente de caixa do supermercado**.
Ele funciona no **navegador (web)** e no **celular Android**, e reúne num só
lugar tudo o que hoje costuma ficar espalhado em papéis, planilhas e conversas:
pessoas, escalas, ponto, metas, vendas, estoque de insumos, conferências de
abertura/fechamento e avisos importantes.

A ideia central é simples: **quem está na loja registra o dia a dia pelo
aparelho, e a gestão enxerga tudo em tempo real**, com números confiáveis e
alertas automáticos quando algo precisa de atenção.

---

## Como ele ajuda a operação

Pensando no dia da loja, o sistema atua em cinco frentes:

- **Pessoas e equipe.** Um cadastro único de colaboradores (operadores de caixa,
  fiscais, supervisores e gerência), com perfis de acesso que definem o que cada
  um pode ver e fazer. Controla admissão, contrato de experiência, escala por
  turno e o rodízio de domingos.

- **Ponto e jornada.** A equipe registra o ponto a partir do **comprovante
  impresso** pelo relógio da empresa (o celular lê a foto). O sistema calcula a
  jornada do dia, as horas extras e avisa a supervisão automaticamente quando há
  **risco de TAC** (excesso de horas que pode gerar acordo trabalhista), antes de
  o problema virar um custo.

- **Vendas, metas e indicadores.** Importação simples dos arquivos de vendas e
  arrecadação, com painéis de faturamento do dia, metas do mês e destaques da
  equipe (por exemplo, quem menos cancela vendas ou quem mais contribui com o
  **troco solidário**).

- **Estoque e rotinas.** Controle de insumos e requisições (o estoque nunca fica
  negativo), o lote de sacolas da **APAE** e os **checklists** de abertura e
  fechamento com foto, para garantir que a loja abriu e fechou como deveria.

- **Comunicação.** Avisos aparecem dentro do app, em tempo real, e também como
  notificação no celular. Existe ainda uma assistente com inteligência
  artificial (**Cluby**) que resume o dia.

O resultado prático é **menos retrabalho manual, mais controle e decisões
apoiadas em dados** — a gestão para de correr atrás de informação e passa a ser
avisada quando precisa agir.

---

## Estado atual, em alto nível

- O produto está **funcional e maduro**: as funcionalidades descritas acima já
  estão construídas e cobertas por testes automáticos.
- O foco atual é deixar **uma loja 100% operacional e estável** antes de pensar
  em atender várias lojas.
- As pendências mais importantes são de **infraestrutura e configuração**, não de
  falhas do produto — por exemplo: ativar as notificações no Android (Firebase),
  colocar o banco de dados num plano estável e definir o rumo de três áreas ainda
  ocultas (Alertas de Fila, Normativas e Indicador de Quebra).

O detalhamento de prioridades e pendências está em
[Roadmap e pendências](../08-gestao/roadmap-e-pendencias.md). Os números
consolidados do projeto estão em
[Estado e métricas](../08-gestao/estado-e-metricas.md).

---

## Para se aprofundar

| Você quer… | Vá para |
|---|---|
| Entender os termos usados (TAC, jornada, arrecadação…) | [Glossário](glossario.md) |
| Ver como as partes do sistema se encaixam | [Mapa do projeto](mapa-do-projeto.md) |
| Conhecer as prioridades e o que falta | [Roadmap e pendências](../08-gestao/roadmap-e-pendencias.md) |
| Ver os números do projeto | [Estado e métricas](../08-gestao/estado-e-metricas.md) |
