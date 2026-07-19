> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio do Check-out PRO (índice)

# Regras de negócio

Este é o **índice** das regras de negócio do Check-out PRO, organizado por grande
tema. Cada documento descreve as regras em **linguagem de produto** e aponta,
com links, para o detalhe técnico no [Atlas do backend](../../03-atlas-backend/).

> **Sobre números.** Esta seção não repete métricas voláteis (contagem de testes,
> linhas de código, etc.). Esses números têm fonte única em
> [Estado e métricas](../../08-gestao/estado-e-metricas.md).

## Temas

| Tema | O que cobre |
|---|---|
| [Ponto, jornada e TAC](ponto-jornada-e-tac.md) | Relógio de ponto, hora do comprovante, cálculo de jornada, extras 50%/100%, TAC 1h50, intervalo e o ciclo de folha 26→25. |
| [Escala e rodízio de domingo](escala-e-rodizio-domingo.md) | Turnos, escala semanal, rodízio 2x1 (G1/G2/G3) e feriados a 100%. |
| [Contratos e jornada](contratos-e-jornada.md) | Contrato de experiência 45+45 com estado derivado e os tipos de contrato de jornada data-driven. |
| [Arrecadação e indicadores](arrecadacao-e-indicadores.md) | Troco solidário, recargas, cancelamentos, devoluções; metas; destaques do mês (só operadores); anomalias. |
| [Estoque, insumos e requisições](estoque-insumos-e-requisicoes.md) | Saldo por movimentos, fardos, pedidos recorrentes e requisições. |
| [Checklist e fechamento](checklist-e-fechamento.md) | Checklists por foto, janelas de execução e fechamento do dia. |
| [Disciplina e feedforward](disciplina-e-feedforward.md) | Incidências, advertências (disciplina progressiva) e feedforward. |
| [APAE](apae.md) | Ciclo das sacolas APAE. |

## Como ler estes documentos

- **Cada tema começa** com o cabeçalho de estado (confiabilidade + data da última
  verificação).
- As **regras-chave** são numeradas para facilitar a referência em conversas e
  revisões.
- Os **links relativos** levam ao módulo correspondente do Atlas, que traz o
  detalhe fino (função por função, estado por estado).

## Contexto mais amplo

- Visão de produto e as grandes áreas: [Visão e alcance](../visao-e-alcance.md).
- Quem acessa o quê: [Perfis e permissões](../perfis-e-permissoes.md).
