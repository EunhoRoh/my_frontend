import { useEffect } from 'react'

/**
 * Full-screen celebratory overlay shown briefly when a talent event happens
 * (receiving talent or donating). Auto-dismisses.
 */
const PARTICLES = Array.from({ length: 14 }, (_, i) => i)

const VARIANTS = {
  receive: {
    emoji: '🎁',
    confetti: ['💛', '✨', '🌟', '🍃'],
    ring: 'from-amber-300 to-emerald-300',
  },
  donate: {
    emoji: '💝',
    confetti: ['💖', '✨', '🌠', '💫'],
    ring: 'from-rose-300 to-amber-300',
  },
}

const Celebration = ({ show, variant = 'receive', title, subtitle, onDone, duration = 1800 }) => {
  useEffect(() => {
    if (!show) return
    const id = setTimeout(() => onDone?.(), duration)
    return () => clearTimeout(id)
  }, [show, duration, onDone])

  if (!show) return null
  const v = VARIANTS[variant] ?? VARIANTS.receive

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none overflow-hidden"
      aria-live="polite"
    >
      {/* confetti */}
      {PARTICLES.map((i) => {
        const left = (i * 37) % 100
        const emoji = v.confetti[i % v.confetti.length]
        return (
          <span
            key={i}
            className="absolute -top-8 animate-confetti-fall select-none"
            style={{
              left: `${left}%`,
              fontSize: 18 + (i % 4) * 6,
              animationDelay: `${(i % 7) * 0.12}s`,
            }}
          >
            {emoji}
          </span>
        )
      })}

      {/* center badge */}
      <div className="animate-badge-pop text-center">
        <div
          className={`mx-auto mb-3 grid place-items-center w-24 h-24 rounded-full bg-gradient-to-br ${v.ring} shadow-xl shadow-black/10`}
        >
          <span className="text-5xl">{v.emoji}</span>
        </div>
        {title && (
          <p className="text-white text-xl font-extrabold drop-shadow-lg [text-shadow:_0_2px_8px_rgba(0,0,0,0.35)]">
            {title}
          </p>
        )}
        {subtitle && (
          <p className="mt-1 text-white/90 text-sm font-medium drop-shadow [text-shadow:_0_1px_4px_rgba(0,0,0,0.4)]">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

export default Celebration
