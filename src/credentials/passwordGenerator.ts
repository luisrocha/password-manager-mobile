export const DEFAULT_GENERATED_PASSWORD_LENGTH = 20
export const MIN_GENERATED_PASSWORD_LENGTH = 8
export const MAX_GENERATED_PASSWORD_LENGTH = 100

const PASSWORD_LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const PASSWORD_NUMBERS = "0123456789"
const PASSWORD_SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?"

export interface GeneratePasswordOptions {
  includeNumbers?: boolean
  includeSymbols?: boolean
  length?: number
}

export function normalizeGeneratedPasswordLength(value: number | string) {
  const parsedValue = typeof value === "number" ? value : Number.parseInt(value.trim(), 10)

  if (Number.isNaN(parsedValue)) return DEFAULT_GENERATED_PASSWORD_LENGTH

  return Math.min(
    Math.max(parsedValue, MIN_GENERATED_PASSWORD_LENGTH),
    MAX_GENERATED_PASSWORD_LENGTH
  )
}

export function generatePassword(options: GeneratePasswordOptions = {}) {
  const length = normalizeGeneratedPasswordLength(
    options.length ?? DEFAULT_GENERATED_PASSWORD_LENGTH
  )
  const requiredSets = [PASSWORD_LETTERS]

  if (options.includeNumbers ?? true) requiredSets.push(PASSWORD_NUMBERS)
  if (options.includeSymbols ?? false) requiredSets.push(PASSWORD_SYMBOLS)

  const passwordAlphabet = requiredSets.join("")
  const requiredCharacters = requiredSets.map((set) => randomCharacter(set))
  const remainingCharacters = Array.from({ length: length - requiredCharacters.length }, () =>
    randomCharacter(passwordAlphabet)
  )

  return shuffleCharacters([...requiredCharacters, ...remainingCharacters]).join("")
}

function randomCharacter(alphabet: string) {
  return alphabet[randomInt(alphabet.length)]
}

function shuffleCharacters(characters: string[]) {
  const shuffledCharacters = [...characters]

  for (let index = shuffledCharacters.length - 1; index > 0; index -= 1) {
    const nextIndex = randomInt(index + 1)
    const currentCharacter = shuffledCharacters[index]

    shuffledCharacters[index] = shuffledCharacters[nextIndex]
    shuffledCharacters[nextIndex] = currentCharacter
  }

  return shuffledCharacters
}

function randomInt(maxExclusive: number) {
  const randomValues = new Uint32Array(1)
  const randomSource = globalThis.crypto

  if (!randomSource?.getRandomValues) throw new Error("secure_random_unavailable")

  const randomLimit = Math.floor(0xffffffff / maxExclusive) * maxExclusive

  do {
    randomSource.getRandomValues(randomValues)
  } while (randomValues[0] >= randomLimit)

  return randomValues[0] % maxExclusive
}
