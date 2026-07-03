# Guia de QA — Check-out PRO

> Checklist de validação manual da aplicação em produção, organizado por
> perfil. Objetivo: qualquer pessoa (mesmo não técnica) conseguir validar que
> o app está 100% operacional após um deploy. Marque cada item ao testar.
>
> Ambiente: web (https://checkout-pro-web.onrender.com) ou APK Android.
> Idioma da UI: português (Brasil). Sessão dura ~30 dias.

## Como usar este guia
1. Escolha o perfil que vai testar (peça o login correspondente ao gestor).
2. Siga os passos na ordem. Cada item tem um **resultado esperado**.
3. Se um item falhar, anote o passo, o que aconteceu e um print.
4. Recomenda-se validar primeiro o **fluxo do dia** (Importador → Fechamento),
   pois é o que alimenta os indicadores.

---

## 0. Pré-condições (todas as validações)
- [ ] O app abre e mostra a tela de **Login** (fundo azul/branco com onda + logo).
- [ ] Login com **matrícula + senha** funciona; senha errada mostra erro claro.
- [ ] Após ~30 dias a sessão expira e pede novo login (não testar sempre).
- [ ] A primeira chamada do dia pode demorar ~30–60s (a API "acorda" no Render).

---

## 1. Perfil IMPORTADOR (usuário do computador da loja)
> Só enxerga **Importações**. É quem carrega os arquivos do dia.

### 1.1 Carga dos arquivos do dia
- [ ] Ao logar, vê **apenas** a área de Importações (nenhuma outra).
- [ ] Sobe o `.txt` de **vendas por hora** → confirma total do dia.
- [ ] Sobe os 5 `.txt` de arrecadação (troco solidário, recargas,
      cancelamento de itens, cancelamento de cupom, devoluções).
- [ ] Para um tipo sem movimento no dia, marca **"sem movimento"**.
- [ ] Consegue **remover** a marca "sem movimento" se marcou por engano.
- [ ] Ao completar os 5 arquivos, o sistema considera o dia carregado (os
      gerentes recebem a notificação "Fechamento concluído").

**Esperado:** cada upload retorna quantas linhas foram importadas; o status
de cada tipo muda para "enviado".

---

## 2. Perfil FISCAL (rotina diária de caixa)
> Rotina operacional: insumos, sacolas APAE, checklist, seu próprio ponto,
> escala (só ver), indicadores/painel de vendas (ver).

### 2.1 Ponto / jornada (auto-identificado pelo login)
- [ ] Define o próprio status: **Disponível**, **Intervalo**, **Fora de
      expediente** — o painel dos gestores atualiza em tempo real.
- [ ] Informa a **própria falta do dia**.
- [ ] Vê o **histórico semanal** do próprio ponto.

### 2.2 Insumos (almoxarifado)
- [ ] Lista de insumos mostra o selo de estoque por nível
      (**Crítico / Atenção / OK**).
- [ ] Retira um **fardo** lendo o **código de barras** (câmera) → saldo sobe.
- [ ] Registra **consumo** de bobina/insumo → saldo desce.
- [ ] Cria uma **requisição** de insumo (fica PENDENTE até gestor decidir).

### 2.3 Sacolas APAE
- [ ] Vê o lote ativo e a configuração (preço/meta) — **sem** poder registrar
      ou reiniciar lote.
- [ ] Atualiza o **saldo restante** do lote → ao zerar, o lote encerra sozinho.

### 2.4 Checklist de abertura/fechamento
- [ ] Envia a **foto** do checklist de abertura dentro da janela.
- [ ] Envia a foto do checklist de fechamento.
- [ ] Uma foto repetida (mesmo arquivo) é detectada (anti-fraude / hash).
- [ ] Fora da janela, o item indica que está fora do prazo.

### 2.5 Geral
- [ ] Recebe **notificações** in-app (sino com badge).
- [ ] Abre o assistente **Cluby** (botão central) e faz uma pergunta.
- [ ] **NÃO** vê áreas administrativas (cadastro de pessoas, metas, Centro de
      Controle).

---

## 3. Perfil SUPERVISOR (tudo do fiscal + gestão parcial)
> Tudo do fiscal, mais: cadastro de operadores, gestão de requisições,
> Fechamento e log de jornada dos fiscais.

### 3.1 Fechamento do dia
- [ ] Abre **Fechamento** e vê o resumo do dia: titular
      ("Tudo pronto" / "X de N"), estado dos 5 arquivos + vendas + 2 checklists.
- [ ] Vê **alertas de consistência** (ex.: "vendas sem arrecadação",
      "tudo sem movimento").

### 3.2 Gestão de insumos e operadores
- [ ] **Aprova** e **nega** requisições de insumos (com motivo).
- [ ] Registra **entrada** de estoque.
- [ ] Cadastra/edita **operadores** no Cadastro de Colaboradores.
- [ ] Programa uma **ausência futura** de um operador (permitido a supervisor).

### 3.3 Fiscais
- [ ] Vê o **log de jornada** dos fiscais do dia (tempos trabalhados/intervalo).

---

## 4. Perfil GERENTE (vê tudo + operação; sem gestão estrutural)
> Vê tudo, opera o dia a dia. **Não** faz: gestão de lote APAE, gestão de
> pessoas/acessos, cadastro de operadores, edição de escala nem zerar dados.

### 4.1 Visão geral
- [ ] **Centro de Mando / Pulso do Dia**: resumo e pendências do dia por perfil.
- [ ] **Indicadores**: abre um indicador → totais, meta com semáforo
      (verde/amarelo/vermelho), gráfico de barras, **pizza interativa**,
      ranking e a linha **"Não reconhecidos"**.
- [ ] **Painel de Vendas**: totais dia/semana/mês, barras por hora, projeção.
- [ ] Recebe a notificação **"Fechamento concluído"** quando o dia é carregado.

### 4.2 Limites de permissão (deve estar bloqueado)
- [ ] **NÃO** consegue registrar/reiniciar lote APAE.
- [ ] **NÃO** vê gestão de usuários/acessos nem edição de escala.
- [ ] **NÃO** vê botões de "zerar estoque" / "limpar requisições".

---

## 5. Perfil GERENTE_DESENVOLVEDOR (acesso total)
> Enxerga **absolutamente tudo**, inclusive administração de dados.

### 5.1 Centro de Controle
- [ ] Card **Acesso**: cria login de app no cadastro do colaborador
      (fiscal/supervisor/gestor); operador **não** recebe acesso.
- [ ] Card **Metas**: define metas mensais por indicador (vendas,
      cancelamentos, recargas, devoluções) e config das **Sacolas APAE**.
- [ ] Card **Insumos**: **zerar estoque** e **limpar requisições** funcionam.
- [ ] Card **Importações** disponível.

### 5.2 Cadastro Unificado de Colaboradores
- [ ] Cadastra pessoa com **matrícula única** (rejeita matrícula/login repetido).
- [ ] Edita e **inativa/reativa** (histórico preservado).
- [ ] Fila **"Não reconhecidos"**: **associa** um código solto a uma pessoa
      (corrige o histórico) ou **cria** a pessoa com os dados pré-preenchidos.
- [ ] Escala de fiscais e operadores é lida do Colaborador (Opção A).

### 5.3 Fiscais (total)
- [ ] Pode alterar o status de **qualquer** fiscal (não só o próprio).
- [ ] Vê ranking do mês, previsão de horas extras, horas extras do mês.

---

## 6. Cross-cutting (validar em qualquer perfil)
- [ ] **Tempo real**: mudança de status de fiscal aparece nos gestores sem
      recarregar.
- [ ] **Offline** (APK): sem internet, ações entram numa fila e sincronizam ao
      voltar a conexão.
- [ ] **Cluby**: com muitos acessos simultâneos pode responder
      "indisponível" (limite gratuito do Gemini — ver pendências de infra).
- [ ] **CORS/web**: a versão web fala com a API sem erro de origem.

---

## 7. Registro de problemas encontrados
| # | Perfil | Passo | O que aconteceu | Print | Gravidade |
|---|--------|-------|-----------------|-------|-----------|
|   |        |       |                 |       |           |
