import { useEffect, useState } from 'react'

export type UiLevel = 'simple' | 'standard' | 'pro'

/** The current layout level (Simple / Standard / Pro) for any view that adapts. Standard until known. */
export function useLevel(): UiLevel {
  const [level, setLevel] = useState<UiLevel>('standard')
  useEffect(() => {
    let alive = true
    void window.inboxScout.uiLevel().then((u) => {
      if (alive) setLevel(u.level)
    })
    return () => {
      alive = false
    }
  }, [])
  // A voice started at one level (spoken help at Simple) must not keep talking after the level changes or the view goes away.
  useEffect(() => () => stopSpeaking(), [level])
  return level
}

/** Stop any browser voice that is still talking (safe when there is no voice). */
export function stopSpeaking(): void {
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  } catch {
    // no voice available
  }
}

/** Speak a sentence with the browser voice (used for spoken help at Simple). */
export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.9
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch {
    // no voice available
  }
}
