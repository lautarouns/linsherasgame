'use client'
import { useEffect, useRef } from 'react'

export default function IntroScreen({ onStart }: { onStart: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onStart() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onStart])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const colors = ['#f7c948', '#26ff6a', '#9b59ff', '#ff3d71', '#3d8bff']
    let w = 0, h = 0, raf = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const dots = Array.from({ length: 90 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: 0.6 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 0.22, vy: -0.08 - Math.random() * 0.3,
      a: 0.15 + Math.random() * 0.5, tw: Math.random() * Math.PI * 2,
      c: colors[Math.floor(Math.random() * colors.length)],
    }))

    const frame = () => {
      ctx.clearRect(0, 0, w, h)
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy; d.tw += 0.02
        if (d.y < -10) { d.y = h + 10; d.x = Math.random() * w }
        if (d.x < -10) d.x = w + 10
        if (d.x > w + 10) d.x = -10
        ctx.globalAlpha = d.a * (0.55 + 0.45 * Math.sin(d.tw))
        ctx.fillStyle = d.c
        ctx.shadowBlur = 12
        ctx.shadowColor = d.c
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0
      raf = requestAnimationFrame(frame)
    }
    frame()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <div className="intro-overlay">
      <canvas ref={canvasRef} className="intro-canvas" />
      <div className="intro-glow" />
      <div className="intro-content">
        <div className="intro-eyebrow">Cinco juegos diarios</div>
        <h1 className="animated-title intro-title">Linsheradle</h1>
        <div className="intro-rule" />
        <p className="intro-sub">Uno nuevo cada día a medianoche. Canciones, jugadores, juegos, anime y cine.</p>
        <button type="button" className="intro-btn" onClick={onStart}>Empezar</button>
        <div className="intro-hint">Enter para continuar</div>
      </div>
    </div>
  )
}