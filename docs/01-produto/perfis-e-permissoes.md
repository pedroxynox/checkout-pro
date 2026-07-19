> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio de perfis e permissões

# Perfis e permissões

Este documento descreve **quem é cada perfil** do Check-out PRO e **o que cada um
acessa**, com uma matriz de funcionalidades por perfil.

> **Fonte de verdade.** O catálogo de funcionalidades e o mapa por perfil vivem
> no código, em `backend/src/acessos/acessos.domain.ts` (a autorização que vale
> de verdade, aplicada pelos guards do backend) e são **espelhados** no app em
> `mobile/src/auth/funcionalidades.ts` (que decide apenas o que aparece na tela).
> O detalhe técnico está em [`acessos`](../03-atlas-backend/acessos.md). Se este
> documento divergir do código, **o código prevalece**.

## 1. Os perfis

O sistema tem cinco perfis de acesso (enum `Perfil`):

| Perfil | Quem é | Em uma frase |
|---|---|---|
| **ADMINISTRADOR** | O "gerente desenvolvedor" | Enxerga e executa **absolutamente tudo**, inclusive funcionalidades futuras. |
| **GERENTE** | Gestão da loja | Operação e gestão do dia a dia + Centro de Controle (cadastro, metas, relatórios). |
| **SUPERVISOR** | Coordenação da operação | Tudo do fiscal + fechamento, edição de escala/jornada e Central de Jornada. |
| **FISCAL** | Linha de frente | Rotina diária: ponto, insumos, checklist, APAE, indicadores e comunicação. |
| **IMPORTADOR** | Login dedicado da loja | Só carrega os arquivos do dia (Importações); não vê mais nada. |

### 1.1 O "gerente desenvolvedor" e o perfil ADMINISTRADOR

Na prática, o perfil **ADMINISTRADOR** é o do **gerente desenvolvedor**: o acesso
total ao sistema. Ele é tratado de forma especial no código — a autorização o
libera **sem consultar lista**, de modo que qualquer funcionalidade nova entra
automaticamente no seu escopo. Além disso, o administrador é **imutável** na
Central de Permissões (não pode ter permissões ajustadas).

Existe também a distinção na hora de **cadastrar pessoas**: só o gerente
desenvolvedor pode conceder acesso de nível gerencial a alguém (barra a escalada
de privilégios). Ver a regra `perfilDaFuncao`/`validarPermissaoDeFuncao` em
[`colaboradores`](../03-atlas-backend/colaboradores.md).

### 1.2 Como o perfil nasce do cadastro

O perfil de acesso é derivado da **função** do colaborador no cadastro unificado:

- `OPERADOR` → **sem acesso ao app** (não tem login);
- `FISCAL` → **FISCAL**;
- `SUPERVISOR` → **SUPERVISOR**;
- `GESTOR` → **GERENTE** ou **ADMINISTRADOR** (só o gerente desenvolvedor concede).

O **IMPORTADOR** é um login dedicado, não vinculado a uma pessoa da operação.

## 2. Matriz de funcionalidades por perfil

Legenda: ✅ = liberado por padrão · — = não liberado · 🔒 = protegida (exclusiva
do administrador e **não ajustável** pela Central de Permissões).

O **ADMINISTRADOR** tem acesso a **todas** as funcionalidades (coluna sempre ✅) —
inclusive as que surgirem no futuro — por isso não é repetido linha a linha nas
observações.

### 2.1 Carga e fechamento do dia

| Funcionalidade | ADMIN | GERENTE | SUPERVISOR | FISCAL | IMPORTADOR |
|---|:---:|:---:|:---:|:---:|:---:|
| `IMPORTACOES` — carregar arquivos do dia 🔒 | ✅ | — | — | — | ✅ |
| `FECHAMENTO` — resumo/fechamento do dia | ✅ | ✅ | ✅ | — | — |
| `CARGA_STATUS_VISUALIZAR` — ler status da carga (sem menu) 🔒 | ✅ | — | — | ✅ | — |

> `IMPORTACOES` é protegida, mas é justamente a **única** função do IMPORTADOR
> (login dedicado). `CARGA_STATUS_VISUALIZAR` é uma leitura interna que dá ao
> Briefing do fiscal a mesma nota de saúde dos gestores, sem abrir seções no menu.

### 2.2 Indicadores e vendas

| Funcionalidade | ADMIN | GERENTE | SUPERVISOR | FISCAL | IMPORTADOR |
|---|:---:|:---:|:---:|:---:|:---:|
| `INDICADORES_VISUALIZAR` | ✅ | ✅ | ✅ | ✅ | — |
| `INDICADOR_QUEBRA` | ✅ | ✅ | ✅ | ✅ | — |
| `PAINEL_VENDAS_VISUALIZAR` | ✅ | ✅ | ✅ | — | — |
| `PAINEL_VENDAS_EDITAR` | ✅ | ✅ | — | — | — |

### 2.3 Ponto, jornada e escala

| Funcionalidade | ADMIN | GERENTE | SUPERVISOR | FISCAL | IMPORTADOR |
|---|:---:|:---:|:---:|:---:|:---:|
| `PONTO_REGISTRAR` — registrar batidas novas | ✅ | ✅ | ✅ | ✅ | — |
| `PONTO_VISUALIZAR` — ver o painel de jornada | ✅ | ✅ | ✅ | ✅ | — |
| `PONTO_EDITAR` — corrigir/remover batidas | ✅ | ✅ | ✅ | — | — |
| `FISCAIS_STATUS` — painel de status dos fiscais | ✅ | ✅ | ✅ | ✅ | — |
| `FISCAIS_JORNADA` — log de jornada da equipe | ✅ | ✅ | ✅ | ✅ | — |
| `CENTRAL_JORNADA` — portal do ciclo de folha 26→25 | ✅ | ✅ | ✅ | — | — |
| `ESCALA_VISUALIZAR` | ✅ | ✅ | ✅ | ✅ | — |
| `ESCALA_EDITAR` | ✅ | ✅ | ✅ | — | — |
| `ESCALA_DOMINGO_CONFIG` — rodízio de domingo 🔒 | ✅ | — | — | — | — |

### 2.4 Operação diária

| Funcionalidade | ADMIN | GERENTE | SUPERVISOR | FISCAL | IMPORTADOR |
|---|:---:|:---:|:---:|:---:|:---:|
| `CHECKLIST` — checklists por foto | ✅ | ✅ | ✅ | ✅ | — |
| `INSUMOS` — almoxarifado (ver/consumir) | ✅ | ✅ | ✅ | ✅ | — |
| `INSUMOS_GERENCIAR` — entradas/pedidos/requisições | ✅ | ✅ | ✅ | — | — |
| `CHECKOUTS` — reportar avarias por caixa | ✅ | ✅ | ✅ | ✅ | — |
| `CHECKOUTS_GERENCIAR` — resolver avarias | ✅ | ✅ | ✅ | — | — |
| `LOTE_APAE` — sacolas APAE (ver/atualizar saldo) | ✅ | ✅ | — | ✅ | — |
| `LOTE_APAE_GERENCIAR` — abrir/reiniciar/config APAE | ✅ | ✅ | — | — | — |

### 2.5 Pessoas, disciplina e desenvolvimento

| Funcionalidade | ADMIN | GERENTE | SUPERVISOR | FISCAL | IMPORTADOR |
|---|:---:|:---:|:---:|:---:|:---:|
| `OPERADORES_AUSENCIAS` — ver ausências/incidências | ✅ | ✅ | ✅ | ✅ | — |
| `OPERADORES_CRUD` — cadastro de colaboradores/metas | ✅ | ✅ | — | — | — |
| `ADVERTENCIAS_DECIDIR` — decidir solicitações de advertência | ✅ | ✅ | ✅ | — | — |
| `CONTRATOS_VISUALIZAR` — carteira de contratos | ✅ | ✅ | ✅ | — | — |
| `CONTRATOS_GERIR` — admissão e decisões de marco | ✅ | ✅ | — | — | — |
| `FEEDFORWARD_VISUALIZAR` | ✅ | ✅ | ✅ | — | — |
| `FEEDFORWARD_GERIR` | ✅ | ✅ | ✅ | — | — |
| `USUARIOS_CRUD` — definir contas de acesso 🔒 | ✅ | — | — | — | — |

### 2.6 Comunicação e administração

| Funcionalidade | ADMIN | GERENTE | SUPERVISOR | FISCAL | IMPORTADOR |
|---|:---:|:---:|:---:|:---:|:---:|
| `NOTIFICACOES` — histórico e push | ✅ | ✅ | ✅ | ✅ | — |
| `ALERTAS_FILA` — fila de alertas *(em construção)* | ✅ | ✅ | ✅ | ✅ | — |
| `NORMATIVAS` — normativas *(em construção)* | ✅ | ✅ | ✅ | ✅ | — |
| `PERMISSOES_GERENCIAR` — Central de Permissões 🔒 | ✅ | — | — | — | — |
| `ADMIN_DADOS` — zerar/limpar dados, tipos de contrato 🔒 | ✅ | — | — | — | — |

> O **assistente Cluby** não usa `@Funcionalidade`: fica disponível a **qualquer
> usuário autenticado**, com a conversa isolada por usuário. Ver
> [`assistente`](../03-atlas-backend/assistente.md).

## 3. Como a autorização funciona (resumo)

1. **O perfil define o padrão.** Cada perfil tem um conjunto de funcionalidades
   liberadas por padrão (as tabelas acima). O **fiscal** é o conjunto base; o
   **supervisor** é "fiscal + fechamento/edição de jornada/Central de Jornada"; o
   **gerente** acrescenta o Centro de Controle; o **administrador** vê tudo; o
   **importador** só importa.
2. **Ajustes por perfil e por login.** A Central de Permissões permite desviar do
   padrão em duas camadas — por perfil e por login individual.
3. **Precedência.** Ajuste por **login** vence o ajuste por **perfil**, que vence
   o **padrão de código**.
4. **Protegidas são intocáveis.** As funcionalidades 🔒 (`USUARIOS_CRUD`,
   `ADMIN_DADOS`, `ESCALA_DOMINGO_CONFIG`, `IMPORTACOES`, `PERMISSOES_GERENCIAR`,
   `CARGA_STATUS_VISUALIZAR`) **nunca** são concedidas por ajuste — barra a
   escalada de privilégios.
5. **O administrador é imutável.** Não é ajustável na Central de Permissões.

## 4. Central de Permissões

A **Central de Permissões** (Centro de Controle) é de uso **exclusivo do
administrador** (`PERMISSOES_GERENCIAR`) e permite ajustar as permissões **por
login** e **por perfil** como desvios do padrão do código, com:

- **três camadas** (código → ajuste de perfil → ajuste por login), guardando
  **apenas os desvios** (nada é duplicado do padrão);
- **perfis ajustáveis** apenas `FISCAL`, `SUPERVISOR` e `GERENTE` (o
  ADMINISTRADOR e o IMPORTADOR não são ajustáveis);
- **trilha de auditoria** de cada mudança;
- **invalidação de sessão** dos afetados (as novas permissões passam a valer na
  próxima entrada);
- e a garantia de que **funcionalidades protegidas e o administrador** nunca são
  alterados.

O detalhe técnico (endpoints, auditoria, invalidação de sessão) está em
[Central de Permissões — `permissoes`](../03-atlas-backend/permissoes.md).

## 5. Referências

- Catálogo e regras de decisão: [`acessos`](../03-atlas-backend/acessos.md).
- Ajustes por login/perfil: [`permissoes`](../03-atlas-backend/permissoes.md).
- Origem do perfil a partir do cadastro:
  [`colaboradores`](../03-atlas-backend/colaboradores.md).
- Quem recebe notificações por permissão:
  [`notificacoes`](../03-atlas-backend/notificacoes.md).
