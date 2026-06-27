# Plano de Implementação — Cadastro Unificado de Colaboradores

## Visão Geral

Construção incremental e **sem quebrar produção**: primeiro o modelo e o domínio puro (com testes), depois importação/resolução, depois API, depois telas, e por fim a migração e a virada. Cada fase entrega valor isolado e mantém as telas atuais funcionando.

Convenções: testes de propriedade com **fast-check** (≥100 iterações), anotados `// Feature: cadastro-colaboradores, Property N: ...`. Subtarefas com `*` são testes (opcionais para um MVP, mas recomendados).

## Status atual (atualizado em 2026-06-26)

O Cadastro Unificado de Colaboradores **está em produção** e é a fonte única de
pessoas. O que já foi entregue:

- **Schema/migração:** `Colaborador`, `ColaboradorIdentificador`, enums e colunas
  `colaboradorId` (migração `9p_cadastro_colaboradores`; backfill de fiscais em
  `9s_colaboradores_de_fiscais`).
- **Identidade:** `resolverColaboradorId(tipo, codigo, mapaMatricula, mapaLogin)`
  resolve por matrícula e por login (`perfil-colaborador.domain.ts`).
- **Cadastro/edição:** criar/editar/inativar com unicidade de matrícula e login.
  O **login do app é criado no próprio cadastro** quando a função é
  fiscal/supervisor/gestor; **operadores não têm acesso ao app** (senha mínima 6).
- **Perfil inteligente** (custo zero, sem IA): indicadores, ranking, tendência e
  comparação com a equipe; status online/jornada no perfil.
- **API REST:** CRUD de colaboradores + perfil.
- **Telas:** `ColaboradoresScreen` (lista, com contagem separada de **Fiscais**),
  `GestaoColaboradoresScreen` (cadastro/edição + aba de acesso), `PerfilColaboradorScreen`.
- **Virada da escala:** a escala de **fiscais** (PR #79) e de **operadores**
  (PR #80) lê de `Colaborador`. O model `OperadorTurno` foi marcado como
  `[DEPRECADO]` (sem migração destrutiva).

Desvios de design (decisões tomadas durante a implementação):
- A resolução `colaboradorId` dos movimentos acontece **em tempo de leitura**
  (no cálculo do perfil), e não persistida no upload — por isso a Fase 5 ficou
  diferente do plano original.
- A **fila de "não reconhecidos"** (8.4 / 5.3) ainda **não** foi implementada.
- O model simples `Operador` (atribuição de registros operacionais) ainda **não**
  foi depreciado — fica para quando for seguro.

## Fases

- [x] 1. Schema e modelos
  - [x] 1.1 Adicionar `Colaborador`, `ColaboradorIdentificador`, enums (`FuncaoColaborador`, `TurnoColaborador`, `TipoIdentificador`) ao `schema.prisma`.
  - [x] 1.2 Adicionar colunas nullable `colaboradorId`/`autorizadoPorId` em `RegistroArrecadacao`; `colaboradorId` em `Ausencia`, `EscalaEntry`, `RegistroPontoFiscal`.
  - [x] 1.3 Criar migração Prisma (aditiva, sem remover nada).

- [ ] 2. Domínio puro de identidade
  - [x] 2.1 `normalizarIdentificador` (login minúsculo, matrícula sem espaços) e tipos.
  - [x] 2.2 `resolverColaborador({ matricula?, login? })` por identificador.
  - [ ] 2.3 `aprenderVinculo(login, matricula)` idempotente e sem sobrescrever conflito.
  - [ ] 2.4* Testes de propriedade do domínio (resolução, idempotência, não-sobrescrita).

- [ ] 3. Parser por arquivo (ajustado)
  - [x] 3.1 Distinguir, por tipo, operador (login/matrícula) vs fiscal (matrícula) vs autorizador; preferir `matr` sobre `login` quando o destino é matrícula.
  - [x] 3.2 Devoluções: extrair matrícula do fiscal de `"NNN - Nome"`. Cupom: capturar `MATRICULA_OPERADOR` + `MATRICULA_USO_AUTORIZACAO` + motivo.
  - [ ] 3.3* Testes do parser por tipo de arquivo.

- [ ] 4. Serviço de colaboradores (cadastro/edição)
  - [x] 4.1 `cadastrar` (matrícula única, login único; cria identificadores; funcao=OPERADOR sem acesso ao app).
  - [x] 4.2 `editar`, `inativar`/`reativar`; manter unicidade ao alterar matrícula/login.
  - [ ] 4.3* Testes de unicidade e edição.

- [ ] 5. Importação com resolução
  - [ ] 5.1 No upload, resolver `colaboradorId`/`autorizadoPorId` por identificador; preservar nome/código brutos. (Feito em tempo de LEITURA no perfil, não no upload.)
  - [ ] 5.2 Recargas: aprender ponte `login ↔ matrícula`.
  - [ ] 5.3 Não resolvidos: gravar e enfileirar em "não reconhecidos".
  - [ ] 5.4* Testes: vincula corretamente; enche a fila quando não casa; ponte idempotente.

- [x] 6. Perfil e estatísticas
  - [x] 6.1 `perfil(colaboradorId, inicio, fim)`: operador (troco, recargas, cancel itens+qtd, cancel cupom+motivos, faltas, escala) e fiscal (cupons autorizados, devoluções lançadas, jornada).
  - [x] 6.2 Estatísticas usam apenas movimentos vinculados por identificador.

- [x] 7. API REST
  - [x] 7.1 CRUD de colaboradores + perfil + fila de não reconhecidos + associar. (Fila ainda não implementada.)
  - [x] 7.2 Autorização reaproveitando a funcionalidade de gestão de operadores.

- [ ] 8. Telas (mobile)
  - [x] 8.1 Lista de colaboradores (busca/filtros).
  - [x] 8.2 Cadastro/edição (matrícula, login, nome, gênero, turno, horários, folga).
  - [x] 8.3 Perfil do colaborador (operador/fiscal).
  - [ ] 8.4 Fila de não reconhecidos (associar/criar).

- [ ] 9. Migração e backfill
  - [ ] 9.1 Backfill de colaboradores a partir de `OperadorTurno`/`Operador`/`Fiscal` (+ identificadores de matrícula). (Feito para `Fiscal` na migração `9s`; operadores recadastrados manualmente.)
  - [ ] 9.2 Aprender pontes a partir do histórico de Recargas.
  - [ ] 9.3 Religar `colaboradorId` dos movimentos históricos; não resolvidos para a fila.
  - [x] 9.4 Verificar que telas/fluxos atuais continuam funcionando (compatibilidade).

- [x] 10. Virada e limpeza (após validação)
  - [x] 10.1 Migrar `OperadoresScreen`/escala para ler de `Colaborador`. (Fiscais: PR #79; Operadores: PR #80.)
  - [x] 10.2 Depreciar gradualmente `Operador`/`OperadorTurno` quando seguro. (`OperadorTurno` depreciado no PR #80; `Operador` simples ainda pendente.)

## Notas

- Construir atrás de compatibilidade: nada de remover modelos/telas até a virada validada.
- A seção que reúne todos (operadores + fiscais) chama-se **Colaboradores**; cada item abre o perfil.
- Confirmado: a **matrícula do fiscal é a mesma** usada em devoluções e na autorização de cupom.
