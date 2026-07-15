# Requisitos — Registro de Ponto (leitor de comprovante do ponto)

> **Nota de evolução (2026-07-15):** este documento preserva os requisitos da
> entrega inicial (#174–#181). As regras de alerta da seção 12 foram substituídas
> pelos PRs #234–#235: risco em `>=1h30`, risco alto em `>=1h40` e TAC em
> `>1h50`, somente para supervisão/gerência, com deduplicação compartilhada e
> envio best-effort. O Registro de Ponto e a Central de Jornada (#224–#225) já
> abrangem operadores, supervisores e fiscais. No Android, o OCR usa ML Kit
> local com fallback ao servidor; na web, usa o servidor. Apenas a importação
> AFD continua futura. Regra vigente: `PROJECT_UNDERSTANDING.md`.

## Visão geral

Nova seção **Registro de Ponto** no Check-out Pro. Hoje o fiscal marca
manualmente "disponível / intervalo / disponível / encerrar" dentro do app. O
objetivo é registrar o ponto a partir do **comprovante do ponto impresso pelo relógio de
ponto** (biométrico) da empresa, que contém nome completo, data e hora.

Cada dia tem **4 batidas**, na ordem: **1) entrada**, **2) saída para
intervalo**, **3) retorno do intervalo**, **4) encerramento**. O sistema captura
a batida, associa ao colaborador dono do comprovante do ponto e calcula jornada, intervalo,
horas trabalhadas, horas extras, limite diário e carga horária esperada.

O trabalho é dividido em duas fases:

- **Fase A (este ciclo):** toda a base funcionando com **registro manual** da
  hora (digitar/confirmar). Entrega valor e é testável sem depender de OCR.
- **Fase B (próximo ciclo):** **leitor do comprovante do ponto** (câmera + OCR na nuvem) que
  preenche a hora sozinho; o usuário só confirma.

Escopo inicial: **apenas fiscais**. A modelagem já deve permitir estender a
**operadores** (e a qualquer colaborador) sem retrabalho.

### Decisões já tomadas com o usuário
- Captura acontece no telefone; a **leitura (OCR) roda no sistema** (na nuvem),
  para funcionar igual em **Android (APK)** e **iPhone (web/Safari)**. Requer
  internet (o app já exige internet para tudo).
- Um **fiscal pode registrar o ponto de qualquer colaborador** (não só o seu).
- Existe um **modo lote** para ler vários comprovante do pontos em sequência.
- A hora do comprovante do ponto é sempre **editável**, com registro de quem alterou.

---

## Requisito 1 — Registrar uma batida de ponto

**História:** Como fiscal, quero registrar uma batida de ponto de um colaborador
a partir dos dados do comprovante do ponto, para que a hora oficial do relógio fique gravada
no sistema.

Critérios de aceitação:
1. QUANDO o usuário informa colaborador, data e hora de uma batida, ENTÃO o
   sistema DEVE gravar a batida associada àquele colaborador naquela data.
2. QUANDO já existem batidas no dia do colaborador, ENTÃO o sistema DEVE
   classificar a nova batida pela ordem cronológica: 1ª = entrada, 2ª = saída
   para intervalo, 3ª = retorno do intervalo, 4ª = encerramento.
3. SE o usuário tenta registrar uma **5ª batida** no mesmo dia, ENTÃO o sistema
   DEVE avisar e permitir gravar como batida extra (sem quebrar o cálculo).
4. SE a data do comprovante do ponto **não for o dia atual**, ENTÃO o sistema DEVE avisar
   antes de gravar (proteção contra comprovante do ponto antigo), mas permitir confirmar.
5. SE já existe uma batida com a **mesma hora** para o mesmo colaborador no dia,
   ENTÃO o sistema DEVE avisar sobre possível duplicidade.
6. QUANDO uma batida é gravada, ENTÃO o sistema DEVE registrar **quem** a
   registrou e **quando**, e a **origem** (MANUAL nesta fase; LEITOR na Fase B).

## Requisito 2 — Registrar o ponto de qualquer colaborador

**História:** Como fiscal (ou perfil superior), quero registrar o ponto de
qualquer colaborador, porque eu leio os comprovante do pontos de vários colegas.

Critérios de aceitação:
1. QUANDO o usuário busca por nome ou matrícula, ENTÃO o sistema DEVE listar os
   colaboradores correspondentes para seleção.
2. QUANDO o usuário seleciona um colaborador, ENTÃO o sistema DEVE permitir
   registrar batidas para ele, independentemente de ser o próprio usuário.
3. O acesso ao registro DEVE ser controlado pela funcionalidade
   `PONTO_REGISTRAR` (fiscal, supervisor e gerente).

## Requisito 3 — Modo lote

**História:** Como responsável, quero ler vários comprovante do pontos em sequência, para
registrar o ponto de toda a equipe de uma vez.

Critérios de aceitação:
1. QUANDO o usuário está em modo lote, ENTÃO após confirmar uma batida o sistema
   DEVE voltar direto para registrar a próxima, mantendo um resumo do que já foi
   registrado na sessão.
2. QUANDO o usuário encerra o lote, ENTÃO o sistema DEVE mostrar um resumo
   (quantas batidas, de quantos colaboradores, e pendências/avisos).

## Requisito 4 — Painel de jornada do dia

**História:** Como fiscal/gestor, quero ver a jornada do dia calculada a partir
das batidas, para acompanhar horas trabalhadas, intervalo e horas extras.

Critérios de aceitação:
1. QUANDO existem batidas no dia, ENTÃO o sistema DEVE exibir: horário de cada
   batida, tempo trabalhado, tempo de intervalo e status atual (ex.: "em
   intervalo desde 12:30", "trabalhando", "encerrado").
2. QUANDO a carga horária esperada do dia é conhecida, ENTÃO o sistema DEVE
   exibir **horas extras** (tempo trabalhado acima da base do dia) e **destacar
   quando ultrapassarem 1h50** (limite de extras, igual em todos os dias). Base:
   Seg–Qui 7h, Sex–Sáb 8h, Dom 7h20. Intervalo esperado: 2h em todos os dias.
3. SE falta alguma batida (ex.: encerrou sem registrar retorno), ENTÃO o sistema
   DEVE sinalizar a jornada como **incompleta** e indicar o que falta.
4. QUANDO o dia não tem batidas, ENTÃO o sistema DEVE mostrar estado vazio claro.

## Requisito 5 — Correção e auditoria

**História:** Como responsável, quero corrigir uma batida lida errada, para
manter os dados corretos.

Critérios de aceitação:
1. QUANDO o usuário edita a hora ou o tipo de uma batida, ENTÃO o sistema DEVE
   gravar a alteração e **quem** alterou.
2. QUANDO o usuário remove uma batida, ENTÃO o sistema DEVE reclassificar as
   batidas restantes pela ordem cronológica.
3. A edição/remoção DEVE exigir a funcionalidade `PONTO_REGISTRAR`.

## Requisito 6 — Permissões e perfis

Critérios de aceitação:
1. `PONTO_REGISTRAR` — registrar/editar/remover batidas de qualquer colaborador
   (perfis: FISCAL, SUPERVISOR, GERENTE; e GERENTE_DESENVOLVEDOR por padrão).
2. `PONTO_VISUALIZAR` — ver o painel de ponto/jornada (mesmos perfis).
3. As funcionalidades DEVEM ser declaradas na fonte única
   (`acessos.domain.ts`) e **espelhadas** no mobile (`auth/funcionalidades.ts`),
   conforme ADR 0002.

## Requisito 7 — Base extensível a operadores

Critérios de aceitação:
1. O modelo de dados DEVE identificar a pessoa de forma polimórfica
   (fiscal OU operador), no mesmo padrão de `Ausencia` (`pessoaId` +
   `colaboradorId`), para permitir estender a operadores sem migração
   estrutural.

## Requisito 8 — Leitor do comprovante do ponto (Fase B)

**História:** Como fiscal, quero apenas mostrar/fotografar o comprovante do ponto e ter a
hora preenchida automaticamente.

Critérios de aceitação:
1. QUANDO o usuário aponta a câmera para o comprovante do ponto (ou tira uma foto), ENTÃO o
   sistema DEVE enviar a imagem ao backend e receber nome, data e hora extraídos.
2. QUANDO o texto é extraído, ENTÃO o sistema DEVE pré-selecionar o colaborador
   correspondente (por nome/matrícula) e preencher a hora, deixando o usuário
   **confirmar ou corrigir** antes de gravar.
3. SE a leitura falhar ou vier com baixa confiança, ENTÃO o sistema DEVE cair no
   fluxo manual (Requisito 1) sem travar.
4. A imagem PODE ser guardada como comprovante (auditoria), de forma opcional.
5. NÃO FAZ PARTE deste spec integrar diretamente com o arquivo eletrônico do
   relógio (AFD) — fica registrado como evolução futura.

## Requisito 9 — A hora do comprovante do ponto é a que vale

**História:** Como colaborador, quero que conte a hora impressa no comprovante do ponto e
não a hora em que carreguei, para que o cálculo seja justo.

Critérios de aceitação:
1. QUANDO uma batida é registrada, ENTÃO o sistema DEVE gravar como hora da
   batida a **hora do comprovante do ponto** (ex.: 12:10), ainda que o carregamento ocorra
   depois (ex.: 12:15).
2. O relógio do dia DEVE começar a contar a partir da **1ª batida** (ex.:
   entrada 07:56 conta desde 07:56).
3. O tempo trabalhado DEVE ser contado entre as horas das batidas (da 1ª à 2ª,
   etc.), usando sempre a hora do comprovante do ponto.

## Requisito 10 — Intervalo (regras e cálculo)

Critérios de aceitação:
1. O tempo de intervalo NÃO conta como jornada (ex.: 3h + 2h de intervalo + 4h
   = **7h trabalhadas**).
2. O intervalo permitido é de **1h a 3h** (esperado 2h).
3. SE o intervalo for **menor que 1h**, ENTÃO o dia DEVE ser classificado como
   **TAC**.
4. SE o intervalo for **maior que 3h**, ENTÃO o dia DEVE ser classificado como
   **TAC**.

## Requisito 11 — Horas extras 50% / 100%

Critérios de aceitação:
1. QUANDO o tempo trabalhado ultrapassa a base do dia, ENTÃO o excedente é
   **hora extra**.
2. As horas extras de **segunda a sábado** DEVEM ser classificadas como **50%**.
3. As horas extras de **domingo** DEVEM ser classificadas como **100%**.

## Requisito 12 — Alerta de excesso e classificação TAC

**História:** Como responsável, quero ser avisado quando um colaborador estiver
prestes a exceder o limite diário, para agir a tempo.

**TAC** = **Termo de Ajustamento de Conduta**.

Critérios de aceitação:
1. QUANDO um colaborador (ainda trabalhando) atinge **1h45 de horas extras** no
   dia, ENTÃO o sistema DEVE enviar um alerta **a cada 1 minuto**, **para todos
   os fiscais**, avisando que ele vai exceder o horário diário permitido.
2. O colaborador PODE continuar batendo/carregando o comprovante do ponto normalmente.
3. QUANDO as horas extras passam de **1h50** (ou o intervalo fica < 1h ou > 3h),
   ENTÃO o dia DEVE ser classificado como **TAC**.
4. QUANDO o dia é classificado como TAC, ENTÃO o sistema DEVE **notificar todos
   os usuários** com o nome do colaborador e o(s) motivo(s) (ex.: "excedeu 1h50
   de extras", "intervalo abaixo de 1h", "intervalo acima de 3h").

---

## Fora de escopo (agora)
- Substituir os botões atuais de status do fiscal (a nova seção coexiste).
- Operadores e demais colaboradores (só a base fica pronta).
- Importar arquivo AFD do relógio de ponto.
- Fechamento/folha de pagamento oficial.
