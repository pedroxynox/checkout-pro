// Configuração de ESLint do app móvel. Usa o config oficial do Expo quando
// disponível (eslint-config-expo). Mantido simples para a equipe da loja.
module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['/dist', '/node_modules', '/.expo'],
};
