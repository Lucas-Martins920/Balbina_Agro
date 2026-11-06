// O app reaproveita as regras puras do site (src/lib/*.ts sem React nem servidor) pelo atalho @regras/.
// Metro precisa enxergar a pasta de fora do projeto e resolver o atalho.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const regras = path.resolve(__dirname, "../src/lib");

config.watchFolders = [...(config.watchFolders ?? []), regras];
const resolverPadrao = config.resolver.resolveRequest;
config.resolver.resolveRequest = (contexto, nome, plataforma) => {
  if (nome.startsWith("@regras/")) {
    return contexto.resolveRequest(contexto, path.join(regras, nome.slice("@regras/".length)), plataforma);
  }
  return (resolverPadrao ?? contexto.resolveRequest)(contexto, nome, plataforma);
};

module.exports = config;
