/**
 * Configuração de testes do app (jest-expo + @testing-library/react-native).
 *
 * Usa o preset `jest-expo`, que prepara o ambiente do React Native/Expo
 * (transforma os módulos ESM do RN, registra os mocks dos módulos nativos do
 * Expo e configura o `react-test-renderer`). Os testes de componente/snapshot
 * das telas de exibição e os testes de UI (leitura de código de barras,
 * navegação por perfil) vivem co-localizados com `*.test.tsx`.
 *
 * Observação de ambiente: a execução depende do toolchain nativo do Expo/RN.
 * Em uma máquina de desenvolvimento com o SDK do Expo instalado, rode
 * `npm test --workspace=mobile`.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Permite transformar os pacotes ESM do ecossistema RN/Expo distribuídos
  // sem build (necessário para o Jest interpretar `import`/`export`).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|lucide-react-native|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@react-native-async-storage/.*|socket.io-client|engine.io-client))',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
};
