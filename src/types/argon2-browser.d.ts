declare module "argon2-browser" {
  interface Argon2HashOptions {
    pass: string
    salt: Uint8Array
    time: number
    mem: number
    parallelism: number
    hashLen: number
    type: number
  }

  interface Argon2HashResult {
    hash: Uint8Array
  }

  const argon2: {
    ArgonType: {
      Argon2id: number
    }
    hash: (options: Argon2HashOptions) => Promise<Argon2HashResult>
  }

  export default argon2
}

declare module "argon2-browser/dist/argon2-bundled.min" {
  import argon2 from "argon2-browser"

  export default argon2
}
