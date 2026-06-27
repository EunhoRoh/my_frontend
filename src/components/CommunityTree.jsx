import { COMMUNITY_VIDEOS } from '../constants/tree'

/**
 * Community tree — a growing tree video framed by a golden aura and
 * floating sparkles. The aura and sparkles live inside a wrapper that
 * shrink-wraps the video, so they are positioned relative to the tree
 * itself and automatically reposition/scale as the tree grows.
 */
// Sparkles sit around the tree's sides/corners (no star above the top).
const SPARKLES = [
  { left: '-6%', top: '10%', delay: '0s', size: 16 },
  { left: '102%', top: '16%', delay: '0.6s', size: 20 },
  { left: '-4%', top: '58%', delay: '1.1s', size: 13 },
  { left: '104%', top: '52%', delay: '0.3s', size: 17 },
  { left: '92%', top: '90%', delay: '1.4s', size: 13 },
]

const CommunityTree = ({ stage = 0, size = 240, height }) => {
  const index = Math.max(0, Math.min(COMMUNITY_VIDEOS.length - 1, stage))
  const video = COMMUNITY_VIDEOS[index]

  // Size by height when given (videos are wide ~16:9), else by width.
  const videoStyle = height != null ? { height, width: 'auto' } : { width: size }

  return (
    <div className="flex justify-center w-full overflow-visible">
      {/* wrapper shrink-wraps the video so children track the tree's size */}
      <div className="relative inline-block overflow-visible">
        {/* golden aura — sized relative to the tree */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/30 blur-2xl animate-community-glow"
          style={{ width: '112%', height: '112%' }}
        />
        {/* floating sparkles — positioned around the tree's edges */}
        {SPARKLES.map((s, i) => (
          <span
            key={i}
            className="absolute z-20 animate-community-sparkle select-none -translate-x-1/2 -translate-y-1/2"
            style={{ left: s.left, top: s.top, fontSize: s.size, animationDelay: s.delay }}
          >
            ✨
          </span>
        ))}
        <video
          key={video}
          src={video}
          autoPlay
          loop
          muted
          playsInline
          aria-label={`공동체 나무 ${index + 1}단계`}
          className="community-tree-image relative z-10 block max-w-full select-none rounded-3xl shadow-sm"
          style={videoStyle}
        />
      </div>
    </div>
  )
}

export default CommunityTree
