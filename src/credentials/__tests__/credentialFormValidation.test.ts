import { validateCredentialForm } from "@/credentials/credentialFormValidation"

describe("validateCredentialForm", () => {
  const validForm = {
    category: "login" as const,
    displayName: " Example ",
    domain: " example.com ",
    notes: "",
    password: "secret",
    username: " person@example.com "
  }

  it("trims searchable credential fields before saving", () => {
    expect(validateCredentialForm(validForm).data).toMatchObject({
      displayName: "Example",
      domain: "example.com",
      username: "person@example.com"
    })
  })

  it("requires a title or domain", () => {
    expect(
      validateCredentialForm({ ...validForm, displayName: " ", domain: " " }).errors
    ).toMatchObject({
      displayName: "Enter a title or domain."
    })
  })

  it("requires a password", () => {
    expect(validateCredentialForm({ ...validForm, password: "" }).errors).toMatchObject({
      password: "Password is required."
    })
  })
})
