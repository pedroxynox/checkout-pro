-- Backfill: cria a ficha única (Colaborador FISCAL) para cada Fiscal que ainda
-- não tem ficha, usando a matrícula (= login do usuário) como registro único e
-- vinculando a mesma conta de acesso (usuarioId). Assim o painel de Fiscais, a
-- Jornada e a Escala passam a se ligar à ficha do colaborador (e ao perfil).
-- Idempotente: só cria o que falta (NOT EXISTS por usuarioId e por matrícula).

INSERT INTO "colaboradores" ("id", "matricula", "nome", "funcao", "usuarioId")
SELECT gen_random_uuid(), u."login", f."nome", 'FISCAL'::"FuncaoColaborador", f."usuarioId"
FROM "fiscais" f
JOIN "usuarios" u ON u."id" = f."usuarioId"
WHERE f."usuarioId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "colaboradores" c WHERE c."usuarioId" = f."usuarioId"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "colaboradores" c WHERE c."matricula" = u."login"
  );

-- Identificador MATRICULA para as fichas que ainda não o têm (idempotente).
INSERT INTO "colaborador_identificadores" ("id", "colaboradorId", "tipo", "valor")
SELECT gen_random_uuid(), c."id", 'MATRICULA'::"TipoIdentificador", c."matricula"
FROM "colaboradores" c
WHERE NOT EXISTS (
  SELECT 1 FROM "colaborador_identificadores" i
  WHERE i."tipo" = 'MATRICULA'::"TipoIdentificador" AND i."valor" = c."matricula"
);
