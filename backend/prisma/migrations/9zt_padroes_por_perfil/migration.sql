-- Padrões por perfil (Central de Permissões) + ampliação da auditoria para
-- registrar também mudanças de perfil. Migração aditiva/compatível: cria a
-- tabela de ajustes por perfil e adiciona colunas de auditoria (tornando o
-- alvo por login opcional). Sem ajustes, o comportamento é idêntico ao atual.

-- CreateTable
CREATE TABLE "perfil_permissoes" (
    "id" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "funcionalidade" TEXT NOT NULL,
    "concedida" BOOLEAN NOT NULL,
    "definidoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perfil_permissoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "perfil_permissoes_perfil_idx" ON "perfil_permissoes"("perfil");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_permissoes_perfil_funcionalidade_key" ON "perfil_permissoes"("perfil", "funcionalidade");

-- AlterTable: auditoria passa a aceitar alvo por perfil e alvo por login opcional
ALTER TABLE "permissao_auditoria" ALTER COLUMN "usuarioAlvoId" DROP NOT NULL;
ALTER TABLE "permissao_auditoria" ALTER COLUMN "loginAlvo" DROP NOT NULL;
ALTER TABLE "permissao_auditoria" ADD COLUMN "perfilAlvo" TEXT;

-- CreateIndex
CREATE INDEX "permissao_auditoria_em_idx" ON "permissao_auditoria"("em");
