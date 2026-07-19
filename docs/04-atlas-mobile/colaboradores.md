> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** `mobile/src/screens/colaboradores/`

# Área: `colaboradores`

## 1. Propósito
Telas de **gestão de pessoas** no app: listar/consultar colaboradores, cadastrar
e editar (o formulário completo), ver o **Perfil Inteligente** de cada um e
registrar **sanções/advertências** e **feedforward** (acompanhamento).

## 2. Quem usa (perfis)
- **Gestão** (`OPERADORES_CRUD`): cadastra, edita, promove, define senha.
- **Quem vê a escala** (`OPERADORES_AUSENCIAS`): lista e consulta perfil.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `ColaboradoresScreen.tsx` | Lista/hub de colaboradores | 335 |
| `GestaoColaboradoresScreen.tsx` | Formulário de cadastro/edição | 738 |
| `PerfilColaboradorScreen.tsx` | Perfil Inteligente (score, indicadores, insígnias) | 907 |
| `SancoesScreen.tsx` | Lista de sanções/advertências | 588 |
| `RegistrarSancaoModal.tsx` | Modal para registrar sanção | 460 |
| `FeedforwardSecao.tsx` | Seção de feedforward (acompanhamento) | 833 |

## 4. Fluxo do usuário
1. **Lista:** abre `ColaboradoresScreen`, com busca por nome/matrícula e filtros.
2. **Cadastrar/editar:** abre `GestaoColaboradoresScreen`; preenche matrícula,
   nome, função, turno, horários, contrato; para função com acesso, define a
   **senha**. Salvar chama `cadastrar` ou `editar`.
3. **Perfil:** abre `PerfilColaboradorScreen` no período (mês corrente por
   padrão), com score, ranking, gráficos e insígnias; permite exportar PDF.
4. **Disciplina:** registra sanção (`RegistrarSancaoModal`) e acompanha em
   `SancoesScreen`; feedforward pela seção dedicada.
Cada tela trata os estados **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Listar | `colaboradoresService.listar()` | `GET /colaboradores` |
| Detalhe | `colaboradoresService.obter(id)` | `GET /colaboradores/:id` |
| Cadastrar | `colaboradoresService.cadastrar(input)` | `POST /colaboradores` |
| Editar/promover | `colaboradoresService.editar(id, input)` | `PATCH /colaboradores/:id` |
| Perfil | `colaboradoresService.perfil(...)` | `GET /colaboradores/:id/perfil` |
| Contas de acesso | `colaboradoresService.listarLogins()` | `GET /colaboradores/logins` |

Módulo do backend relacionado: [`colaboradores`](../03-atlas-backend/colaboradores.md).

## 6. Estado local e regras de UI
- O formulário guarda os campos em memória e valida no cliente: horários no
  formato `HH:mm`, data de admissão `dd/mm/aaaa`.
- `FUNCOES_COM_ACESSO = ['FISCAL','SUPERVISOR','GESTOR']`: só para essas funções
  o campo **senha** aparece e é enviado. Operador não tem acesso.
- Gestor/administrador não mostram escala/contrato/gênero (só o essencial).
- **Tipo de contrato:** um único seletor data-driven (o catálogo de tipos de
  contrato de jornada). "Padrão" usa o 6x1 vigente; a lista só aparece para o
  admin. O seletor legado (enum `TipoContrato`) foi removido na Fase 0 do spec
  `solidez-contratos-jornada`.
- Domingo: o grupo só aparece se o contrato trabalha domingo (o backend também
  normaliza por segurança).
- **Seção "Tempo de casa" (contrato de experiência):** mostra os marcos de 45 e
  90 dias, o próximo marco e, quando aplicável, "Efetivado por decurso". Na
  Fase 3 removeu-se o aviso legado de "decisão em atraso" — o ciclo é automático
  e nunca deixa marcos pendentes.

## 7. Lógica pura / utilidades
- Conversões e validações de horário/data usadas pelo formulário.
- Rótulos de função/turno/contrato para exibição.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `ApiError`, `notificar`, componentes de formulário/lista — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `ColaboradoresScreen.test.tsx` | Lista, busca e navegação | 3 |
| `GestaoColaboradoresScreen.test.tsx` | Formulário e envio de senha por função | 2 |
| `PerfilColaboradorScreen.test.tsx` | Render do perfil (score/indicadores) | 3 |

## 10. Riscos, dívidas e pendências
- 🔧 `PerfilColaboradorScreen.tsx` e `FeedforwardSecao.tsx` são grandes (>800
  linhas); candidatos a quebrar em componentes menores.
- ⚠️ O formulário envia a senha na promoção; depende do backend criar o login
  (corrigido — ver [`colaboradores` backend §12](../03-atlas-backend/colaboradores.md#12-riscos-dívidas-e-pendências)).
