import { spawn } from 'node:child_process'

/**
 * Speak with the operating system's own voice so a summary can play even
 * when the window is closed (tray mode). Windows: SAPI via PowerShell.
 * macOS: `say`. Linux: espeak/spd-say when installed. Never throws.
 */
export function speakWithOs(text: string): void {
  const clean = text.replace(/[\r\n]+/g, ' ').slice(0, 4000)
  try {
    if (process.platform === 'win32') {
      const script =
        'Add-Type -AssemblyName System.Speech; ' +
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
        '$s.Rate = 0; $s.Speak([Console]::In.ReadToEnd())'
      const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true })
      child.on('error', () => {})
      child.stdin.end(clean)
    } else if (process.platform === 'darwin') {
      spawn('say', [clean], { stdio: 'ignore' }).on('error', () => {})
    } else {
      const child = spawn('spd-say', [clean], { stdio: 'ignore' })
      child.on('error', () => spawn('espeak', [clean], { stdio: 'ignore' }).on('error', () => {}))
    }
  } catch {
    // voice is a nicety; never fail a run over it
  }
}
