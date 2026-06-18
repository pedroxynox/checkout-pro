/**
 * Setup global dos testes do app.
 *
 * Registra mocks dos módulos nativos que não funcionam no ambiente de teste
 * (JSDOM/node) — armazenamento seguro/assíncrono, câmera, seletor de
 * documentos/imagens e área segura — de modo que as telas possam ser
 * renderizadas e inspecionadas com o React Native Testing Library.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
require('@testing-library/react-native/extend-expect');

// Área segura: insets fixos para snapshots determinísticos.
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// AsyncStorage: implementação em memória oficial para testes.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// SecureStore (token): em memória.
jest.mock('expo-secure-store', () => {
  const memoria = new Map();
  return {
    getItemAsync: jest.fn(async (chave) => memoria.get(chave) ?? null),
    setItemAsync: jest.fn(async (chave, valor) => {
      memoria.set(chave, valor);
    }),
    deleteItemAsync: jest.fn(async (chave) => {
      memoria.delete(chave);
    }),
  };
});

// expo-camera: componente leve + permissão concedida controlável por teste.
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = (props) =>
    React.createElement(View, { testID: 'camera-view', ...props });
  return {
    CameraView,
    useCameraPermissions: jest.fn(() => [
      { granted: true, canAskAgain: true, status: 'granted' },
      jest.fn(async () => ({ granted: true })),
    ]),
  };
});

// Seletores de arquivo/imagem: sempre cancelam por padrão (sobrescrevíveis).
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { Images: 'Images' },
}));

// Ícones vetoriais: evita carregar fontes nativas nos snapshots.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: (props) =>
      React.createElement(Text, { testID: `icon-${props.name}` }, props.name),
  };
});

// Silencia avisos previsíveis do ambiente de teste.
jest.spyOn(console, 'warn').mockImplementation(() => undefined);
