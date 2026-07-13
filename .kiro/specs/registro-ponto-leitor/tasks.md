# Tarefas — Registro de Ponto (leitor de comprovante do ponto)

> **Estado (2026-07-13):** Fase A e Fase B **concluídas e mescladas** na `main`
> (PRs #174–#181). Falta apenas **validar em campo** o leitor on-device do APK
> (ML Kit) e, com mais fotos reais, seguir afinando o interpretador. A Fase C
> (operadores e importação do arquivo AFD) fica para o futuro. Ver o resumo
> completo em `REGISTRO_DE_MUDANCAS.md`.

Cada bloco marcado como PR virou um Pull Request separado.

## Fase A — Base (registro manual + painel) — ✅ concluída

- [x] 1. **Modelo de dados + migração** (Requisitos 1, 7) — PR #174
  - [x] 1.1 Enums `TipoBatida`, `OrigemBatida`, `TipoPessoaPonto` e o modelo
        `BatidaPonto` em `schema.prisma`.
  - [x] 1.2 Migração aditiva `prisma/migrations/9zh_registro_ponto/migration.sql`.

- [x] 2. **Domínio puro de jornada** (Requisitos 1, 4, 9, 10, 11, 12) — PR #174
  - [x] 2.1 `backend/src/ponto/ponto.domain.ts`: `classificarBatidas`,
        `calcularJornadaDia` (usa a hora do comprovante; intervalo não conta como
        jornada), status, faltando.
  - [x] 2.2 Extras + adicional (Seg–Sáb 50% / Dom 100%): `horasExtras50Ms`,
        `horasExtras100Ms`.
  - [x] 2.3 Regras de intervalo (1h–3h) e classificação **TAC** (extras > 1h50,
        ou intervalo < 1h, ou intervalo > 3h) com motivos; `alertaIminente` (≥ 1h45).
  - [x] 2.4 Constantes `ALERTA_EXTRAS_MS`, `LIMITE_EXTRAS_MS`,
        `INTERVALO_ESPERADO_MS`, `INTERVALO_MINIMO_MS`, `INTERVALO_MAXIMO_MS`;
        base via `jornadaEsperadaMs`.
  - [x] 2.5 `ponto.domain.spec.ts` (inclui testes de propriedade).

- [x] 3. **Permissões** (Requisito 6) — PR #174
  - [x] 3.1 `PONTO_REGISTRAR` e `PONTO_VISUALIZAR` em `acessos.domain.ts`
        (fiscal, supervisor, gerente).
  - [x] 3.2 Espelhado em `mobile/src/auth/funcionalidades.ts` (ADR 0002).

- [x] 4. **Backend: serviço + controller** (Requisitos 1, 2, 4, 5) — PR #174
  - [x] 4.1 `ponto.service.ts` (gravar/editar/remover/reclassificar; jornada;
        buscar pessoas; validações de data/duplicidade).
  - [x] 4.2 `ponto.controller.ts` + `dto/ponto.dto.ts` com `@Funcionalidade`.
  - [x] 4.3 `ponto.module.ts` e registro no `AppModule`.
  - [x] 4.4 Testes do serviço/domínio.

- [x] 5. **Mobile: serviço + tipos** (Requisitos 1, 2, 4) — PR #176
  - [x] 5.1 `mobile/src/api/services/ponto.ts` e tipos em `api/types.ts`.

- [x] 5b. **Backend: alerta de excesso (cron 1 min)** (Requisito 12) — PR #175
  - [x] 5b.1 `ponto-alertas.service.ts`: a cada minuto, avisa **todos os fiscais**
        quando alguém (ainda trabalhando) passa de 1h45 de extras; TAC notifica
        **todos os usuários** (uma vez por dia).
  - [x] 5b.2 Reusa `NotificacoesModule` (padrão de `fiscais-horario.service.ts`).

- [x] 6. **Mobile: tela de Registro de Ponto** (Requisitos 1–5, 9–12) — PR #176
  - [x] 6.1 `screens/ponto/RegistroPontoScreen.tsx`: busca/seleção de colaborador,
        painel de jornada do dia, lista de batidas (editar/remover).
  - [x] 6.2 Registro manual (data/hora + confirmar; aviso de data ≠ hoje).
  - [x] 6.3 Modo **lote** (registrar vários comprovantes + resumo da sessão).
  - [x] 6.4 Rota/área/navegação/deep link e teste de tela.

## Fase B — Leitor do comprovante do ponto (OCR) — ✅ concluída

- [x] 7. **Backend: OCR + parser** (Requisito 8) — PR #177, #180, #181
  - [x] 7.1 Interface `LeitorComprovanteService` + implementação no **nosso
        servidor** (`OcrServidorService`, tesseract.js) atrás da interface.
  - [x] 7.2 Parser puro (`ponto-ocr.parser.ts`) do formato real (rótulos
        `NOME:`/`DATA:`/`HORA:`, nome quebrado em 2 linhas, ignora CNPJ/PIS e
        ruído do OCR) + testes com o comprovante real (IDCLASS/Zaffari).
  - [x] 7.3 `POST /ponto/ocr` (texto do Android OU imagem da web) → nome/data/
        hora + colaboradores sugeridos.
  - [x] 7.4 Pré-tratamento da imagem no servidor (jimp: cinza/contraste/escala)
        + PSM de bloco no tesseract (melhora a leitura web) — PR #180.

- [x] 8. **Mobile/Web: captura e integração** (Requisito 8) — PR #178
  - [x] 8.1 Android: `leitorComprovante.native.ts` (câmera + **ML Kit** no
        aparelho, com fallback ao OCR do servidor). Web: `leitorComprovante.ts`
        (foto → OCR do servidor).
  - [x] 8.2 Botão "Ler comprovante do ponto (foto)" na tela: chama `/ponto/ocr`,
        pré-preenche hora + sugere colaborador, com confirmação/edição e fallback
        manual.

> **Renomeação (PR #179):** a palavra informal "papelito" foi trocada por
> **"comprovante do ponto"** em todo o código, textos visíveis e neste spec.

### Pendências de validação (não são código)
- [ ] Validar o leitor **on-device do APK (ML Kit)** num aparelho real (não é
      possível compilar/rodar o APK no ambiente de desenvolvimento).
- [ ] Com mais fotos de comprovantes reais, seguir afinando o interpretador (o
      OCR da **web** é o caminho mais fraco; o do APK tende a ser bem melhor).

## Fase C — Futuro (não agora)
- [ ] 9. Estender a **operadores** (o modelo já é polimórfico: `pessoaId`/`tipoPessoa`).
- [ ] 10. Importar o **arquivo eletrônico do relógio (AFD)** para fechamento exato.
