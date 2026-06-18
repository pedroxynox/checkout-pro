module.exports = function (api) {
  api.cache(true);
  return {
    // Expo SDK 50+ resolve automaticamente os aliases definidos em
    // tsconfig.json (paths "@/*") via Metro (experiments.tsconfigPaths),
    // dispensando o babel-plugin-module-resolver.
    presets: ['babel-preset-expo'],
  };
};
