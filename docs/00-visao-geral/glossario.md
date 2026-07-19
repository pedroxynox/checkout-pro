> **Estado:** ✅ Em dia · **Responsável:** Engenharia · **Última verificação:** 2026-07-19 · **Cobre:** termos de negócio e de sistema do Check-out PRO

# Glossário

Dicionário rápido dos termos do **negócio** (o supermercado) e do **sistema**
(o Check-out PRO). Use-o sempre que encontrar uma sigla ou expressão que não seja
óbvia. Os termos estão em ordem aproximada de uso.

| Termo | Definição curta |
|---|---|
| **Check-out PRO** | O sistema de gestão da frente de caixa do supermercado (web + Android). |
| **PDV / check-out** | Ponto de venda / caixa do supermercado — onde o cliente paga. Também chamamos de "caixa". |
| **Frente de caixa** | Conjunto de todos os caixas da loja e a operação em volta deles. |
| **Operador** | Pessoa que opera o caixa (o "operador de caixa"). Faz parte do cadastro de colaboradores; nem sempre tem login no app. |
| **Fiscal** | Pessoa que supervisiona os caixas na loja, registra ponto e faz rotinas de conferência, conforme suas permissões. |
| **Supervisor** | Perfil que acompanha equipes e a jornada, acima do fiscal. |
| **Gerente / Administrador** | Perfis de gestão. O `ADMINISTRADOR` enxerga tudo; o gerente tem acesso amplo com algumas restrições estruturais. |
| **Importador** | Perfil restrito que apenas carrega os arquivos operacionais (vendas/arrecadação). |
| **Colaborador (Cadastro Unificado)** | A ficha única de cada pessoa. É a fonte de verdade sobre quem trabalha na loja; operadores e fiscais são funções dela. |
| **Perfil / permissão** | O que cada tipo de usuário pode ver e fazer. Definido por funcionalidade no backend e espelhado no app. |
| **Jornada** | O cálculo do dia de trabalho de uma pessoa: entrada, intervalo, retorno, saída, horas trabalhadas e horas extras. |
| **Ponto / batida** | Cada marcação de horário (entrada, saída para intervalo, retorno, encerramento). A jornada é derivada da ordem das batidas. |
| **Comprovante do ponto** | O papel impresso pelo relógio biométrico da empresa. O celular lê a foto dele para registrar a hora oficial. |
| **OCR** | Leitura automática do texto da foto do comprovante (no Android é feita no aparelho; na web, no servidor). O usuário sempre confirma antes de salvar. |
| **TAC** | *Termo de Ajustamento de Conduta.* No sistema, é o dia que "estoura" a regra: horas extras acima de 1h50, ou intervalo menor que 1h ou maior que 3h. Gera alerta para a gestão. |
| **Hora extra 50% / 100%** | Adicional das horas além da carga base: 50% de segunda a sábado; 100% em domingo e feriado. |
| **Ciclo de folha (26→25)** | Período mensal de apuração da jornada: começa no dia **26** de um mês e vai até o **25** do mês seguinte. |
| **Central de Jornada** | A tela/relatório que consolida a jornada de operadores, supervisores e fiscais dentro do ciclo 26→25. |
| **Saldo (de horas)** | Extras 50% + extras 100% − horas devidas, dentro do ciclo. |
| **Escala** | O planejamento de quem trabalha, em qual turno e em qual dia (incluindo folgas). |
| **Turno** | O horário-base da pessoa: Abertura, Intermediário, Fechamento ou Apoio. Obrigatório para fiscal e operador. |
| **Rodízio de domingo** | A alternância que define quais grupos folgam e quais trabalham a cada domingo (regra 2x1, em três grupos). |
| **Escala de domingo** | A configuração e o cálculo desse rodízio (âncora, ordem dos grupos). |
| **Feedforward** | Acompanhamento de desenvolvimento do colaborador — orientação voltada ao futuro, não à punição. |
| **Incidência (de escala)** | Um evento disciplinar/operacional registrado por data (ex.: não retorno do intervalo, atraso, advertência). |
| **Advertência / suspensão** | Sanções disciplinares. A advertência automática por falta não justificada precisa de aprovação do gestor. |
| **Justificativa (abono)** | Marcar uma falta ou não retorno como justificado (ex.: atestado), reduzindo o peso no score do colaborador. |
| **Arrecadação** | Valores recolhidos além da venda comum — como **troco solidário** e recargas —, importados por arquivo `.txt` e usados nos indicadores. |
| **Troco solidário** | Doação do troco pelo cliente. É um dos indicadores de arrecadação da loja. |
| **Fechamento (do dia)** | O resumo consolidado do dia (arrecadações + vendas + checklists), concluído de forma idempotente (sem duplicar). |
| **APAE** | Associação de Pais e Amigos dos Excepcionais. A loja vende **Sacolas APAE**; o sistema controla o lote, o saldo e o valor arrecadado. |
| **Lote APAE** | O conjunto de sacolas APAE em operação, com controle de entrada, saldo e arrecadação. |
| **Insumo** | Material de consumo da operação (ex.: bobina de papel, sacola, álcool). O saldo nunca pode ficar negativo. |
| **Fardo / bobina** | Unidades de estoque de insumos: o **fardo** é a embalagem com várias unidades; a **bobina** é o rolo (ex.: papel do caixa) consumido aos poucos. |
| **Requisição** | Pedido de reposição de insumo, criado e aprovado por um gestor (nada é reposto automaticamente). |
| **Checklist** | Conferência de abertura e de fechamento da loja, com foto e verificação anti-fraude, dentro de uma janela de horário. |
| **Indicador de Quebra** | Área (hoje **oculta**) prevista para registrar perdas/quebras de mercadoria. |
| **Alertas de Fila** | Área (hoje **oculta**) prevista para avisos de fila nos caixas. |
| **Normativas** | Área (hoje **oculta**) prevista para procedimentos e documentos; em escala, dependerá de busca inteligente (RAG). |
| **Cluby** | A assistente com inteligência artificial (Google Gemini) que resume o dia e responde perguntas. Os procedimentos guiados estão desativados. |
| **RAG** | *Retrieval-Augmented Generation* — técnica de IA que responde consultando uma base de documentos própria. Necessária para as Normativas em escala. |
| **Notificação push** | Aviso que chega ao celular mesmo com o app fechado. No Android exige a configuração do **FCM**. |
| **FCM** | *Firebase Cloud Messaging* — serviço do Google necessário para entregar as notificações no Android. |
| **Expo / EAS** | Plataforma usada para construir e distribuir o app (o **APK** do Android). |
| **APK** | O arquivo instalável do app Android. |
| **Render** | A hospedagem onde rodam a API, a versão web e o banco de dados PostgreSQL. |
| **Prisma / migração** | Prisma é a ferramenta que descreve o banco; cada **migração** é uma mudança versionada na estrutura do banco. |
| **ADR** | *Architecture Decision Record* — registro curto de uma decisão de arquitetura importante. Ficam em `docs/02-arquitetura/decisoes/`. |
| **Multi-tenancy** | Capacidade de atender várias lojas isoladas no mesmo sistema. Hoje está **parqueado** (adiado). |

> Não encontrou o termo? Veja também o [Mapa do projeto](mapa-do-projeto.md) e o
> [Resumo executivo](resumo-executivo.md).
