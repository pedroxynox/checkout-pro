# ADR 0004 — Cadastro Unificado de Colaboradores e escala (Opção A)

- **Status:** Aceito
- **Contexto:** Havia entidades separadas para operador/fiscal e a escala vivia
  em `OperadorTurno`. Isso gerava duplicação e dificuldade de atribuir
  lançamentos a pessoas.
- **Decisão:** `Colaborador` passa a ser a **fonte única de pessoas**. A escala
  de fiscais e operadores é derivada do `Colaborador` (**Opção A**). O login do
  app é criado no próprio cadastro (fiscal/supervisor/gestor); operadores não
  têm acesso. Códigos dos arquivos (`.txt`) são resolvidos por
  `ColaboradorIdentificador` (matrícula/login).
- **Consequências:**
  - ✅ Uma pessoa, um cadastro; atribuição de lançamentos por identificador.
  - ✅ Associação de código corrige o histórico retroativamente (resolução em
    leitura).
  - ⚠️ `Operador`, `OperadorTurno`, `RegistroOperacional` ficam **[DEPRECADO]**
    (sem migração destrutiva). `pessoaId`/`funcionarioId` são polimórficos sem
    FK rígida (ver ADR 0005).
