> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/contratos/`

# Área: `contratos`

## 1. Propósito
Acompanhar os **contratos de experiência (45 + 45 dias)** dos operadores: uma
carteira com resumo, filtros por etiqueta e um card por pessoa mostrando o tempo
de casa, a etapa atual e o semáforo de urgência.

## 2. Quem usa (perfis)
- **Todos com acesso à área** veem a lista, o resumo e podem abrir o perfil da
  pessoa (tocando no card).
- **Quem tem `CONTRATOS_GERIR`** (gerente) pode, além disso, **definir/editar a
  data de admissão** e **encerrar** um contrato em experiência.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `ContratosScreen.tsx` | Carteira de contratos (resumo, filtros e cards) | 425 |
| `ContratosScreen.test.tsx` | Testes de render/permissão | 130 |

## 4. Fluxo do usuário
1. **Carregar:** a tela busca em paralelo os cards (`listar`) e o resumo
   (`resumo`); mostra os estados **carregando / erro / vazio**.
2. **Resumo:** contadores no topo (Experiência em destaque, Efetivados, Total).
3. **Filtrar/buscar:** chips por etiqueta (Todas, Experiência, Efetivado,
   Encerrado, Sem admissão) e busca por nome/matrícula (em memória).
4. **Card:** cada card exibe o tempo de casa, um selo com a etapa e a frase de
   status; tocar abre `PerfilColaborador`.
5. **Gerir (só `CONTRATOS_GERIR`):**
   - **Definir/editar admissão:** abre um editor inline (máscara `dd/mm/aaaa`),
     valida a data e chama `definirAdmissao`; datas passadas são aceitas.
   - **Encerrar contrato** (só em experiência): confirmação e baixa lógica via
     `colaboradoresService.inativar` — a pessoa sai do quadro/escalas, mas o
     histórico é preservado e pode ser reativado depois no perfil.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Listar cards | `contratosService.listar()` | `GET /contratos` |
| Resumo da carteira | `contratosService.resumo()` | `GET /contratos/resumo` |
| Definir/editar admissão | `contratosService.definirAdmissao(id, iso)` | `PATCH /contratos/:id/admissao` |
| Encerrar (baixa lógica) | `colaboradoresService.inativar(id)` | `POST /colaboradores/:id/inativar` |

Módulo(s) do backend relacionado(s): [`contratos`](../03-atlas-backend/contratos.md)
e [`colaboradores`](../03-atlas-backend/colaboradores.md) (no encerramento).

## 6. Estado local e regras de UI
- Estado local: `busca`, `filtro` (etiqueta ou `todas`), `editandoId` +
  `admissaoInput` (editor inline), `ocupado` (ação em curso).
- **Ciclo automático:** dentro dos 90 dias é `experiencia`; a partir do dia 91,
  `efetivado`. Não há decisão manual de marcos na tela.
- **Selo/etapa da experiência:** mostra `45D` enquanto `diasDeCasa <= 45` e
  `90D` depois disso (até efetivar).
- O botão **Encerrar contrato** só aparece no estado `EXPERIENCIA`; **não**
  aparece para quem já está `EFETIVADO`.
- Os botões de gestão só aparecem com `CONTRATOS_GERIR`.

## 7. Lógica pura / utilidades
- `coresUrgencia(u)`: mapeia a urgência (semáforo) para cor/fundo do selo.
- `rotuloSeloCard(c)`: rótulo curto do selo (`45D`/`90D` na experiência; senão a
  etiqueta).
- `statusDoCard(c)`: frase de status conforme o estado e o tempo de casa.
- `ROTULO_ETIQUETA`, `FILTROS`, `DIAS_ETAPA_45` (constante = 45).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `Tela`, `Cartao`, `CampoTexto`, `Botao`, `Selo`, `Carregando`, `MensagemErro`,
  `EstadoVazio`, `ApiError`, `confirmar`/`notificar` e utilidades de data
  (`dataBRParaISO`, `isoParaDataBR`, `mascaraDataBR`, `formatarData`) — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `ContratosScreen.test.tsx` | Etapa `45D`/`90D` e status; botões de gestão (editar admissão/encerrar) só com `CONTRATOS_GERIR`; sem encerrar para efetivado; sem botões sem permissão | 5 |

## 10. Riscos, dívidas e pendências
- ⚠️ O serviço ainda expõe `decidir` (decisão manual de marco), mas a tela usa
  apenas o ciclo automático; método mantido por compatibilidade.
- 🔧 A busca e o filtro são feitos em memória sobre a lista já carregada (o
  serviço aceita `busca`/`etiqueta`, hoje não usados pela tela).
