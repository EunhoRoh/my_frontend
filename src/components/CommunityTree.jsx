import { COMMUNITY_IMAGES, COMMUNITY_IMAGE_ANIMATED } from '../constants/tree'

/**
 * Community tree — visually distinct from the personal tree:
 * a golden night-sky aura with floating sparkles, representing everyone's
 * combined donations.
 */
const SPARKLES = [
  { left: '12%', top: '18%', delay: '0s', size: 14 },
  { left: '82%', top: '22%', delay: '0.6s', size: 18 },
  { left: '24%', top: '60%', delay: '1.1s', size: 12 },
  { left: '70%', top: '64%', delay: '0.3s', size: 16 },
  { left: '50%', top: '10%', delay: '0.9s', size: 20 },
  { left: '90%', top: '50%', delay: '1.4s', size: 12 },
]

const CommunityTree = ({ stage = 0, size = 240 }) => {
  const index = Math.max(0, Math.min(4, stage))
  const image = COMMUNITY_IMAGES[index]
  const isAnimated = COMMUNITY_IMAGE_ANIMATED[index]

  return (
    <div className="relative flex justify-center items-end w-full overflow-visible">
      {/* golden aura */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/30 blur-2xl animate-community-glow"
        style={{ width: size * 1.1, height: size * 1.1 }}
      />
      {/* floating sparkles */}
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="absolute animate-community-sparkle select-none"
          style={{ left: s.left, top: s.top, fontSize: s.size, animationDelay: s.delay }}
        >
          ✨
        </span>
      ))}
      <img
        src={image}
        alt={`공동체 나무 ${index + 1}단계`}
        className={`community-tree-image relative z-10 h-auto max-w-full select-none rounded-3xl${
          isAnimated ? ' community-tree-image--animated' : ' animate-tree-idle'
        }`}
        style={{ width: size }}
      />
    </div>
  )
}

export default CommunityTree
