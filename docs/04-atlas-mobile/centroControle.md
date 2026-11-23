> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-11-22 · **Cobre:** `mobile/src/screens/centroControle/`

# Área: `centroControle`

## 1. Propósito
**Centro de Controle** — o hub de gestão do app: uma tela-índice com atalhos
para as ferramentas de administração (colaboradores, metas, rodízio de folgas,
painel de vendas, central de vendas, check-outs, relatórios, acesso,
permissões, importações, produtos pesados, tipos de contrato, insumos e o
reinício de dados operacionais).

> **Painel de Vendas (2026-10-09):** saiu **temporariamente** dos "Acessos
> rápidos" da Home (marca `ocultoNaHome` em `navigation/areas` — ver
> [navegação §5.1](navegacao.md)) e passou a ter um card aqui, logo antes da
> Central de Vendas. As descrições dos dois cards deixam clara a diferença: o
> **Painel** *acompanha o vendido* (dia, acumulado do mês e meta); a **Central**
> *planeja as estimativas* por dia (cuja soma é a meta).

> **Como se chega:** pelo botão discreto **"Central"** no cabeçalho da tela
> inicial, ao lado da identidade do usuário. O hub saiu dos "Acessos rápidos"
> (é gestão de uso pontual e ocupava espaço nobre da grade); a rota e a permissão
> continuam as mesmas — ver [navegação §5.1](navegacao.md).

## 2. Quem usa (perfis)
- **Gestão** (`OPERADORES_CRUD`): vê o hub e a maioria dos cards.
- Cada card pode exigir uma funcionalidade extra (ex.: `ADMIN_DADOS`,
  `USUARIOS_CRUD`, `PERMISSOES_GERENCIAR`, `ESCALA_DOMINGO_CONFIG`,
  `IMPORTACOES`); os cards sem permissão não aparecem.
- **Painel de Vendas** exige `PAINEL_VENDAS_VISUALIZAR` (a mesma permissão da
  rota). ⚠️ O **supervisor** tem essa permissão, mas **não** abre o Centro de
  Controle (`OPERADORES_CRUD`); enquanto o painel estiver fora da Home, ele chega
  ao painel apenas pelos caminhos indiretos (cartão "Vendas do mês" em
  Indicadores e notificações de vendas). Decisão de produto consciente.
- **Relatórios** exige `COLABORADORES_PERFIL`: o PDF é montado a partir da ficha
  individual de cada operador, que é dado confidencial — ver
  [`colaboradores`](colaboradores.md).
- Ver [Perfis e permissões](../01-produto/perfis-e-permissoes.md).

## 3. Telas e arquivos
| Arquivo | Papel | Linhas |
|---|---|---|
| `CentroControleScreen.tsx` | Hub/índice de atalhos de gestão | 201 |
| `CentralVendasScreen.tsx` | Estimativas de venda por dia do mês (a soma é a meta do mês) | 237 |
| `ConfigEscalaDomingoScreen.tsx` | Rodízio de domingo do 6x1 (G1/G2/G3); sem atalho desde a Fase 3 do spec `jornada-5x2` | 268 |
| `RodizioFolgasScreen.tsx` | Rodízio de folgas do 5x2: tabela grupo × semana, conferência (avisos e prévia) e vigências | 495 |
| `RodizioFolgasScreen.test.tsx` | Abre a vigência em vigor, limites de 2 dias/sábado, conferir sem salvar, salvar com confirmação | 143 |
| `TiposContratoScreen.tsx` | CRUD dos tipos de contrato de jornada, trava de regras em uso, duplicar e tornar padrão | 822 |
| `InsumosDadosScreen.tsx` | Zerar estoque de insumos e limpar requisições | 214 |
| `ReiniciarDadosScreen.tsx` | Reinício operacional (apaga dados de movimento) | 196 |
| `CentroControleScreen.test.tsx` | Testes de visibilidade do card de reinício | 44 |
| `ReiniciarDadosScreen.test.tsx` | Testes da confirmação "ZERAR" | 58 |

## 4. Fluxo do usuário
1. **Hub:** `CentroControleScreen` monta os cards a partir de uma lista fixa
   (`ITENS`) e filtra por `podeAcessar(funcionalidade)`. Tocar em um card navega
   para a rota correspondente (algumas telas vivem em outras áreas, ex.: Metas,
   Relatórios, Importações, Check-Outs, **Painel de Vendas** — tela da área
   [`indicadores`](indicadores.md) —, **Produtos pesados** — cuja carga do
   arquivo `.txt` é feita pela tela `ProdutosPesadosCarga`, ver
   [`produtosPesados`](produtosPesados.md)).
2. **Central de Vendas:** escolhe o mês, digita a estimativa por dia e salva; o
   topo mostra a estimativa do mês (soma ao vivo das diárias). **Esse total é a
   meta do mês** — esta tela é o único lugar que a define (ver
   [ADR 0017](../02-arquitetura/decisoes/0017-meta-de-vendas-derivada-das-estimativas.md)).
3. **Rodízio de folgas** (spec `jornada-5x2`, Fase 3,
   [ADR 0028](../02-arquitetura/decisoes/0028-rodizio-de-folgas-5x2.md)): abre a
   vigência em vigor (ou a última); edita a data de início (uma segunda-feira), as
   semanas do ciclo (1 a 6) e, para G1, G2 e G3, os 2 dias de folga de cada semana
   em chips de segunda a domingo (o sábado fica apagado). **Conferir** chama a
   simulação do backend e mostra avisos e prévia sem gravar; **Salvar rodízio**
   pede confirmação e grava a vigência. A lista "Vigências" abre as anteriores e
   "Nova vigência" começa uma a partir da atual. A prévia mostra, dia a dia, o grupo
   que folga; antes do primeiro rodízio, só os domingos do rodízio antigo.
   O card substitui o do **rodízio de domingo**, que segue valendo só para os dias
   do 6x1; a tela antiga continua registrada na navegação, sem atalho, até a
   limpeza (Fase 7).
4. **Tipos de contrato:** cria/edita/ativa/desativa/remove/duplica contratos de
   jornada, tudo em minutos (spec `jornada-5x2`, Fase 2):
   - carga por dia e **carga do feriado**; "Dias com adicional de 100%" com o
     chip **Feriado**;
   - intervalos, limite de extras, **1º e 2º aviso** (os campos
     `riscoTac1h30Min`/`riscoTac1h40Min` da API) e **limite de horas no dia**
     (vazio = sem teto);
   - **folgas por semana**, **folgas padrão** (para quem não tem grupo; dias de
     segunda a domingo) e **permite folga no sábado** (sem ele, o chip do sábado
     fica apagado);
   - "Trabalha domingo (rodízio)" aparece só ao editar um contrato existente
     (regime 6x1); um contrato novo não o mostra.

   Um contrato **em uso** (selo "Em uso") abre com as regras **travadas** e um
   aviso: só nome e descrição mudam, e salvar envia só esses dois campos. A ação
   **Duplicar** cria a cópia inativa e já a abre para editar; **Tornar padrão**
   pede confirmação (o backend recusa enquanto houver batida sem ficha). Remover
   não aparece para contrato em uso.
5. **Insumos (dados):** zera o estoque de um insumo, de todos, ou limpa o
   histórico de requisições — cada ação pede confirmação.
6. **Conferência de escala:** abre o diagnóstico das fichas dos fiscais
   (`OPERADORES_CRUD`, só leitura) — quem está **sem horário**, sem horário de
   domingo ou sem dia de folga e, por isso, fica fora do controle de ponto. Desde a
   ADR 0026 o horário cobrado é o da ficha, então uma lacuna nela não é mais coberta
   por nada. A tela vive na área de [Escala](escala.md); aqui é apenas o atalho. Ver
   [ADR 0026](../02-arquitetura/decisoes/0026-horario-e-o-da-ficha.md).
7. **Zerar dados operacionais:** exige digitar `ZERAR` e confirmar; ao concluir,
   mostra o resumo com a contagem apagada por entidade (hoje 16 entidades de
   movimento — os lotes de sacolas saíram do plano com a remoção da área APAE).
Cada tela de dados trata os estados **carregando / erro / vazio**.

## 5. Dados e integração com o backend
| Ação na tela | Chamada | Endpoint |
|---|---|---|
| Estimativas do mês | `vendasService.listarEstimativas(anoMes)` | `GET /vendas/estimativas` |
| Salvar estimativas | `vendasService.definirEstimativas(anoMes, dias)` | `PUT /vendas/estimativas` |
| Ler rodízio de domingo | `configSistemaService.obterEscalaDomingo()` | `GET /config/escala-domingo` |
| Ler rodízio de folgas | `rodizioFolgasService.obter()` | `GET /config/rodizio-folgas` |
| Conferir rodízio | `rodizioFolgasService.simular(input)` | `POST /config/rodizio-folgas/simular` |
| Salvar rodízio | `rodizioFolgasService.definir(input)` | `PUT /config/rodizio-folgas` |
| Salvar rodízio | `configSistemaService.definirEscalaDomingo(...)` | `PUT /config/escala-domingo` |
| Listar contratos | `tiposContratoService.listar(true)` | `GET /tipos-contrato` |
| Criar contrato | `tiposContratoService.criar(input)` | `POST /tipos-contrato` |
| Editar contrato | `tiposContratoService.atualizar(id, input)` | `PATCH /tipos-contrato/:id` |
| Ativar/desativar | `tiposContratoService.definirAtivo(id, ativo)` | `PATCH /tipos-contrato/:id/ativo` |
| Remover contrato | `tiposContratoService.remover(id)` | `DELETE /tipos-contrato/:id` |
| Duplicar contrato | `tiposContratoService.duplicar(id)` | `POST /tipos-contrato/:id/duplicar` |
| Tornar padrão | `tiposContratoService.definirPadrao(id)` | `PATCH /tipos-contrato/:id/padrao` |
| Insumos proativos | `insumosService.listarProativo()` | `GET /insumos/proativo` |
| Zerar 1 insumo | `insumosService.zerarEstoqueInsumo(id)` | `DELETE /insumos/:id/movimentos` |
| Zerar todos | `insumosService.zerarEstoque()` | `DELETE /insumos/movimentos` |
| Limpar requisições | `requisicoesService.limparTodas()` | `DELETE /requisicoes` |
| Reinício operacional | `adminService.zerarDados({confirmacao:'ZERAR'})` | `POST /admin/reset-operacional` |

Módulos do backend relacionados:
[`vendas`](../03-atlas-backend/vendas.md),
[`escala-domingo`](../03-atlas-backend/escala-domingo.md),
[`tipos-contrato`](../03-atlas-backend/tipos-contrato.md),
[`insumos`](../03-atlas-backend/insumos.md),
[`requisicoes`](../03-atlas-backend/requisicoes.md) e
[`reset-operacional`](../03-atlas-backend/reset-operacional.md).

## 6. Estado local e regras de UI
- O hub monta os cards de uma lista fixa e só exibe os que `podeAcessar` libera.
- **Central de Vendas:** guarda os valores digitados por data (mapa iso→texto),
  com máscara de milhar; a estimativa do mês é a soma ao vivo das diárias e
  equivale à meta do mês (o backend calcula o mesmo total com a função pura
  `metaDeEstimativas`). Salvar aqui **altera a meta** do Painel de Vendas, o
  Resumo do Dia e o aviso de "meta em risco".
- **Rodízio de folgas:** antes de conferir/salvar, exige data de início numa
  segunda e exatamente 2 dias por semana em cada grupo (`pendenciasDoRodizio`); um
  terceiro dia e o sábado não entram (`alternarFolga`). O backend valida de novo.
- **Rodízio de domingo:** valida que a data de referência é um domingo e que os
  3 grupos (G1/G2/G3) foram escolhidos sem repetição antes de salvar.
- **Tipos de contrato:** valida nome obrigatório, `intervalo mínimo < máximo`, a
  ordem `1º aviso ≤ 2º aviso ≤ limite de extras`, 1 a 3 folgas por semana, folgas
  padrão no máximo as folgas por semana e limite de horas no dia vazio ou maior
  que zero (o backend valida de novo); o contrato **padrão** não pode ser
  desativado nem removido.
- **Reiniciar dados:** o botão só habilita quando o texto digitado é `ZERAR`
  (validação também exigida pelo backend); depois exibe o resumo por entidade.

## 7. Lógica pura / utilidades
- Central de Vendas: `mesAtual`, `deslocarMes`, `rotuloMes`, `diasDoMes`,
  `parseValor`.
- Rodízio de domingo: `gruposQueTrabalham`, `diaMes`, `isoMaisDiasDiaMes`.
- Rodízio de folgas (`utils/rodizioFolgas.ts`): `PADRAO_5X2`, `comSemanas`,
  `alternarFolga`, `pendenciasDoRodizio`, `textoFolgas`, `copiarPadrao`.
- Tipos de contrato: `formVazio` (contrato novo com 2 folgas por semana e
  feriado de 7h20 a 100%), `formDe`, `inteiro`, `digitos`, `hhmm` (minutos →
  "7h").
- Reinício: `rotuloEntidade` (rótulos pt-BR das tabelas do resumo).

## 8. Componentes e hooks compartilhados usados
- `useRequisicao` (carregamento com estados) — ver [Hooks e utilidades](hooks-e-utilidades.md).
- `useAuth` (`podeAcessar`), `Tela`, `Cartao`, `Botao`, `CampoTexto`, `Aviso`,
  `Selo`, `EstadoVazio`, `Carregando`, `MensagemErro`, `ApiError`, `notificar`,
  `confirmar` — ver [Componentes compartilhados](componentes-compartilhados.md).

## 9. Testes
| Arquivo de teste | O que valida | Casos |
|---|---|---|
| `CentroControleScreen.test.tsx` | Card de reinício só com `ADMIN_DADOS` | 2 |
| `ReiniciarDadosScreen.test.tsx` | Exige "ZERAR" e mostra o resumo | 2 |
| `RodizioFolgasScreen.test.tsx` | Abre a vigência em vigor; não marca terceiro dia nem sábado; não confere incompleto; confere sem salvar (avisos e prévia); salva após confirmar | 4 |

## 10. Riscos, dívidas e pendências
- 🔧 `TiposContratoScreen.tsx` é grande (822 linhas), com formulário extenso;
  candidato a quebrar em componentes/seções menores.
- ⚠ A trava de contrato em uso na tela é conforto: quem decide é o backend (409).
  O APK antigo ainda mostra os campos antigos e reenvia todos; o backend aceita
  quando os valores não mudam.
- ⚠️ Várias ações são **irreversíveis** (zerar estoque, limpar requisições,
  reinício operacional). A confirmação por diálogo e a palavra `ZERAR` mitigam,
  mas a proteção real fica no backend.
- 📝 Os cards do hub apontam para rotas de outras áreas; manter a lista `ITENS`
  em sincronia com as rotas registradas em `AppNavigator`.
- 🟡 O card **Painel de Vendas** existe aqui porque a área está `ocultoNaHome`.
  Ao devolver o painel à Home, decidir se o card permanece (atalho duplicado) ou
  sai.
