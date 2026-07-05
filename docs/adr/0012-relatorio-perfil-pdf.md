# ADR 0012 — Relatório de perfil do operador em PDF (geração no cliente)

- **Status:** Aceito
- **Contexto:** O gestor quer **imprimir** semanalmente o perfil de cada
  operador (uma folha A4 por pessoa) com as estatísticas que já aparecem na tela
  — score, indicadores, faltas, incidências e os gráficos (barras + pizza). Os
  dados já são calculados pelo backend em `GET /colaboradores/:id/perfil` (aceita
  `inicio`/`fim`). Precisamos escolher **onde** gerar o PDF. O envio automático
  por e-mail foi explicitamente adiado.
- **Decisão:** Gerar o relatório **no cliente** (app/web) a partir de **HTML +
  SVG**, imprimindo/salvando via **`expo-print`** (`printAsync`), que funciona na
  web (diálogo do navegador → "Salvar como PDF") e no nativo (folha de impressão
  do sistema).
  - Lógica **pura e testada** em `utils/relatorioPerfil.ts`: cálculo da semana
    corrente, gráficos de **barras** e **pizza (rosca)** replicados como SVG
    inline (espelho de `GraficoBarrasVerticais`/`GraficoPizza`), montagem do HTML
    de cada operador e do documento A4 (um por página via `page-break-after`).
  - Tela **Relatórios** (no Centro de Controle): período **semana atual** (padrão)
    ou **intervalo** personalizado; **baixar todos** os operadores ativos de uma
    vez e **baixar individual** por operador. Reusa o endpoint de perfil (uma
    chamada por operador).
  - **Alcance:** apenas operadores ativos.
- **Consequências:**
  - ✅ Zero mudança de backend e **sem Chromium/puppeteer** (importante no plano
    gratuito do Render).
  - ✅ Gráficos idênticos aos da tela (mesma paleta/estilo), impressão A4 fiel.
  - ✅ O núcleo (HTML/SVG/semana) é determinístico e coberto por testes.
  - ⚠️ Na web, "baixar" é via o diálogo de impressão (salvar como PDF) — natural
    para o caso de **imprimir**. Um download silencioso de arquivo exigiria uma
    lib de PDF no cliente ou geração no backend.
  - ⚠️ "Baixar todos" faz **N** chamadas ao perfil (uma por operador). Aceitável
    para uma ação manual semanal; se crescer muito, criar um endpoint em lote.
  - 🔜 **E-mail automático (adiado):** quando for feito, o backend poderá montar o
    mesmo relatório (ou reusar o HTML) e enviar; exige configurar SMTP.
