import { useEffect } from 'react'
import vampireBatUrl from '../assets/vampire-bat.svg'
import './VampireCursorTrail.css'

const trailIntervalMs = 40
const touchCleanupDelayMs = 50

export function VampireCursorTrail() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined
    }

    let lastBatTime = 0
    let lastTouchX = 0
    let lastTouchY = 0
    let hasLastTouch = false
    let stopTouchTimer: ReturnType<typeof setTimeout> | undefined

    const layer = document.createElement('div')
    layer.className = 'vampire-cursor-trail-layer'
    document.body.appendChild(layer)

    const clearTouchBats = () => {
      layer
        .querySelectorAll('.vampire-cursor-trail-touch')
        .forEach((element) => element.remove())
    }

    const createBat = (x: number, y: number, isTouch = false) => {
      const now = performance.now()

      if (now - lastBatTime < trailIntervalMs) {
        return
      }

      lastBatTime = now

      const bat = document.createElement('span')
      bat.className = isTouch
        ? 'vampire-cursor-trail vampire-cursor-trail-touch'
        : 'vampire-cursor-trail'

      const image = document.createElement('img')
      image.alt = ''
      image.ariaHidden = 'true'
      image.draggable = false
      image.src = vampireBatUrl
      bat.appendChild(image)

      bat.style.setProperty('--x', `${x}px`)
      bat.style.setProperty('--y', `${y}px`)
      bat.style.setProperty('--dx', `${(Math.random() - 0.5) * 45}px`)
      bat.style.setProperty('--dy', `${(Math.random() - 0.5) * 45}px`)
      bat.style.setProperty('--rot', `${(Math.random() - 0.5) * 80}deg`)
      bat.style.setProperty('--scale', `${0.45 + Math.random() * 0.35}`)

      layer.appendChild(bat)
      bat.addEventListener('animationend', () => bat.remove(), { once: true })
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') {
        createBat(event.clientX, event.clientY)
      }
    }

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) {
        return
      }

      hasLastTouch = true
      lastTouchX = touch.clientX
      lastTouchY = touch.clientY

      clearTouchBats()
    }

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!touch) {
        return
      }

      const x = touch.clientX
      const y = touch.clientY

      if (!hasLastTouch) {
        hasLastTouch = true
        lastTouchX = x
        lastTouchY = y
        return
      }

      const distance = Math.hypot(x - lastTouchX, y - lastTouchY)
      lastTouchX = x
      lastTouchY = y

      if (distance < 0.1) {
        return
      }

      createBat(x, y, true)

      if (stopTouchTimer) {
        clearTimeout(stopTouchTimer)
      }

      stopTouchTimer = window.setTimeout(() => {
        clearTouchBats()
      }, touchCleanupDelayMs)
    }

    const handleTouchEnd = () => {
      hasLastTouch = false

      if (stopTouchTimer) {
        clearTimeout(stopTouchTimer)
        stopTouchTimer = undefined
      }

      clearTouchBats()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)

      if (stopTouchTimer) {
        clearTimeout(stopTouchTimer)
      }

      layer.remove()
    }
  }, [])

  return null
}
