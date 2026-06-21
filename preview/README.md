# Protótipo Visual — Gestão de Frente de Caixa (Check-out PRO)

Este diretório contém um **protótipo visual navegável** do aplicativo móvel
**Gestão de Frente de Caixa — Check-out PRO**.

## O que é

- Um único arquivo **`index.html`**, totalmente autocontido (CSS e JavaScript embutidos).
- **Sem build, sem dependências externas, sem rede / CDN** — basta abrir o arquivo
  em qualquer navegador (de preferência em visualização mobile / largura ~430px).
- Layout **mobile-first**, em **Português do Brasil**, com a marca **Check-out PRO**
  (cor primária `#0B5FFF`).

## Importante: dados de exemplo

Este é um **mock somente de front-end**, para fins de preview.
**Não há backend nem dados reais.** Todos os nomes e números são **fictícios**
(ex.: "Ana Souza", "Bruno Lima", "Carla Dias"). Os nomes reais da equipe definidos
na especificação **não** são utilizados aqui.

## Como abrir

Abra `preview/index.html` diretamente no navegador. Nenhuma instalação é necessária.

## Telas incluídas

1. **Login** (qualquer login/senha funciona) → botão **Entrar**
2. **Home** — grade de áreas, alternância de perfil **Gerente/Fiscal** e **toggle Offline**
   (banner laranja + badge de ações pendentes). Fiscal vê apenas áreas operacionais;
   Gerente vê tudo (incl. Painel de Vendas e Operadores).
3. **Indicadores** — cards com semáforo (🟢/🟡/🔴) e ranking de exemplo
4. **Painel de Vendas** — acumulados dia/semana/mês + informar venda
5. **Lote APAE** — quantidade inicial, saldo, % vendido e reiniciar (visual)
6. **Insumos** — saldo, alerta de estoque baixo e **Bipar fardo** (com fila offline)
7. **Fiscais (tempo real)** — chips de status e alterar meu status (com fila offline)
8. **Escala** — seletor de dia da semana + tabela e folgas
9. **Checklist** — Abertura/Fechamento com janelas e **Enviar imagem** → "Feito"
10. **Operadores** — lista + contagem por turno
11. **Notificações** — lista de avisos in-app

O **modo offline** afeta visivelmente Home, Fiscais e Insumos (banner e mensagens enfileiradas).

---
Protótipo visual — dados de exemplo. App real: Gestão de Frente de Caixa — Check-out PRO.
