export interface TestUser {
  email: string
  password: string
  // Name is derived from email (part before @) for workspace profile display assertions
  name: string
}

export const makeUser = (): TestUser => {
  const unique = Date.now() + Math.floor(Math.random() * 1000)
  const emailLocalPart = `playwrightuser${unique}`
  return {
    email: `${emailLocalPart}@example.com`,
    password: "Password123!",
    // Name is derived from email local part, matching workspace profile bootstrap
    name: emailLocalPart,
  }
}
