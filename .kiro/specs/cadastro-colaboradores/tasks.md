# Plano de Implementação — Cadastro Unificado de Colaboradores

## Visão Geral

Construção incremental e **sem quebrar produção**: primeiro o modelo e o domínio puro (com testes), depois importação/resolução, depois API, depois telas, e por fim a migração e a virada. Cada fase entrega valor isolado e mantém as telas atuais funcionando.

Convenções: testes de propriedade com **fast-check** (≥100 iterações), anotados `// Feature: cadastro-colaboradores, Property N: ...`. Subtarefas com `*` são testes (opcionais para um MVP, mas recomendados).

## Fases

- [ ] 1. Schema e modelos
  - [ ] 1.1 Adicionar `Colaborador`, `ColaboradorIdentificador`, enums (`FuncaoColaborador`, `TurnoColaborador`, `TipoIdentificador`) ao `schema.prisma`.
  - [ ] 1.2 Adicionar colunas nullable `colaboradorId`/`autorizadoPorId` em `RegistroArrecadacao`; `colaboradorId` em `Ausencia`, `EscalaEntry`, `RegistroPontoFiscal`.
  - [ ] 1.3 Criar migração Prisma (aditiva, sem remover nada).

- [ ] 2. Domínio puro de identidade
  - [ ] 2.1 `normalizarIdentificador` (login minúsculo, matrícula sem espaços) e tipos.
  - [ ] 2.2 `resolverColaborador({ matricula?, login? })` por identificador.
  - [ ] 2.3 `aprenderVinculo(login, matricula)` idempotente e sem sobrescrever conflito.
  - [ ] 2.4* Testes de propriedade do domínio (resolução, idempotência, não-sobrescrita).

- [ ] 3. Parser por arquivo (ajustado)
  - [ ] 3.1 Distinguir, por tipo, operador (login/matrícula) vs fiscal (matrícula) vs autorizador; preferir `matr` sobre `login` quando o destino é matrícula.
  - [ ] 3.2 Devoluções: extrair matrícula do fiscal de `"NNN - Nome"`. Cupom: capturar `MATRICULA_OPERADOR` + `MATRICULA_USO_AUTORIZACAO` + motivo.
  - [ ] 3.3* Testes do parser por tipo de arquivo.

- [ ] 4. Serviço de colaboradores (cadastro/edição)
  - [ ] 4.1 `cadastrar` (matrícula única, login único; cria identificadores; funcao=OPERADOR sem acesso ao app).
  - [ ] 4.2 `editar`, `inativar`/`reativar`; manter unicidade ao alterar matrícula/login.
  - [ ] 4.3* Testes de unicidade e edição.

- [ ] 5. Importação com resolução
  - [ ] 5.1 No upload, resolver `colaboradorId`/`autorizadoPorId` por identificador; preservar nome/código brutos.
  - [ ] 5.2 Recargas: aprender ponte `login ↔ matrícula`.
  - [ ] 5.3 Não resolvidos: gravar e enfileirar em "não reconhecidos".
  - [ ] 5.4* Testes: vincula corretamente; enche a fila quando não casa; ponte idempotente.

- [ ] 6. Perfil e estatísticas
  - [ ] 6.1 `perfil(colaboradorId, inicio, fim)`: operador (troco, recargas, cancel itens+qtd, cancel cupom+motivos, faltas, escala) e fiscal (cupons autorizados, devoluções lançadas, jornada).
  - [ ] 6.2 Estatísticas usam apenas movimentos vinculados por identificador.

- [ ] 7. API REST
  - [ ] 7.1 CRUD de colaboradores + perfil + fila de não reconhecidos + associar.
  - [ ] 7.2 Autorização reaproveitando a funcionalidade de gestão de operadores.

- [ ] 8. Telas (mobile)
  - [ ] 8.1 Lista de colaboradores (busca/filtros).
  - [ ] 8.2 Cadastro/edição (matrícula, login, nome, gênero, turno, horários, folga).
  - [ ] 8.3 Perfil do colaborador (operador/fiscal).
  - [ ] 8.4 Fila de não reconhecidos (associar/criar).

- [ ] 9. Migração e backfill
  - [ ] 9.1 Backfill de colaboradores a partir de `OperadorTurno`/`Operador`/`Fiscal` (+ identificadores de matrícula).
  - [ ] 9.2 Aprender pontes a partir do histórico de Recargas.
  - [ ] 9.3 Religar `colaboradorId` dos movimentos históricos; não resolvidos para a fila.
  - [ ] 9.4 Verificar que telas/fluxos atuais continuam funcionando (compatibilidade).

- [ ] 10. Virada e limpeza (após validação)
  - [ ] 10.1 Migrar `OperadoresScreen`/escala para ler de `Colaborador`.
  - [ ] 10.2 Depreciar gradualmente `Operador`/`OperadorTurno` quando seguro.

## Notas

- Construir atrás de compatibilidade: nada de remover modelos/telas até a virada validada.
- A seção que reúne todos (operadores + fiscais) chama-se **Colaboradores**; cada item abre o perfil.
- Confirmado: a **matrícula do fiscal é a mesma** usada em devoluções e na autorização de cupom.
