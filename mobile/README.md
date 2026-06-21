# Check-out PRO — App Móvel (Gestão de Frente de Caixa)

Aplicativo móvel **React Native + Expo** (TypeScript) do sistema de Gestão de
Frente de Caixa do supermercado **Check-out PRO**. Toda a interface é em
Português do Brasil.

## Como executar

```bash
# a partir da raiz do monorepo (workspaces) ou de mobile/
npm install
npm run start --workspace=mobile   # ou, dentro de mobile/: npm start
```

Defina a URL da API (backend NestJS) por variável de ambiente pública do Expo:

```bash
EXPO_PUBLIC_API_URL=http://192.168.0.10:3000 npm start
```

Sem essa variável, o app usa `http://localhost:3000` (desenvolvimento).

Scripts úteis (dentro de `mobile/`):

- `npm run type-check` — verificação de tipos (`tsc --noEmit`).
- `npm run lint` — ESLint.
- `npm run android` / `npm run ios` / `npm run web`.

## Arquitetura

```
mobile/
  App.tsx                 # raiz: provedores (SafeArea, Auth) + navegação
  app.json                # identidade/branding "Check-out PRO"
  src/
    api/                  # cliente HTTP, token seguro, tipos e serviços por módulo
      client.ts           # fetch + token JWT + mapeamento de erros (pt-BR)
      tokenStorage.ts     # expo-secure-store (com fallback AsyncStorage na web)
      socket.ts           # cliente WebSocket do painel de fiscais
      services/           # um serviço por módulo do backend
    auth/                 # AuthContext + allowlist de funcionalidades (perfil)
    navigation/           # pilha principal + registro de áreas por perfil
    components/           # UI compartilhada (Tela, Botão, Cartão, StatusBadge...)
    screens/              # telas por módulo
    hooks/                # useRequisicao (carregamento/erro/refresh)
    theme/                # cores, espaçamentos, tipografia
    utils/                # formatação pt-BR (moeda, data, percentual)
```

## Autenticação e navegação por perfil

- O login é **individual e exclusivo** (Req 7.1). O token JWT é guardado no
  armazenamento seguro do dispositivo.
- A navegação reflete o perfil (Req 7.2): o **gerente** vê todas as áreas; o
  **fiscal** vê apenas as áreas operacionais, usando a mesma allowlist do
  backend (`FUNCIONALIDADES_FISCAL`) em `src/auth/funcionalidades.ts`.

## Observações de ambiente

- A leitura de código de barras (`expo-camera`) e o seletor de imagens
  (`expo-image-picker`) usam APIs nativas; em ambientes sem câmera, as telas
  oferecem entrada manual como alternativa.
- Caso a instalação completa do Expo/CLI não esteja disponível no ambiente de
  CI/sandbox, todo o código-fonte, dependências e configuração já estão
  versionados — basta rodar `npm install` e `npx expo start` em uma máquina de
  desenvolvimento.
