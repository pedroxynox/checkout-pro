> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-23 · **Cobre:** `mobile/src/screens/colaboradores/`

# Área: `colaboradores`

## 1. Propósito
Telas de **gestão de pessoas** no app: listar/consultar colaboradores, cadastrar
e editar (o formulário completo), ver o **Perfil Inteligente** de cada um e
registrar **sanções/advertências** e **feedforward** (acompanhamento).

## 2. Quem usa (perfis)
Dados pessoais são **confidenciais**, por isso a área tem funcionalidades
próprias (ajustáveis na Central de Permissões):
- **`COLABORADORES_VISUALIZAR`**: abre a seção "Colaboradores" (a lista de
  pessoas do quadro). Padrão: administrador, gerente e supervisor.
- **`COLABORADORES_PERFIL`**: abre a **ficha individual** (Perfil Inteligente),
  de qualquer ponto do app. Padrão: administrador, gerente e supervisor.
- **`OPERADORES_CRUD`**: cadastra, edita, promove, define senha e grava a
  **jornada** (grupo, folgas fixas, disponibilidade) — Centro de Controle ▸
  Colaboradores.
- **`ADMIN_DADOS`**: só quem tem escolhe ou troca o **tipo de contrato** (decisão
  do dono). Os demais veem o contrato, sem trocar.
- O **fiscal** continua vendo a escala do dia (`OPERADORES_AUSENCIAS`), mas não a
  seção nem a ficha de ninguém.
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `ColaboradoresScreen.tsx` | Lista/hub de colaboradores | 345 |
| `GestaoColaboradoresScreen.tsx` | Formulário de cadastro/edição (salva a ficha e a jornada) | 762 |
| `JornadaFormulario.tsx` | Seção "Jornada" do formulário: contrato, disponibilidade seg–dom, grupo, folgas fixas, "Vale a partir de", avisos | 307 |
| `PerfilColaboradorScreen.tsx` | Perfil Inteligente (score, indicadores, insígnias) | 913 |
| `JornadaPerfilCartao.tsx` | Cartão "Jornada" do perfil: contrato desde quando, grupo/folgas, disponibilidade, próximas folgas e histórico | 207 |
| `SancoesScreen.tsx` | Lista de sanções/advertências | 588 |
| `RegistrarSancaoModal.tsx` | Modal para registrar sanção | 460 |
| `FeedforwardSecao.tsx` | Seção de feedforward: orquestra (carrega, modais, remover, foto, impressão) | 263 |
| `RodadaFeedforwardItem.tsx` | Exibição de uma rodada e dos seus pontos (semáforo, revisão, prorrogação) | 287 |
| `ModalNovaRodada.tsx` | Modal de criação de uma rodada (perguntas, nota, textos, pontos com prazo, foto) | 429 |
| `feedforwardApoio.ts` | Apoio: cores do semáforo, URL da foto, seleção de imagem, rascunho e `calcularPrazoISO` | 96 |
| `ModalRevisarPonto.tsx` | Modal do ponto: revisar, prorrogar ou editar/remover | 291 |
| `ModalEditarRodada.tsx` | Modal de edição da rodada (data, nota, textos e novos pontos) | 250 |
| `EstrelasFeedforward.tsx` | Estrelas 1–5 da nota (leitura/edição, com rótulo acessível) | 48 |
| `ResumoFeedforward.tsx` | Resumo de evolução no topo da seção de feedforward | 145 |

## 4. Fluxo do usuário
1. **Lista:** abre `ColaboradoresScreen`, com busca por nome/matrícula e filtros.
   Sem `COLABORADORES_PERFIL` a lista continua navegável, mas os itens não abrem
   a ficha (a seta de avanço desaparece).
2. **Cadastrar/editar:** abre `GestaoColaboradoresScreen`; preenche matrícula,
   nome, função e turno; para função com acesso, define a **senha**. Na seção
   **Jornada** preenche a disponibilidade, o grupo (ou as folgas fixas) e, se for
   administrador, o contrato. Se algo da jornada mudou, aparece **"Vale a partir
   de"**; salvar pede confirmação, grava a vigência (`PUT /jornada`) e depois a
   ficha (`PATCH`). No cadastro novo, a jornada vai no bloco `jornada` do `POST`.
   Os avisos voltam num diálogo "Salvo com avisos".
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
| Jornada (vigente, histórico, próximas folgas) | `jornadaColaboradorService.obter(id)` | `GET /colaboradores/:id/jornada` |
| Gravar a jornada | `jornadaColaboradorService.gravar(id, input)` | `PUT /colaboradores/:id/jornada` |
| Remover uma vigência (ainda sem tela) | `jornadaColaboradorService.remover(id, vigenciaId)` | `DELETE /colaboradores/:id/jornada/:vigenciaId` |
| Perfil (exige `COLABORADORES_PERFIL`) | `colaboradoresService.perfil(...)` | `GET /colaboradores/:id/perfil` |
| Contas de acesso | `colaboradoresService.listarLogins()` | `GET /colaboradores/logins` |
| Feedforward: histórico | `feedforwardService.doColaborador(id)` | `GET /feedforward/colaborador/:colaboradorId` |
| Feedforward: nova rodada | `feedforwardService.criar(input)` | `POST /feedforward` |
| Feedforward: enviar/trocar foto | `feedforwardService.enviarFoto(id, imagem)` | `POST /feedforward/:id/foto` |
| Feedforward: revisar ponto | `feedforwardService.revisarPonto(id, status, obs?)` | `PATCH /feedforward/ponto/:pontoId/revisar` |
| Feedforward: remover rodada | `feedforwardService.remover(id)` | `DELETE /feedforward/:id` |
| Feedforward: editar rodada | `feedforwardService.editar(id, input)` | `PATCH /feedforward/:id` |
| Feedforward: novo ponto numa rodada | `feedforwardService.adicionarPonto(id, ponto)` | `POST /feedforward/:id/pontos` |
| Feedforward: editar ponto | `feedforwardService.editarPonto(id, descricao)` | `PATCH /feedforward/ponto/:pontoId` |
| Feedforward: prorrogar ponto | `feedforwardService.prorrogarPonto(id, prazo, motivo?)` | `PATCH /feedforward/ponto/:pontoId/prorrogar` |
| Feedforward: remover ponto | `feedforwardService.removerPonto(id)` | `DELETE /feedforward/ponto/:pontoId` |

Módulos do backend relacionados: [`colaboradores`](../03-atlas-backend/colaboradores.md),
[`jornada-vigencia`](../03-atlas-backend/jornada-vigencia.md) e
[`feedforward`](../03-atlas-backend/feedforward.md). Os tipos da jornada
(`VigenciaJornada`, `JornadaDoColaborador`, `JornadaInput`, `AvisoJornada`)
espelham o backend em `api/services/jornadaColaborador.ts`; o cadastro com
jornada usa `CadastroColaboradorInput`/`ColaboradorCadastrado`
(`api/services/colaboradores.ts`).

## 6. Estado local e regras de UI
- O formulário guarda os campos em memória e valida no cliente: horários no
  formato `HH:mm`, data de admissão `dd/mm/aaaa`.
- **Jornada por vigência (spec `jornada-5x2`, Fase 4).** Saíram do formulário o
  dia fixo de folga e os blocos Seg–Qui, Sex–Sáb e Domingo (são a história do
  6x1; com vigência a API recusa mudá-los). O `PATCH` não envia mais esses
  campos nem o contrato.
  - **Disponibilidade:** uma linha por dia, de segunda a domingo, com entrada e
    saída; "Copiar a primeira para todas" leva o horário de segunda aos sete
    dias. Dia vazio = sem horário (o sistema não cobra ponto).
  - **Grupo de folga:** G1/G2/G3 ou "Sem grupo". A seção **Folgas fixas** só
    aparece sem grupo; o sábado só aparece se o contrato permitir, e o limite é o
    `folgasPorSemana` do contrato (vazio = as padrão do contrato).
  - **Contrato:** chips só para quem tem `ADMIN_DADOS` (o catálogo só é carregado
    para ele); os demais veem o nome e "só o administrador troca", e o contrato
    não é enviado (a vigência herda o que já vale na data).
  - **"Vale a partir de"** aparece só quando a jornada mudou em relação à última
    vigência (ou, sem vigência, quando foi preenchida). Sugestão: 23/11/2026 para
    quem ainda está no 6x1 (data do corte) e hoje para os demais. No cadastro
    novo pode ficar vazia (vale a admissão).
  - A edição parte da **última** vigência (inclusive futura). Enquanto a jornada
    carrega, o salvar espera; se ela não carregar, a jornada não é gravada.
  - Os avisos da última vigência aparecem na seção; os da gravação, no diálogo
    final.
- `FUNCOES_COM_ACESSO = ['FISCAL','SUPERVISOR','GESTOR']`: só para essas funções
  o campo **senha** aparece e é enviado. Operador não tem acesso.
- Gestor/administrador não mostram escala/contrato/gênero (só o essencial).
- **Ficar sem folga não é neutro.** Sem grupo e sem folga fixa (nem a padrão do
  contrato), a pessoa é escalada os sete dias; o backend devolve o aviso
  `SEM_FOLGA` (não bloqueia) e a [Escala](escala.md) avisa quem está nessa
  situação.
- **Seção "Tempo de casa" (contrato de experiência):** mostra os marcos de 45 e
  90 dias, o próximo marco e, quando aplicável, "Efetivado por decurso". Na
  Fase 3 removeu-se o aviso legado de "decisão em atraso" — o ciclo é automático
  e nunca deixa marcos pendentes.
- **Seção "Feedforward"** (visível com `FEEDFORWARD_VISUALIZAR`; ações exigem
  `FEEDFORWARD_GERIR`):
  - **Tocar num ponto pendente** abre o `ModalRevisarPonto` ("Acompanhar
    ponto"), com três modos: **Revisar** (resultado "Atingido"/"Não atingido" +
    observação de até 500 caracteres), **Prorrogar** (novo prazo + motivo; o
    seletor não deixa escolher antes de `prazoMinimoProrrogacao` = o maior entre
    prazo atual + 1 e amanhã, e sugere uma semana depois disso) e **Editar**
    (corrige a descrição ou remove o ponto, com confirmação). Substituiu o
    `Alert.alert`, que **não funciona no navegador** — antes, na versão web, não
    havia como revisar um ponto.
  - **Editar rodada** pelo ícone de lápis (`ModalEditarRodada`): data, nota
    (inclusive "Sem nota"), textos (apagar limpa o campo) e **novos pontos**
    (descrição + prazo; linhas vazias são ignoradas). Os pontos existentes são
    geridos pelo modal do ponto.
  - **Resumo de evolução** no topo (`ResumoFeedforward`, só com rodadas):
    nº de rodadas, **% de atingimento** (atingidos ÷ revisados — pendente não
    conta contra), **última nota** com seta de tendência e média, pendentes
    (vencidos em vermelho), sequência das notas, última conversa ("há N dias")
    e o **próximo acompanhamento** (pendente de prazo mais próximo, com cor do
    semáforo). Cálculo puro em `utils/resumoFeedforward.ts`.
  - A rodada mostra o **cargo na data** da conversa; o ponto prorrogado mostra
    "Prorrogado Nx · prazo original … · por …" e o motivo (também no impresso).
  - Ponto revisado mostra **quem revisou, quando** e a **observação**.
  - **Remover rodada** pelo ícone de lixeira, sempre com confirmação (remove
    também os pontos e a foto vinculados).
  - **Foto da rodada já salva:** "Tirar foto" / "Da galeria" enviam ou trocam a
    foto do formulário. Resolve o caso em que a foto falhava ao criar a rodada
    e não havia como reenviá-la.
  - **Impressão / PDF** (disponível a quem visualiza): "Imprimir formulário"
    (formulário em branco, já com nome/matrícula/cargo, para o colaborador
    responder à mão), "Imprimir histórico" (capa com resumo + uma rodada por
    página; só aparece se houver rodadas) e o ícone de impressora em cada rodada
    (uma página com a foto do formulário e campos de assinatura). O HTML vem de
    `utils/relatorioFeedforward.ts`; o perfil passa `colaborador` (nome,
    matrícula, função) para o cabeçalho.

## 7. Lógica pura / utilidades
- Conversões e validações de horário/data usadas pelo formulário.
- `utils/jornadaColaborador.ts`: edição pura da jornada (ver
  [Hooks e utilidades](hooks-e-utilidades.md)).
- Rótulos de função/turno/contrato para exibição.

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `ApiError`, `notificar`, componentes de formulário/lista — ver
  [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `ColaboradoresScreen.test.tsx` | Lista, busca e navegação | 3 |
| `GestaoColaboradoresScreen.test.tsx` | Pré-preenchimento; sem os campos antigos; gravação da vigência com "copiar a primeira", grupo e data sugerida, `PATCH` sem campos legados e avisos; folgas fixas só sem grupo; horário pela metade não grava; contrato só para o administrador; cadastro novo com o bloco `jornada` | 9 |
| `PerfilColaboradorScreen.test.tsx` | Render do perfil (incidências, marcos do contrato) e cartão "Jornada" com e sem vigência | 5 |
| `FeedforwardSecao.test.tsx` | Feedforward: permissões, nova rodada (nota, textos, prazo em dias/semanas, foto com falha, erro, perguntas), revisão com observação, remoção com confirmação, foto em rodada salva, impressão, cargo, prorrogação (prazo padrão/seletor/erro), editar/remover ponto, editar rodada (campos, nota, novos pontos, falha), regras de data do modal e resumo de evolução | 42 |
| `feedforwardApoio.test.ts` | Rascunho padrão e `calcularPrazoISO` (dias/semanas/meses, quantidade inválida, data exata, virada do ano) | 5 |

## 10. Riscos, dívidas e pendências
- 🔧 `PerfilColaboradorScreen.tsx` é grande (>900 linhas); candidato a quebrar
  em componentes menores.
- ✅ `FeedforwardSecao.tsx` (antes ~1000 linhas) foi dividida: a seção só
  orquestra; exibição em `RodadaFeedforwardItem`/`ResumoFeedforward`, formulários
  em `ModalNovaRodada`/`ModalEditarRodada`/`ModalRevisarPonto` e apoio puro em
  `feedforwardApoio.ts`. Comportamento e textos mantidos (mesmos testes).
- ✅ **O cartão "Escala" virou "Jornada"** (spec `jornada-5x2`, R4.8): com
  vigência mostra contrato (desde quando), grupo ou folgas fixas, disponibilidade
  por dia, próximas folgas (14 dias) e histórico; sem vigência, a escala antiga
  da ficha. Se a jornada não carregar, fica só a escala antiga.
- 🔧 Remover uma vigência ainda não tem botão (só a API). Corrigir uma vigência é
  gravar de novo com a mesma data.
- ✅ (histórico) **O cartão "Escala" do perfil mostra o horário de DOMINGO e o grupo do
  rodízio** (ADR 0026). Antes exibia só Seg–Qui e Sex–Sáb, embora o formulário de
  edição já tivesse o horário de domingo (abaixo do grupo) — e é esse horário que
  decide **domingo e feriado** na escala. Quem consultava a ficha via dois horários
  e a escala usava um terceiro. O cartão também escreve a regra do feriado.
- ⚠️ A ficha é alcançada de **quatro** telas (Colaboradores, Escalas, Contratos e
  Jornada da equipe). Toda entrada nova precisa conferir `COLABORADORES_PERFIL`
  antes de navegar, senão abre um caminho lateral para um dado confidencial.
- ⚠️ O formulário envia a senha na promoção; depende do backend criar o login
  (corrigido — ver [`colaboradores` backend §12](../03-atlas-backend/colaboradores.md#12-riscos-dívidas-e-pendências)).
