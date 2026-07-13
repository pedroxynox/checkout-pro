# Tarefas — Registro de Ponto (leitor de papelito)

Cada bloco marcado como PR vira um Pull Request separado (o usuário faz o merge).

## Fase A — Base (registro manual + painel)

- [ ] 1. **Modelo de dados + migração** (Requisitos 1, 7)
  - [ ] 1.1 Adicionar enums `TipoBatida`, `OrigemBatida`, `TipoPessoaPonto` e o
        modelo `BatidaPonto` em `schema.prisma`.
  - [ ] 1.2 Criar migração aditiva `prisma/migrations/<n>_registro_ponto/migration.sql`.
  - PR: "Ponto: modelo de batidas de ponto + migração".

- [ ] 2. **Domínio puro de jornada** (Requisitos 1, 4, 9, 10, 11, 12)
  - [ ] 2.1 `backend/src/ponto/ponto.domain.ts`: `classificarBatidas`,
        `calcularJornadaDia` (usa a hora do papelito; intervalo não conta como
        jornada), status, faltando.
  - [ ] 2.2 Extras + adicional (Seg–Sáb 50% / Dom 100%): `horasExtras50Ms`,
        `horasExtras100Ms`.
  - [ ] 2.3 Regras de intervalo (1h–3h) e classificação **TAC** (extras > 1h50
        OU intervalo < 1h) com motivos; `alertaIminente` (≥ 1h45).
  - [ ] 2.4 Constantes: `ALERTA_EXTRAS_MS`, `LIMITE_EXTRAS_MS`,
        `INTERVALO_ESPERADO_MS`, `INTERVALO_MINIMO_MS`, `INTERVALO_MAXIMO_MS`;
        base via `jornadaEsperadaMs`.
  - [ ] 2.5 `ponto.domain.spec.ts` (incluindo testes de propriedade).
  - PR: "Ponto: domínio de cálculo de jornada + TAC + extras + testes".

- [ ] 3. **Permissões** (Requisito 6)
  - [ ] 3.1 Adicionar `PONTO_REGISTRAR` e `PONTO_VISUALIZAR` em `acessos.domain.ts`
        e nos allowlists de fiscal/supervisor/gerente.
  - [ ] 3.2 Espelhar em `mobile/src/auth/funcionalidades.ts` (ADR 0002).
  - PR: pode ir junto com a tarefa 4.

- [ ] 4. **Backend: serviço + controller** (Requisitos 1, 2, 4, 5)
  - [ ] 4.1 `ponto.service.ts` (gravar/editar/remover/reclassificar; jornada;
        buscar pessoas; validações de data/duplicidade).
  - [ ] 4.2 `ponto.controller.ts` + `dto/ponto.dto.ts` com `@Funcionalidade`.
  - [ ] 4.3 `ponto.module.ts` e registro no `AppModule`.
  - [ ] 4.4 Testes do serviço.
  - PR: "Ponto: API de batidas e jornada (registro manual)".

- [ ] 5. **Mobile: serviço + tipos** (Requisitos 1, 2, 4)
  - [ ] 5.1 `mobile/src/api/services/ponto.ts` e tipos em `api/types.ts`.
  - PR: junto com a tarefa 6.

- [ ] 5b. **Backend: alerta de excesso (cron 1 min)** (Requisito 12)
  - [ ] 5b.1 `ponto-alertas.service.ts`: a cada minuto, notifica colaboradores
        ainda trabalhando com extras ≥ 1h45 ("vai exceder o horário diário").
  - [ ] 5b.2 Reusa `NotificacoesModule` (padrão de `fiscais-horario.service.ts`).
  - PR: "Ponto: alerta de excesso de jornada (a cada minuto)".

- [ ] 6. **Mobile: tela de Registro de Ponto** (Requisitos 1–5, 9–12)
  - [ ] 6.1 `screens/ponto/RegistroPontoScreen.tsx`: busca/seleção de colaborador,
        painel de jornada do dia, lista de batidas (editar/remover).
  - [ ] 6.2 `RegistrarBatidaModal` (registro manual: data/hora + confirmar; avisos
        de data ≠ hoje e duplicidade).
  - [ ] 6.3 Modo **lote** (repetir registro + resumo da sessão).
  - [ ] 6.4 Registrar rota/área/navegação/deep link e testes de tela.
  - PR: "Ponto: tela de registro de ponto e painel de jornada (fiscais)".

## Fase B — Leitor do papelito (OCR)

- [ ] 7. **Backend: OCR + parser** (Requisito 8)
  - [ ] 7.1 Interface `LeitorPapelitoService` + implementação de nuvem
        (configurável por chave), atrás de interface.
  - [ ] 7.2 Parser puro do formato do papelito (nome/data/hora) + testes.
  - [ ] 7.3 `POST /ponto/ocr` retornando texto extraído + candidatos.
  - PR: "Ponto: leitura do papelito por OCR (backend)".

- [ ] 8. **Mobile/Web: captura e integração** (Requisito 8)
  - [ ] 8.1 Captura ao vivo no app (padrão `LeitorCodigoBarras`) e por foto na web.
  - [ ] 8.2 Integrar no `RegistrarBatidaModal`: chama `/ponto/ocr`, pré-preenche
        colaborador + hora, confirmação/edição, fallback manual.
  - [ ] 8.3 Comprovante opcional (guardar imagem).
  - PR: "Ponto: leitor do papelito no app/web (câmera + OCR)".

## Fase C — Futuro (não agora)
- [ ] 9. Estender a operadores (reusa `pessoaId`/`tipoPessoa`).
- [ ] 10. Importar arquivo eletrônico do relógio (AFD) para cierre exato.
