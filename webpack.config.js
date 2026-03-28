const createExpoWebpackConfigAsync = require("@expo/webpack-config");

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(
    {
      ...env,
      babel: {
        dangerouslyAddModulePathsToTranspile: [
          "@solana/web3.js",
          "@solana-mobile/mobile-wallet-adapter-protocol",
          "@solana-mobile/mobile-wallet-adapter-protocol-web3js",
        ],
      },
    },
    argv
  );

  // Polyfill Node.js modules for web
  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: require.resolve("expo-crypto"),
    stream: false,
    http: false,
    https: false,
    zlib: false,
    url: false,
  };

  // Suppress source-map warnings from node_modules
  config.ignoreWarnings = [/Failed to parse source map/];

  return config;
};
