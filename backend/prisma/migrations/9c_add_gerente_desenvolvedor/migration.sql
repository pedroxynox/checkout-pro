-- Novo perfil "Gerente Desenvolvedor": acesso total (inclui operações que
-- alteram dados da DB e a área administrativa). O perfil GERENTE comum passa a
-- ter um conjunto restrito (definido na aplicação).
ALTER TYPE "Perfil" ADD VALUE IF NOT EXISTS 'GERENTE_DESENVOLVEDOR';
