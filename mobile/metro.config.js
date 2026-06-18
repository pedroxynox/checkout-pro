// Metro configuration for Expo.
// Habilita a resolução dos aliases de caminho do tsconfig.json ("@/*").
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Resolve os "paths" do tsconfig (ex.: "@/..." -> "./src/...").
config.resolver = config.resolver || {};

module.exports = config;
