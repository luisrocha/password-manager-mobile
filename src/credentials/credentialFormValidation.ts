import { z } from "zod"

export const CREDENTIAL_CATEGORY_VALUES = [
  "login",
  "note",
  "api_key",
  "server",
  "database"
] as const

const credentialFormSchema = z
  .object({
    category: z.enum(CREDENTIAL_CATEGORY_VALUES),
    displayName: z.string().trim().max(120, "Title is too long."),
    domain: z.string().trim().max(255, "Domain is too long."),
    notes: z.string().max(10_000, "Notes are too long."),
    password: z.string().min(1, "Password is required.").max(4_096, "Password is too long."),
    username: z.string().trim().max(255, "Username is too long.")
  })
  .superRefine((value, context) => {
    if (value.displayName || value.domain) return

    context.addIssue({
      code: "custom",
      message: "Enter a title or domain.",
      path: ["displayName"]
    })
  })

export type CredentialFormValidationInput = z.input<typeof credentialFormSchema>
export type CredentialFormValidationResult = z.output<typeof credentialFormSchema>
export type CredentialFormFieldErrors = Partial<Record<keyof CredentialFormValidationInput, string>>

export function validateCredentialForm(input: CredentialFormValidationInput) {
  const parsedForm = credentialFormSchema.safeParse(input)

  if (parsedForm.success) {
    return { data: parsedForm.data, errors: null }
  }

  const errors: CredentialFormFieldErrors = {}

  parsedForm.error.issues.forEach((issue) => {
    const field = issue.path[0]
    if (typeof field !== "string" || !(field in input)) return
    const typedField = field as keyof CredentialFormValidationInput

    errors[typedField] ??= issue.message
  })

  return { data: null, errors }
}
