import argon2 from "react-native-argon2"

type Argon2HashOptions = {
  pass: string
  salt: Uint8Array
  time: number
  mem: number
  parallelism: number
  hashLen: number
  type: string
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2)

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }

  return bytes
}

export const mobileArgon2 = {
  ArgonType: {
    Argon2id: "argon2id"
  },
  async hash(options: Argon2HashOptions) {
    const result = await argon2(options.pass, bytesToHex(options.salt), {
      hashLength: options.hashLen,
      iterations: options.time,
      memory: options.mem,
      mode: options.type === "argon2id" ? "argon2id" : "argon2id",
      parallelism: options.parallelism,
      saltEncoding: "hex"
    })

    return {
      hash: hexToBytes(result.rawHash)
    }
  }
}
