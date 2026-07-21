<!-- ⚙️ GERADO AUTOMATICAMENTE por scripts/gerar-docs.mjs — NÃO EDITE À MÃO.
     Para atualizar, rode `npm run docs:gen` e faça commit do resultado. -->

# Catálogo de Testes

> Todos os arquivos de teste automatizado e quantos casos cada um cobre.
>
> **Backend:** 100 arquivos, 626 casos. **Mobile:** 25 arquivos, 99 casos. **Total: 725 casos.**
>
> _A contagem é por chamadas literais de `it()`/`test()` no código (determinística). Testes parametrizados (`it.each`/`test.each`) expandem em mais casos na execução do Jest, então o número reportado pelo Jest pode ser ligeiramente maior._

## Backend (Jest)

| Arquivo | Casos | Suites |
|---|---|---|
| `src/acessos/acessos.controller.spec.ts` | 3 | 1 |
| `src/acessos/acessos.permissoes.spec.ts` | 3 | 1 |
| `src/acessos/acessos.properties.spec.ts` | 3 | 1 |
| `src/acessos/acessos.service.spec.ts` | 9 | 4 |
| `src/alertas/alertas.service.spec.ts` | 10 | 5 |
| `src/alertas/saudacao-diaria.domain.spec.ts` | 6 | 1 |
| `src/alertas/saudacao-diaria.service.spec.ts` | 1 | 1 |
| `src/app.service.spec.ts` | 5 | 1 |
| `src/arrecadacao/arrecadacao.nao-reconhecidos.spec.ts` | 2 | 1 |
| `src/arrecadacao/destaque-menos-cancelou.spec.ts` | 1 | 1 |
| `src/arrecadacao/indicadores-inteligente.destaques.spec.ts` | 3 | 2 |
| `src/assistente/gemini.client.spec.ts` | 3 | 1 |
| `src/atestados/atestados.domain.spec.ts` | 13 | 5 |
| `src/atestados/atestados.service.spec.ts` | 3 | 1 |
| `src/central-jornada/central-jornada.controller.spec.ts` | 1 | 1 |
| `src/central-jornada/central-jornada.service.spec.ts` | 12 | 3 |
| `src/central-jornada/saldo-time.spec.ts` | 4 | 1 |
| `src/checklist/checklist.controller.spec.ts` | 5 | 1 |
| `src/checklist/checklist.properties.spec.ts` | 5 | 1 |
| `src/checklist/checklist.service.spec.ts` | 8 | 2 |
| `src/ciclo-folha/ciclo-folha.service.spec.ts` | 4 | 1 |
| `src/colaboradores/colaboradores.adicionar-identificador.spec.ts` | 4 | 1 |
| `src/colaboradores/colaboradores.promocao-acesso.spec.ts` | 3 | 1 |
| `src/colaboradores/colaboradores.turno-obrigatorio.spec.ts` | 9 | 5 |
| `src/colaboradores/perfil-colaborador.medalhas.spec.ts` | 8 | 5 |
| `src/colaboradores/perfil-colaborador.properties.spec.ts` | 17 | 2 |
| `src/colaboradores/perfil-colaborador.service.spec.ts` | 8 | 3 |
| `src/colaboradores/purga-inativos.service.spec.ts` | 4 | 1 |
| `src/common/config/jwt-secret.spec.ts` | 4 | 1 |
| `src/common/correlation-id.middleware.spec.ts` | 3 | 1 |
| `src/common/cors.spec.ts` | 5 | 1 |
| `src/common/datas.spec.ts` | 8 | 2 |
| `src/common/filters/dominio-exception.filter.spec.ts` | 3 | 1 |
| `src/common/guards/jwt-auth.guard.spec.ts` | 7 | 1 |
| `src/common/guards/perfil.guard.spec.ts` | 5 | 1 |
| `src/common/justificativas.spec.ts` | 4 | 1 |
| `src/config/env.validation.spec.ts` | 4 | 1 |
| `src/contratos/contratos-alertas.service.spec.ts` | 5 | 1 |
| `src/contratos/contratos.properties.spec.ts` | 13 | 1 |
| `src/contratos/contratos.service.spec.ts` | 10 | 5 |
| `src/data-inicial/data-inicial.domain.spec.ts` | 5 | 2 |
| `src/data-inicial/data-inicial.properties.spec.ts` | 2 | 1 |
| `src/data-inicial/validacao-data.service.spec.ts` | 3 | 1 |
| `src/escala-domingo/escala-domingo.domain.spec.ts` | 24 | 4 |
| `src/fechamento/fechamento.domain.spec.ts` | 5 | 1 |
| `src/feedforward/feedforward.domain.spec.ts` | 7 | 2 |
| `src/feriados/feriados.domain.spec.ts` | 4 | 1 |
| `src/ferias/ferias.domain.spec.ts` | 9 | 6 |
| `src/ferias/ferias.service.spec.ts` | 7 | 1 |
| `src/fiscais/escala-colaborador.spec.ts` | 4 | 1 |
| `src/fiscais/escala-inativo.spec.ts` | 1 | 1 |
| `src/fiscais/escalados-ferias.spec.ts` | 2 | 1 |
| `src/fiscais/fiscais-alertas.intervalo.spec.ts` | 2 | 1 |
| `src/fiscais/fiscais.controller.spec.ts` | 4 | 1 |
| `src/fiscais/fiscais.gateway.spec.ts` | 3 | 1 |
| `src/fiscais/fiscais.painel-status.spec.ts` | 2 | 1 |
| `src/fiscais/fiscais.properties.spec.ts` | 5 | 1 |
| `src/fiscais/fiscais.service.spec.ts` | 19 | 1 |
| `src/fiscais/integridade-vinculo.spec.ts` | 6 | 1 |
| `src/fiscais/jornada-marcacoes.spec.ts` | 2 | 1 |
| `src/fiscais/status-operador.spec.ts` | 2 | 1 |
| `src/incidencias/incidencias.justificativa.spec.ts` | 4 | 3 |
| `src/incidencias/incidencias.properties.spec.ts` | 6 | 1 |
| `src/incidencias/incidencias.sancoes.spec.ts` | 7 | 2 |
| `src/incidencias/incidencias.service.spec.ts` | 11 | 2 |
| `src/incidencias/incidencias.tipos.spec.ts` | 7 | 1 |
| `src/insumos/insumos.controller.spec.ts` | 5 | 1 |
| `src/insumos/insumos.properties.spec.ts` | 5 | 2 |
| `src/insumos/insumos.resumo.spec.ts` | 2 | 1 |
| `src/insumos/insumos.service.spec.ts` | 12 | 1 |
| `src/lote-apae/lote-apae.controller.spec.ts` | 4 | 1 |
| `src/lote-apae/lote-apae.properties.spec.ts` | 4 | 1 |
| `src/lote-apae/lote-apae.service.spec.ts` | 6 | 1 |
| `src/notificacoes/notificacoes.properties.spec.ts` | 2 | 1 |
| `src/notificacoes/notificacoes.service.spec.ts` | 3 | 1 |
| `src/operadores/ausencia-a-prazo-vinculo.spec.ts` | 1 | 1 |
| `src/operadores/ausencia-a-prazo.spec.ts` | 3 | 1 |
| `src/operadores/listar-ausencias-ficha.spec.ts` | 1 | 1 |
| `src/operadores/operador-turno.roster-turno.spec.ts` | 3 | 2 |
| `src/operadores/operadores.controller.spec.ts` | 3 | 2 |
| `src/operadores/operadores.justificativa.spec.ts` | 6 | 1 |
| `src/operadores/operadores.properties.spec.ts` | 5 | 1 |
| `src/operadores/operadores.service.spec.ts` | 11 | 4 |
| `src/operadores/remover-ausencia-periodo.spec.ts` | 3 | 1 |
| `src/ponto/contrato-6x1-congelado.spec.ts` | 5 | 1 |
| `src/ponto/deteccao-automatica.domain.spec.ts` | 8 | 4 |
| `src/ponto/deteccao-falta-a-prazo.spec.ts` | 3 | 1 |
| `src/ponto/ponto-alertas.service.spec.ts` | 1 | 1 |
| `src/ponto/ponto-nome-match.spec.ts` | 6 | 1 |
| `src/ponto/ponto-ocr.parser.spec.ts` | 17 | 1 |
| `src/ponto/ponto-ocr.service.spec.ts` | 7 | 2 |
| `src/ponto/ponto.domain.spec.ts` | 38 | 7 |
| `src/ponto/ponto.service.spec.ts` | 42 | 4 |
| `src/produtos-pesados/produtos-pesados.parser.spec.ts` | 7 | 2 |
| `src/requisicoes/requisicoes.controller.spec.ts` | 4 | 1 |
| `src/requisicoes/requisicoes.service.spec.ts` | 3 | 1 |
| `src/reset-operacional/reset-operacional.domain.spec.ts` | 8 | 3 |
| `src/reset-operacional/reset-operacional.properties.spec.ts` | 3 | 1 |
| `src/tipos-contrato/tipos-contrato.adapter.spec.ts` | 5 | 1 |
| `src/tipos-contrato/tipos-contrato.service.spec.ts` | 9 | 1 |

## Mobile (Jest + Testing Library)

| Arquivo | Casos | Suites |
|---|---|---|
| `src/components/LeitorCodigoBarras.test.tsx` | 4 | 1 |
| `src/components/SeletorData.test.tsx` | 4 | 1 |
| `src/offline/fila.test.ts` | 6 | 2 |
| `src/offline/sincronizacao.test.tsx` | 7 | 2 |
| `src/screens/HomeScreen.test.tsx` | 4 | 1 |
| `src/screens/centroControle/CentroControleScreen.test.tsx` | 2 | 1 |
| `src/screens/centroControle/ReiniciarDadosScreen.test.tsx` | 2 | 1 |
| `src/screens/colaboradores/ColaboradoresScreen.test.tsx` | 3 | 1 |
| `src/screens/colaboradores/GestaoColaboradoresScreen.test.tsx` | 2 | 1 |
| `src/screens/colaboradores/PerfilColaboradorScreen.test.tsx` | 3 | 2 |
| `src/screens/contratos/ContratosScreen.test.tsx` | 5 | 1 |
| `src/screens/fechamento/FechamentoScreen.test.tsx` | 2 | 1 |
| `src/screens/importacoes/ImportacoesScreen.test.tsx` | 2 | 1 |
| `src/screens/indicadores/NaoReconhecidosScreen.test.tsx` | 3 | 1 |
| `src/screens/indicadores/PainelVendasScreen.test.tsx` | 3 | 1 |
| `src/screens/insumos/InsumosScreen.test.tsx` | 2 | 1 |
| `src/screens/notificacoes/NotificacoesScreen.test.tsx` | 3 | 1 |
| `src/screens/operadores/JustificativasScreen.test.tsx` | 3 | 1 |
| `src/screens/ponto/ExportarCicloScreen.test.tsx` | 2 | 1 |
| `src/screens/ponto/InconsistenciasScreen.test.tsx` | 2 | 1 |
| `src/screens/ponto/RegistroPontoScreen.test.tsx` | 6 | 1 |
| `src/screens/ponto/leituraComprovanteUtil.test.ts` | 4 | 2 |
| `src/screens/ponto/montarTextoOcr.test.ts` | 3 | 1 |
| `src/utils/formato.test.ts` | 10 | 3 |
| `src/utils/relatorioPerfil.test.ts` | 12 | 9 |
