const path = require("path")

const { getDefaultConfig } = require("expo/metro-config")

const config = getDefaultConfig(__dirname)
const defaultResolveRequest = config.resolver.resolveRequest
const openpgpBrowserEntry = path.resolve(
  path.dirname(require.resolve("openpgp")),
  "../openpgp.min.mjs"
)

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "openpgp") {
    return context.resolveRequest(context, openpgpBrowserEntry, platform)
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform)
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
