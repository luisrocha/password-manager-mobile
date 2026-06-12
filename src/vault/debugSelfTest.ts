import * as openpgp from "openpgp"

import { createVaultCrypto as createSharedVaultCrypto } from "@password-manager/vault-crypto"

import { getVaultCryptoCapabilityStatus } from "@/vault/capabilities"
import { createMemoryVaultStorage } from "@/vault/memoryStorage"
import { mobileArgon2 } from "@/vault/mobileArgon2"
import { mobileOpenPgp } from "@/vault/mobileOpenPgp"
import type { VaultCrypto } from "@/vault/types"

type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue }

export interface DebugStep {
  details?: JsonValue
  error?: JsonValue
  name: string
  status: "passed" | "failed"
}

export interface VaultCryptoDebugSelfTestResult {
  failedStep: string | null
  steps: DebugStep[]
}

type DebugVaultCrypto = VaultCrypto & {
  exportVaultBackup: () => Promise<string>
  generateVault: (masterPassword: string) => Promise<unknown>
}

function serializeError(error: unknown): JsonValue {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      type: typeof error
    }
  }

  const errorWithCause = error as Error & { cause?: unknown }

  return {
    cause: errorWithCause.cause ? serializeError(errorWithCause.cause) : null,
    message: error.message,
    name: error.name,
    stack: error.stack ?? null
  }
}

async function captureStep<T>(
  steps: DebugStep[],
  name: string,
  run: () => Promise<T>,
  describe?: (result: T) => JsonValue
) {
  try {
    const result = await run()

    steps.push({
      details: describe ? describe(result) : null,
      name,
      status: "passed"
    })

    return result
  } catch (error) {
    steps.push({
      error: serializeError(error),
      name,
      status: "failed"
    })

    throw error
  }
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }

  return bytes
}

function getSubtleMethodStatus() {
  const subtle = globalThis.crypto?.subtle

  return {
    decrypt: typeof subtle?.decrypt,
    deriveBits: typeof subtle?.deriveBits,
    encrypt: typeof subtle?.encrypt,
    exportKey: typeof subtle?.exportKey,
    generateKey: typeof subtle?.generateKey,
    importKey: typeof subtle?.importKey,
    sign: typeof subtle?.sign,
    unwrapKey: typeof subtle?.unwrapKey,
    verify: typeof subtle?.verify,
    wrapKey: typeof subtle?.wrapKey
  }
}

async function runWebCryptoProbe() {
  const plaintext = new TextEncoder().encode("probe")
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey(
    "raw",
    crypto.getRandomValues(new Uint8Array(32)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  )
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted)

  return {
    decryptedText: new TextDecoder().decode(decrypted),
    encryptedBytes: encrypted.byteLength,
    subtleMethods: getSubtleMethodStatus()
  }
}

async function runArgon2Probe() {
  const result = await mobileArgon2.hash({
    hashLen: 32,
    mem: 8192,
    parallelism: 1,
    pass: "diagnostic password",
    salt: hexToBytes("00112233445566778899aabbccddeeff"),
    time: 1,
    type: mobileArgon2.ArgonType.Argon2id
  })

  return {
    hashBytes: result.hash.length,
    hashPrefix: Array.from(result.hash.slice(0, 4))
  }
}

async function runOpenPgpPasswordProbe() {
  const message = await openpgp.createMessage({ text: "openpgp password probe" })
  const encrypted = await openpgp.encrypt({
    message,
    passwords: ["diagnostic password"]
  })
  const encryptedMessage = encrypted.toString()
  const parsedMessage = await openpgp.readMessage({ armoredMessage: encryptedMessage })
  const decryptedMessage = await captureNestedStage("message.decrypt(password)", () =>
    parsedMessage.decrypt(undefined, ["diagnostic password"], undefined)
  )
  const literalText = await captureNestedStage("decryptedMessage.getText()", () =>
    Promise.resolve(decryptedMessage.getText())
  )
  const mobileParsedMessage = await openpgp.readMessage({ armoredMessage: encryptedMessage })
  const { data } = await captureNestedStage("mobileOpenPgp.decrypt(password)", () =>
    mobileOpenPgp.decrypt({
      format: "utf8",
      message: mobileParsedMessage,
      passwords: ["diagnostic password"]
    })
  )
  const publicParsedMessage = await openpgp.readMessage({ armoredMessage: encryptedMessage })
  const publicDecryptError = await captureExpectedError(() =>
    openpgp.decrypt({
      format: "utf8",
      message: publicParsedMessage,
      passwords: ["diagnostic password"]
    })
  )

  return {
    decryptedText: data.toString(),
    encryptedLength: encrypted.toString().length,
    literalText: literalText.toString(),
    publicDecryptError
  }
}

async function captureExpectedError(run: () => Promise<unknown>) {
  try {
    await run()
    return null
  } catch (error) {
    return serializeError(error)
  }
}

async function captureNestedStage<T>(name: string, run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    const wrapped = new Error(`nested stage failed: ${name}`)
    wrapped.cause = error
    throw wrapped
  }
}

async function runOpenPgpKeyProbe() {
  const keys = await openpgp.generateKey({
    curve: "curve25519" as never,
    type: "ecc",
    userIDs: [{ name: "Diagnostics Key Probe" }]
  })
  const publicKey = await openpgp.readKey({ armoredKey: keys.publicKey })
  const privateKey = await openpgp.readPrivateKey({ armoredKey: keys.privateKey })
  const message = await openpgp.createMessage({ text: "openpgp key probe" })
  const encrypted = await openpgp.encrypt({
    encryptionKeys: publicKey,
    message
  })
  const encryptedMessage = encrypted.toString()
  const parsedMessage = await openpgp.readMessage({ armoredMessage: encryptedMessage })
  const decryptedMessage = await captureNestedStage("message.decrypt(key)", () =>
    parsedMessage.decrypt([privateKey], undefined, undefined)
  )
  const literalText = await captureNestedStage("decryptedMessage.getText()", () =>
    Promise.resolve(decryptedMessage.getText())
  )
  const mobileParsedMessage = await openpgp.readMessage({ armoredMessage: encryptedMessage })
  const { data } = await captureNestedStage("mobileOpenPgp.decrypt(key)", () =>
    mobileOpenPgp.decrypt({
      decryptionKeys: privateKey,
      format: "utf8",
      message: mobileParsedMessage
    })
  )
  const publicParsedMessage = await openpgp.readMessage({ armoredMessage: encryptedMessage })
  const publicDecryptError = await captureExpectedError(() =>
    openpgp.decrypt({
      decryptionKeys: privateKey,
      format: "utf8",
      message: publicParsedMessage
    })
  )

  return {
    decryptedText: data.toString(),
    encryptedLength: encrypted.toString().length,
    literalText: literalText.toString(),
    publicDecryptError,
    privateKeyLength: keys.privateKey.length,
    publicKeyLength: keys.publicKey.length
  }
}

export async function runVaultCryptoDebugSelfTest(): Promise<VaultCryptoDebugSelfTestResult> {
  const steps: DebugStep[] = []
  const masterPassword = "diagnostic master password"
  const plaintext = "diagnostic secret"
  let vaultCrypto: DebugVaultCrypto | null = null

  try {
    await captureStep(steps, "runtime capabilities", async () => getVaultCryptoCapabilityStatus())
    await captureStep(steps, "webcrypto aes-gcm probe", runWebCryptoProbe)
    await captureStep(steps, "argon2 probe", runArgon2Probe)
    await captureStep(steps, "openpgp password low-level decrypt probe", runOpenPgpPasswordProbe)
    await captureStep(steps, "openpgp key low-level decrypt probe", runOpenPgpKeyProbe)

    vaultCrypto = await captureStep(steps, "create shared vault crypto", async () => {
      return createSharedVaultCrypto({
        argon2: mobileArgon2,
        openpgp: mobileOpenPgp,
        storage: createMemoryVaultStorage(),
        storageKey: "passwordManager.debugSelfTestVault"
      }) as DebugVaultCrypto
    })

    await captureStep(steps, "generate vault", () => vaultCrypto!.generateVault(masterPassword))
    await captureStep(steps, "has stored vault", () => vaultCrypto!.hasStoredVault())
    await captureStep(steps, "export vault backup", async () => {
      const backup = await vaultCrypto!.exportVaultBackup()
      const parsed = JSON.parse(backup) as { kdf?: unknown; publicKey?: string }

      return {
        bytes: backup.length,
        hasKdf: Boolean(parsed.kdf),
        publicKeyBytes: parsed.publicKey?.length ?? 0
      }
    })
    await captureStep(steps, "lock vault", async () => {
      vaultCrypto!.lockVault()
      return {
        isUnlocked: vaultCrypto!.isVaultUnlocked()
      }
    })
    await captureStep(steps, "unlock vault", () => vaultCrypto!.unlockVault(masterPassword))
    await captureStep(
      steps,
      "encrypt text",
      () => vaultCrypto!.encryptText(plaintext),
      (encrypted) => ({
        encryptedLength: encrypted.toString().length
      })
    )
    await captureStep(steps, "decrypt text", async () => {
      const encrypted = await vaultCrypto!.encryptText(plaintext)
      return vaultCrypto!.decryptText(encrypted)
    })
    await captureStep(steps, "build unlock proof", () =>
      vaultCrypto!.buildUnlockProof("diagnostic challenge")
    )
  } catch {
    return {
      failedStep: steps.find((step) => step.status === "failed")?.name ?? "unknown",
      steps
    }
  }

  return {
    failedStep: null,
    steps
  }
}
