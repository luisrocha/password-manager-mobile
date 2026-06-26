import * as Clipboard from "expo-clipboard"

import { CLIPBOARD_CLEAR_DELAY_MS, copyWithAutoClear } from "@/security/clipboard"

jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn(),
  setStringAsync: jest.fn(() => Promise.resolve())
}))

const mockedClipboard = jest.mocked(Clipboard)

describe("copyWithAutoClear", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("clears the clipboard after the delay only if the copied value is unchanged", async () => {
    mockedClipboard.getStringAsync.mockResolvedValueOnce("secret")

    await copyWithAutoClear("secret")
    await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_DELAY_MS)

    expect(mockedClipboard.setStringAsync).toHaveBeenNthCalledWith(1, "secret")
    expect(mockedClipboard.setStringAsync).toHaveBeenNthCalledWith(2, "")
  })

  it("does not clear a newer clipboard value", async () => {
    mockedClipboard.getStringAsync.mockResolvedValueOnce("new value")

    await copyWithAutoClear("secret")
    await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_DELAY_MS)

    expect(mockedClipboard.setStringAsync).toHaveBeenCalledTimes(1)
  })
})
