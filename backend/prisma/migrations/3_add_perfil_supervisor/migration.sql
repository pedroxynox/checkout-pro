-- Adiciona o perfil SUPERVISOR ao enum Perfil (entre GERENTE e FISCAL).
ALTER TYPE "Perfil" ADD VALUE IF NOT EXISTS 'SUPERVISOR';
