import { TREE_IMAGES } from '../constants/tree'

/**
 * Personal tree — a single growing character in a green garden frame.
 */
const TreeCharacter = ({ stage = 0, size = 320 }) => {
  const image = TREE_IMAGES[Math.max(0, Math.min(4, stage))]

  return (
    <div className="flex justify-center items-end w-full">
      <img
        src={image}
        alt={`나무 ${stage + 1}단계`}
        className="tree-character-image animate-tree-breathe h-auto max-w-full select-none"
        style={{ width: size }}
      />
    </div>
  )
}

export default TreeCharacter
