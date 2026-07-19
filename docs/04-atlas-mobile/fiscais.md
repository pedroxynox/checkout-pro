> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/fiscais/`

# Área: `fiscais`

## 1. Propósito
**Jornada de equipe do dia**: mostra todos os escalados (fiscais, operadores e
supervisores) — inclusive quem ainda não bateu ponto — com as marcações do dia,
a carga em tempo real e o estado (trabalhando/intervalo/encerrado/falta/
aguardando); e um **modal de incidências de escala** (evento "não retornou do
intervalo" e sanções) reutilizado para criar/editar/excluir.

## 2. Quem usa (perfis)
- **Jornada de equipe** (`FISCAIS_JORNADA`): abre a tela e vê a equipe do dia.
- **Quem vê o perfil** (`OPERADORES_AUSENCIAS`): toca num card para abrir o
  Perfil do colaborador.
- O modal de incidência é acionado por telas de gestão (perfil/disciplina),
  respeitando a permissão de excluir de quem o abre.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `JornadaFiscaisScreen.tsx` | Jornada de equipe do dia (roster + marcações + estado) | 433 |
| `RegistrarIncidenciaModal.tsx` | Modal de criar/editar/excluir incidência de escala | 445 |

## 4. Fluxo do usuário
1. **Equipe do dia:** `JornadaFiscaisScreen` seleciona o dia (padrão hoje) e
   carrega todos os escalados. O topo traz um resumo por estado
   (trabalhando/intervalo/sem registrar/faltas).
2. **Cards:** cada colaborador exibe, em linha, Entrada · Intervalo · Retorno ·
   Saída · Carga (tempo trabalhado em tempo real), o estado com cor e a entrada
   prevista; jornadas incompletas mostram o que falta registrar.
3. **Perfil:** com `OPERADORES_AUSENCIAS`, tocar num card com ficha abre o
   Perfil do colaborador.
4. **Incidência:** `RegistrarIncidenciaModal` cria (com valores pré-preenchidos,
   ex.: a partir de uma sugestão do ponto) ou edita/exclui uma ocorrência; os
   horários (`HH:mm`) só aparecem/validam quando o tipo os usa.
Trata **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Equipe do dia | `fiscaisService.equipeDia(data)` | `GET /fiscais/equipe-dia` |
| Registrar incidência | `escalaService.registrarIncidencia(dto)` | `POST /escala/incidencias` |
| Editar incidência | `escalaService.editarIncidencia(id, dto)` | `PATCH /escala/incidencias/:id` |
| Excluir incidência | `escalaService.removerIncidencia(id)` | `DELETE /escala/incidencias/:id` |

Módulos do backend relacionados: [`fiscais`](../03-atlas-backend/fiscais.md)
(jornada de equipe) e [`incidencias`](../03-atlas-backend/incidencias.md)
(incidências de escala).

## 6. Estado local e regras de UI
- **Faltas e não-retornos são automáticos** (não há marcação manual na escala):
  quem não bate ponto até ~2h da entrada vira falta; intervalo acima de 3h vira
  "não retorno".
- `aparenciaDe` decide o estado exibido por prioridade: falta > sem registrar/
  incompleto > intervalo > encerrado > trabalhando > aguardando.
- O chip "sem registrar" (atraso) só aparece quando o dia é hoje; ao ver dias
  anteriores, mostram-se apenas as batidas registradas.
- No modal, os horários são opcionais e validados por `HHMM_RE`; campos vazios
  são enviados como `undefined`. O tipo padrão é `NAO_RETORNO_INTERVALO` (ou os
  do perfil), com seletor de tipo só quando `permitirEscolherTipo`.
- Erros da API aparecem inline (padrão do app).

## 7. Lógica pura / utilidades
- `aparenciaDe` (estado visual do colaborador), `horaLabel` (HH:mm do ISO) e os
  `SLOTS` das marcações em `JornadaFiscaisScreen`.
- `mascararHora`/`horaValida` no modal (máscara e validação de `HH:mm`).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `SeletorData`, `EstadoVazio`, `MensagemErro`, `Carregando`,
  `Botao`, `CampoTexto`, `Modal` (RN); metadados de tipos de incidência
  (`META_TIPO_INCIDENCIA`, `TIPOS_PERFIL`) — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
Não se aplica (a área não possui arquivos `*.test.tsx`/`*.test.ts`).

## 10. Riscos, dívidas e pendências
- ⚠️ O status ao vivo depende do ponto; transições por tempo (fim de turno,
  intervalo estourado) não geram batida — a leitura em tempo real desta tela é
  por requisição no dia selecionado.
- 🔧 O modal expõe apenas o não-retorno na UI, embora o backend seja genérico;
  a UI de escolha de tipo depende de flags do chamador.
