> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-22 · **Cobre:** `backend/src/jornada-vigencia/`, `backend/prisma/schema.prisma` (`JornadaVigencia`, `DisponibilidadeDia`)

# ADR 0027 — Vigência da jornada: cada dia é calculado com o que valia naquele dia

## Contexto

A EC 141/2026 acabou com a escala 6x1. A partir de **23/11/2026** a empresa opera em
5x2 (44 h) e, em **16/12/2026**, passa a 42 h. Cada pessoa muda de contrato, de
folgas e de horário numa data.

O sistema não tinha noção de data para nada disso. A jornada é apurada sob demanda
a partir da ficha **atual** (`Colaborador.tipoContratoJornadaId`, `folgaDiaSemana`,
blocos Seg–Qui/Sex–Sáb/Dom, `grupoDomingo`). Trocar o contrato ou a folga de alguém
recalculava **todo o passado**: extras, saldo, TAC, atrasos, faltas — inclusive de
ciclos de folha já fechados. O dono pediu exatamente o contrário: até 22/11 tudo se
comporta como 6x1, mesmo quando uma batida desses dias for corrigida depois.

Spec: [`.kiro/specs/jornada-5x2/`](../../../.kiro/specs/jornada-5x2/requirements.md).

## Decisão

1. **Vigência por pessoa.** A tabela `jornada_vigencias` guarda "a partir desta data,
   esta pessoa tem este contrato, este grupo, estas folgas fixas e esta
   disponibilidade" (`disponibilidade_dias`, uma linha por dia da semana). Cada dia é
   decidido pela vigência de maior início que não passe dele.
2. **Os dias antes da primeira vigência são o regime legado (6x1)**, respondido pela
   ficha que já está no `Colaborador`, com as mesmas funções de hoje. A ficha legada
   **não é copiada**: depois da primeira vigência ela fica congelada (a API recusará
   mudá-la — Fase 4), porque passou a ser a história.
3. **Uma fonte para "como é o dia desta pessoa"**: a *jornada prevista do dia*
   (`previstoNoDia`, domínio puro) e o seu consultor em lote
   (`JornadaVigenciaService.consultor`), que responde folga, entrada, saída, carga,
   100%, débito e regras do contrato. Todo consumidor passa a perguntar a ela (Fase 1b).
4. **Vigência dentro de ciclo de folha fechado é recusada** (escrita, Fase 4).

## Consequências

- **Enquanto ninguém tiver vigência, nada muda — por construção**: o regime legado é
  o código de hoje sobre os dados de hoje. Os testes comparam o consultor com o
  `FolgaService` e com `entradaEsperadaNoDia`/`saidaEsperadaNoDia` sobre os mesmos
  dados, e um teste de propriedade cobre fichas e datas aleatórias.
- **Corrigir hoje um dia antigo usa as regras daquele dia**, porque a pergunta passa
  a ser "qual era a vigência no dia X", não "qual é a ficha agora".
- **Contrato referenciado por vigência não pode ser removido** (Restrict no banco e
  mensagem própria em `TiposContratoService.remover`): ele decide os dias daquele
  período.
- **No regime legado, `entrada` continua sem olhar a escala semanal** (`EscalaEntry`),
  como `entradaEsperadaNoDia` sempre fez; quem precisa de "está escalado" combina com
  `folga` (o campo `escalado` já faz isso). Mudar isso agora alteraria números do
  passado.
- A ficha legada vive no `Colaborador` enquanto existir alguém sem vigência e como
  história depois; sair da API e das telas é a Fase 7 do spec.

## Alternativas consideradas

- **Copiar a ficha para uma vigência "desde 1970"** (primeira versão do design).
  Daria um modelo uniforme, mas exigiria espelhar cada edição da ficha na cópia até o
  corte e criaria duas fontes do mesmo dado. Congelar a ficha dá a mesma garantia.
- **Fotografar os totais ao fechar o ciclo.** Protege só ciclos fechados; o ciclo
  26/10–25/11 está aberto e dividido pelo corte de 23/11. Continua possível no futuro
  como camada extra.
- **Versionar só o contrato.** Não cobre a mudança de folgas e de horário de cada
  pessoa, que também reescrevia o passado.
