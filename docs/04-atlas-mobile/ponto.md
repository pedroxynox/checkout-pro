> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/ponto/`

# Área: `ponto`

## 1. Propósito
Registro de ponto por **comprovante**: escolher o colaborador, ver a **jornada
do dia** calculada a partir das batidas e registrar/corrigir/remover batidas —
com **leitura automática por câmera/OCR** (só no APK) — além do controle do
**ciclo de folha (26→25)** pela Central de Jornada (saldo, extras, faltas,
inconsistências, fechamento e feriados).

## 2. Quem usa (perfis)
- **Fiscal**: registra batidas novas (a hora do comprovante) e pode informar a
  própria falta do dia; não vê os botões de correção/exclusão.
- **Gestão que corrige o ponto** (`PONTO_EDITAR`): corrige e exclui batidas.
- **Central de Jornada** (`CENTRAL_JORNADA`): resumo do ciclo, inconsistências,
  revisão e fechamento do ciclo, e gestão de feriados.
- **Marcar falta como débito** (`OPERADORES_AUSENCIAS`): no detalhe da jornada.
- **Reabrir ciclo** (`ADMIN_DADOS`): libera edições de um ciclo fechado.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `RegistroPontoScreen.tsx` | Tela principal: busca, jornada do dia, batidas e leitor | 1213 |
| `CentralJornadaScreen.tsx` | Portal do ciclo (hero, atalhos, resumo do time, lista por pessoa, comparativo) | 670 |
| `DetalheJornadaScreen.tsx` | Detalhe dia a dia de um colaborador no ciclo | 344 |
| `InconsistenciasScreen.tsx` | Problemas do ciclo agrupados por dia | 325 |
| `ExportarCicloScreen.tsx` | Revisão dos totais e fechar/reabrir o ciclo | 246 |
| `FeriadosScreen.tsx` | Feriados nacionais (automáticos) + estaduais/municipais (manuais) | 214 |
| `leitorAoVivo.tsx` / `leitorAoVivo.native.tsx` | Leitor ao vivo (câmera): vazio na web, ML Kit no APK | 23 / 325 |
| `leitorComprovante.ts` / `leitorComprovante.native.ts` | Captura de foto: nula na web, câmera no APK | 15 / 33 |
| `leituraComprovanteUtil.ts` | Heurística de leitura (gatilho + extração da hora) | 85 |
| `montarTextoOcr.ts` | Reconstrução do texto do OCR pela geometria | 131 |

## 4. Fluxo do usuário
1. **Registro:** em `RegistroPontoScreen` seleciona o dia, busca o colaborador
   por nome (debounce) ou usa o **leitor** (APK): a câmera captura sozinha
   quando a leitura fica boa, o servidor interpreta nome/data/hora e sugere o
   colaborador. Com leitura confiável, seleciona sozinho e pré-preenche a hora.
2. **Batidas:** registra a hora do comprovante (`HH:mm`), corrige ou remove
   (só `PONTO_EDITAR`). Limite de **4 batidas** por dia; correção/exclusão de um
   dia com extras/TAC pede confirmação (recalcula os valores).
3. **Modo lote:** registra vários comprovantes em sequência, com contador da
   sessão; sem conexão, a batida vai para a **fila offline** (idempotente).
4. **Painel da jornada:** mostra status (trabalhando/intervalo/encerrado/
   incompleto/sem registro), trabalhado, intervalo, extras (50%/100%), carga
   base, alerta de TAC iminente e "Como é calculado?".
5. **Ciclo:** pela Central de Jornada abre inconsistências, revisão/fechamento
   e feriados; toca numa pessoa para o detalhe diário.
Cada tela trata os estados **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Buscar pessoas | `pontoService.buscarPessoas(busca)` | `GET /ponto/pessoas` |
| Jornada do dia | `pontoService.jornadaDoDia(...)` | `GET /ponto/dia` |
| Registrar batida | `pontoService.registrarBatida(input)` | `POST /ponto/batidas` |
| Corrigir batida | `pontoService.editarBatida(id, input)` | `PATCH /ponto/batidas/:id` |
| Remover batida | `pontoService.removerBatida(id)` | `DELETE /ponto/batidas/:id` |
| Ler comprovante | `pontoService.lerComprovante({ texto })` | `POST /ponto/ocr` |
| Meu resumo (fiscal) | `fiscaisService.meuResumo()` | `GET /fiscais/eu` |
| Informar falta | `fiscaisService.informarFalta()` | `POST /fiscais/eu/falta` |
| Resumo do ciclo | `centralJornadaService.resumo(ciclo)` | `GET /central-jornada` |
| Inconsistências | `centralJornadaService.inconsistencias(ciclo)` | `GET /central-jornada/inconsistencias` |
| Comparativo | `centralJornadaService.comparativos(qtd)` | `GET /central-jornada/comparativos` |
| Detalhe por pessoa | `centralJornadaService.pessoa(id, ciclo)` | `GET /central-jornada/pessoa/:id` |
| Marcar débito | `centralJornadaService.marcarDebito(id, debito)` | `POST /central-jornada/ausencia/:id/debito` |
| Revisão do ciclo | `centralJornadaService.exportacao(ciclo)` | `GET /central-jornada/exportacao` |
| Status do ciclo | `cicloFolhaService.status(ciclo)` | `GET /ciclo-folha/status` |
| Fechar / reabrir | `cicloFolhaService.fechar/reabrir(ciclo)` | `POST /ciclo-folha/fechar` · `POST /ciclo-folha/reabrir` |
| Feriados | `feriadosService.listar/criar/remover(...)` | `GET/POST /feriados` · `DELETE /feriados/:id` |

Módulos do backend relacionados: [`ponto`](../03-atlas-backend/ponto.md),
[`central-jornada`](../03-atlas-backend/central-jornada.md),
[`ciclo-folha`](../03-atlas-backend/ciclo-folha.md),
[`feriados`](../03-atlas-backend/feriados.md) e
[`fiscais`](../03-atlas-backend/fiscais.md) (autosserviço do fiscal).

## 6. Estado local e regras de UI
- A hora é digitada com máscara `HH:mm` e validada por `HORA_VALIDA`
  (00:00–23:59); a batida é gravada como ISO `data + hora`.
- **Limite de 4 batidas/dia**: acima disso não oferece registrar, mas mantém
  correção/exclusão.
- Correção/exclusão em dia com extras/TAC exibe confirmação de consequência.
- Fila **offline**: batidas novas usam `clienteId` (idempotência); edições
  exigem a batida no servidor e não entram na fila.
- O leitor e a foto só aparecem fora da web; a origem da batida (`LEITOR`/
  `MANUAL`) e o nome lido são enviados para o servidor "aprender" a pessoa.
- Autosserviço do fiscal (informar falta) só aparece quando o usuário é fiscal
  e o dia é hoje.
- Central de Jornada: navegação por ciclo (0 = atual, sem avançar do atual);
  feriados "registrados" contam só os manuais; carregar checklist do ciclo
  respeita as permissões acima. As **"Extras 50%"** (métrica do resumo do time e
  chip "+50%" de cada colaborador) mostram as 50% **reais do momento**
  (`extras50AtualMs` = acumulado − o que deve, piso 0), não o bruto do mês. Do
  mesmo modo, o chip **"Deve"** usa `horasDevidasAtualMs` (o que deve − as 50%,
  piso 0): quem tem saldo 50% positivo não aparece devendo horas.

## 7. Lógica pura / utilidades
- `leituraComprovanteUtil.ts`: `leituraCompleta(texto)` (gatilho do leitor ao
  vivo: exige hora + marcador do documento) e `horaLida(texto)` (extrai `HH:mm`
  tolerante às trocas do OCR).
- `montarTextoOcr.ts`: `montarTextoDeLinhas` e `textoPelaGeometria` reagrupam as
  linhas do ML Kit por faixa horizontal para o interpretador ancorar
  `HORA:`/`DATA:`/`NOME:`.
- Locais da tela: `seloStatus`/`descricaoStatus` (estados da jornada),
  `mascaraHora`, `corConfianca`/`rotuloConfianca` (confiança da leitura) e
  `progressoCiclo` (dias percorridos do ciclo, na Central).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `CartaoAcao`, `CartaoMetrica`, `Selo`, `SeletorData`,
  `Segmentado`, `Botao`, `CampoTexto`, `EstadoVazio`, `MensagemErro`,
  `Carregando`; `ApiError`, `confirmar`/`notificar`, contexto offline —
  ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `RegistroPontoScreen.test.tsx` | Busca, jornada, registro manual, limite de 4, erro de duplicidade e leitura do comprovante | 6 |
| `ExportarCicloScreen.test.tsx` | Revisão (totais) e fechamento do ciclo com confirmação | 2 |
| `InconsistenciasScreen.test.tsx` | Agrupamento por dia e filtro por pessoa | 2 |
| `leituraComprovanteUtil.test.ts` | Gatilho `leituraCompleta` e extração `horaLida` (tolerante ao OCR) | 4 |
| `montarTextoOcr.test.ts` | Reconstrução do texto pela geometria do OCR | 3 |

## 10. Riscos, dívidas e pendências
- 🔧 `RegistroPontoScreen.tsx` (>1200 linhas) concentra busca, leitor, jornada,
  formulário e fila offline; candidato a quebrar em componentes/hooks.
- ⚠️ O OCR só existe no APK (ML Kit); na web o registro é sempre manual — o OCR
  de imagem no servidor foi desativado.
- ⚠️ A leitura da hora nas batidas assume a "hora de parede" do ISO (sem fuso);
  a interpretação final do comprovante depende do servidor.
