import { useEffect, useState } from 'react'
import type { Messages } from './i18n'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallHint({ labels, visible }: { labels: Messages; visible: boolean }) {
  const [offer, setOffer] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)')
    const sync = () => setInstalled(mode.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone)
    const capture = (event: Event) => { event.preventDefault(); setOffer(event as InstallEvent) }
    const finish = () => { setOffer(null); setInstalled(true) }
    sync()
    mode.addEventListener('change', sync)
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', finish)
    return () => {
      mode.removeEventListener('change', sync)
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', finish)
    }
  }, [])
  if (!visible || installed || !window.isSecureContext) return null
  if (offer) return <button type="button" className="secondary install-hint" onClick={async () => {
    setOffer(null)
    try { await offer.prompt(); await offer.userChoice } catch { /* The browser withdrew the offer. */ }
  }}>{labels.installApp}</button>
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!ios || !/Version\/.*Safari\//.test(ua) || !import.meta.env.PROD) return null
  return <details className="install-hint"><summary>{labels.installApp}</summary><p>{labels.iosInstall}</p></details>
}
