import * as openpgp from "openpgp"

type OpenPgpDecryptOptions = Parameters<typeof openpgp.decrypt>[0]
type OpenPgpDecryptResult = Awaited<ReturnType<typeof openpgp.decrypt>>

async function decryptWithoutVerification(
  options: OpenPgpDecryptOptions
): Promise<OpenPgpDecryptResult> {
  const {
    config,
    date = new Date(),
    decryptionKeys,
    format = "utf8",
    message,
    passwords,
    sessionKeys
  } = options
  const fullConfig = { ...openpgp.config, ...config }
  const decryptedMessage = await message.decrypt(
    decryptionKeys ? [decryptionKeys].flat() : undefined,
    passwords ? [passwords].flat() : undefined,
    sessionKeys ? [sessionKeys].flat() : undefined,
    date,
    fullConfig
  )
  const data = format === "binary" ? decryptedMessage.getLiteralData() : decryptedMessage.getText()

  return {
    data: await data,
    filename: decryptedMessage.getFilename(),
    signatures: []
  } as OpenPgpDecryptResult
}

export const mobileOpenPgp = {
  ...openpgp,
  async decrypt(options: OpenPgpDecryptOptions) {
    if (!options.verificationKeys && !options.expectSigned && !options.signature) {
      return decryptWithoutVerification(options)
    }

    return openpgp.decrypt(options)
  }
}
