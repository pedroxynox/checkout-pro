-- Central de Permissões: ajustes de permissão POR LOGIN (desvios do padrão do
-- perfil) + trilha de auditoria. Migração puramente aditiva: cria duas novas
-- tabelas, sem alterar dados nem tabelas existentes. Sem nenhum ajuste, todos
-- os usuários continuam com exatamente o padrão do seu perfil.

-- CreateTable
CREATE TABLE "usuario_permissoes" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "funcionalidade" TEXT NOT NULL,
    "concedida" BOOLEAN NOT NULL,
    "definidoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuario_permissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissao_auditoria" (
    "id" TEXT NOT NULL,
    "usuarioAlvoId" TEXT NOT NULL,
    "loginAlvo" TEXT NOT NULL,
    "funcionalidade" TEXT NOT NULL,
    "concedida" BOOLEAN,
    "acao" TEXT NOT NULL,
    "definidoPor" TEXT,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissao_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usuario_permissoes_usuarioId_idx" ON "usuario_permissoes"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_permissoes_usuarioId_funcionalidade_key" ON "usuario_permissoes"("usuarioId", "funcionalidade");

-- CreateIndex
CREATE INDEX "permissao_auditoria_usuarioAlvoId_idx" ON "permissao_auditoria"("usuarioAlvoId");

-- AddForeignKey
ALTER TABLE "usuario_permissoes" ADD CONSTRAINT "usuario_permissoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
