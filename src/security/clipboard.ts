import * as Clipboard from "expo-clipboard"

export const CLIPBOARD_CLEAR_DELAY_MS = 30_000

export async function copyWithAutoClear(value: string) {
  await Clipboard.setStringAsync(value)

  setTimeout(() => {
    void clearClipboardIfUnchanged(value)
  }, CLIPBOARD_CLEAR_DELAY_MS)
}

async function clearClipboardIfUnchanged(value: string) {
  const currentValue = await Clipboard.getStringAsync()
  if (currentValue === value) await Clipboard.setStringAsync("")
}
