jest.mock("react-native-quick-crypto", () => ({
  install: jest.fn(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: jest.fn((values: Uint8Array) => values),
        subtle: {}
      }
    })
  })
}))
