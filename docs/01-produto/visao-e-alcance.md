> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** regras de negócio de visão e alcance do produto

# Check-out PRO — Visão e alcance

## 1. O que é o Check-out PRO

O **Check-out PRO** é um sistema de **gestão inteligente da frente de caixa de
supermercado**. Ele reúne, num único lugar, o dia a dia de quem cuida dos caixas:
o controle de pessoas, o registro de ponto e jornada, a escala de trabalho, os
indicadores de arrecadação, as vendas, o estoque de insumos, os checklists de
abertura/fechamento, a disciplina da equipe e as doações da APAE — tudo com
avisos automáticos e um assistente de IA para tirar dúvidas.

O produto é entregue em duas frentes que conversam entre si:

- um **backend** (o cérebro: regras, cálculos e a fonte única de verdade dos
  dados);
- um **aplicativo móvel** (a tela por onde a equipe opera no chão de loja).

A ideia central é simples: **transformar rotina em dados confiáveis** e, a
partir deles, **antecipar problemas** (estoque acabando, meta em risco, falta
não justificada, TAC prestes a estourar) em vez de só reagir depois que
acontecem.

## 2. Para quem é

O Check-out PRO foi desenhado para a operação de frente de caixa de um
supermercado e atende, com telas e permissões diferentes, os seguintes públicos:

- **Operadores de caixa** — são o centro da operação. Não acessam o app, mas toda
  a inteligência gira em torno do desempenho, da assiduidade e da arrecadação
  deles.
- **Fiscais de caixa** — a linha de frente: batem ponto, cuidam de insumos,
  checklists, sacolas APAE e acompanham a própria jornada.
- **Supervisores** — coordenam a operação do dia, editam escala e jornada,
  cuidam do fechamento e das requisições.
- **Gerentes** — assumem a gestão do dia a dia e o Centro de Controle (cadastro
  de pessoas, metas, contratos, relatórios).
- **Administrador (gerente desenvolvedor)** — enxerga e configura tudo, inclusive
  acessos, rodízio de domingo, tipos de contrato e limpeza de dados.
- **Importador** — um login dedicado, deixado no computador da loja, cuja única
  função é carregar os arquivos do dia.

O detalhamento de quem faz o quê está em [Perfis e permissões](perfis-e-permissoes.md).

## 3. As grandes áreas do produto

Cada área abaixo tem regras de negócio próprias, documentadas em
[Regras de negócio](regras-de-negocio/) e detalhadas módulo a módulo no
[Atlas do backend](../03-atlas-backend/).

### 3.1 Frente de caixa (Check-Outs)
Acompanha o estado físico dos caixas: registro de **avarias de equipamentos por
PDV** (com foto), tablero de caixas, alerta de problema recorrente e resolução
dos reportes. Detalhe em [`checkouts`](../03-atlas-backend/checkouts.md).

### 3.2 Pessoas (cadastro unificado e perfil inteligente)
Um cadastro único de todas as pessoas da operação (operador, fiscal, supervisor,
gestor), com identificadores, turno, escala, contrato e conta de acesso. É a base
do **Perfil Inteligente** do colaborador (score, indicadores e insígnias).
Detalhe em [`colaboradores`](../03-atlas-backend/colaboradores.md).

### 3.3 Ponto e jornada
O **Relógio de Ponto** por leitura do comprovante (a hora que vale é a do
comprovante), o cálculo da jornada com horas extras 50%/100%, o controle de
**TAC**, a detecção automática de faltas e não-retornos e o portal gerencial que
consolida tudo no **ciclo de folha 26→25**. Regras em
[Ponto, jornada e TAC](regras-de-negocio/ponto-jornada-e-tac.md).

### 3.4 Escala e rodízio de domingo
A escala semanal por turno e o **rodízio de domingo 2x1** entre os grupos
G1/G2/G3 (dois trabalham, um folga). Regras em
[Escala e rodízio de domingo](regras-de-negocio/escala-e-rodizio-domingo.md).

### 3.5 Indicadores e arrecadação
A importação dos arquivos de **troco solidário, recargas, cancelamentos e
devoluções** por operador, os totais, o ranking, as metas mensais e a camada de
inteligência (tendência, projeção, **destaques do mês** e anomalias). Regras em
[Arrecadação e indicadores](regras-de-negocio/arrecadacao-e-indicadores.md).

### 3.6 Vendas
A importação das **vendas por hora** (Painel de Vendas), que alimenta os
percentuais dos indicadores e gera análises inteligentes (projeção, curva
horária, heatmap, avisos de recorde/queda/meta em risco). Detalhe em
[`vendas`](../03-atlas-backend/vendas.md).

### 3.7 Estoque e insumos
O almoxarifado da operação: saldo por movimentos, retirada de **fardos** de
sacolas, consumo de bobinas, **pedidos recorrentes** inteligentes e o fluxo de
**requisições** (fiscal solicita, gestor aprova). Regras em
[Estoque, insumos e requisições](regras-de-negocio/estoque-insumos-e-requisicoes.md).

### 3.8 Checklists e fechamento do dia
Os **checklists de abertura e fechamento comprovados por foto**, com janelas
fixas e controle de pontualidade, e o **fechamento operacional do dia** (todos os
arquivos resolvidos + vendas). Regras em
[Checklist e fechamento](regras-de-negocio/checklist-e-fechamento.md).

### 3.9 Contratos
O **contrato de experiência (45 + 45 dias)** dos operadores, com estado sempre
derivado da admissão e das decisões, e o catálogo **data-driven** de tipos de
contrato de jornada. Regras em
[Contratos e jornada](regras-de-negocio/contratos-e-jornada.md).

### 3.10 Disciplina e feedforward
As **incidências de escala**, a disciplina progressiva (advertência → suspensão),
as **solicitações automáticas de advertência** por falta não justificada e o
**feedforward** (acompanhamento prospectivo de desenvolvimento). Regras em
[Disciplina e feedforward](regras-de-negocio/disciplina-e-feedforward.md).

### 3.11 APAE
O ciclo das **Sacolas APAE**: lote recebido, venda que reverte em arrecadação,
encerramento automático ao zerar o saldo e painel de análises. Regras em
[APAE](regras-de-negocio/apae.md).

### 3.12 Notificações
O serviço **transversal** de avisos, em duplo canal (push + in-app) e em tempo
real, que respeita a Central de Permissões para decidir quem recebe cada aviso.
Detalhe em [`notificacoes`](../03-atlas-backend/notificacoes.md).

### 3.13 Assistente Cluby
A **"Cluby"**, um assistente de IA em chat flutuante que ajuda a equipe em gestão
de supermercado, respondendo com base em conhecimento geral e no **contexto real
da loja** (escala, indicadores, APAE e vendas). A conversa é isolada por usuário
e efêmera (24h). Detalhe em [`assistente`](../03-atlas-backend/assistente.md).

## 4. Princípios de produto

Estes princípios atravessam todas as áreas e explicam muitas das regras de
negócio:

1. **Fonte única de verdade.** Cada dado tem um dono claro (o cadastro é a fonte
   da escala; o saldo é a soma dos movimentos; o estado do contrato é sempre
   derivado). Nada é duplicado sem necessidade.
2. **Antecipar, não só reagir.** O sistema avisa antes: TAC próximo, estoque em
   ruptura, meta em risco, contrato prestes a vencer, prazo de feedforward
   vencido.
3. **Comprovação por foto.** Checklists e feedforward exigem imagem válida, com
   detecção de foto repetida como barreira anti-fraude.
4. **Decisão humana sobre o automático.** O sistema sugere (solicitação de
   advertência, pedido recorrente, entrada por requisição), mas quem confirma é o
   gestor.
5. **Nada quebra por causa de um aviso.** As notificações são *best-effort*:
   uma falha ao avisar nunca derruba a operação principal.
6. **Português padrão (Brasil), sempre.** Toda a interface e a documentação são
   em pt-BR.

## 5. Fora do escopo (limites do produto)

Para deixar claro o alcance, o Check-out PRO **não**:

- é um sistema de PDV/frente de caixa transacional (ele **consome** os arquivos
  gerados pelo sistema da loja: vendas por hora e arrecadação por operador);
- é uma folha de pagamento (ele **apura** a jornada do ciclo 26→25 para revisão,
  mas o cálculo e o pagamento em si ficam fora);
- substitui o RH formal (o **contrato de experiência** e as **sanções** são
  registros operacionais de apoio à gestão, não peças jurídicas);
- faz a entrega física de push nos aparelhos (delega ao serviço de push).

## 6. Onde aprofundar

- Perfis e a matriz de acesso: [Perfis e permissões](perfis-e-permissoes.md).
- Regras por tema: [Regras de negócio](regras-de-negocio/).
- Detalhe técnico módulo a módulo: [Atlas do backend](../03-atlas-backend/).
- Números do projeto (linhas, testes, rotas, tabelas): fonte única em
  [Estado e métricas](../08-gestao/estado-e-metricas.md).
