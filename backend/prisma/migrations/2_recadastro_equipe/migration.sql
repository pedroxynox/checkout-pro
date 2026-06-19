-- Limpeza única dos dados de configuração inicial (ainda sem dados reais de
-- operação), para recadastrar a equipe com login por matrícula sem duplicar
-- registros antigos (que usavam login por slug do nome).
-- CASCADE remove também os dados transacionais ligados (sessões, registros,
-- notificações, movimentos), que estavam vazios/de teste.
TRUNCATE TABLE "usuarios", "fiscais", "operadores" RESTART IDENTITY CASCADE;
