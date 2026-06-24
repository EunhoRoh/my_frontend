import { TREE_IMAGES, TREE_IMAGE_ANIMATED } from '../constants/tree'

/**
 * Personal tree — a single growing character in a green garden frame.
 */
const TreeCharacter = ({ stage = 0, size = 320 }) => {
  const index = Math.max(0, Math.min(4, stage))
  const image = TREE_IMAGES[index]
  const isAnimated = TREE_IMAGE_ANIMATED[index]

  return (
    <div className="flex justify-center items-end w-full">
      <img
        src={image}
        alt={`나무 ${index + 1}단계`}
        className={`tree-character-image h-auto max-w-full select-none${
          isAnimated ? ' tree-character-image--animated' : ' animate-tree-breathe'
        }`}
        style={{ width: size }}
      />
    </div>
  )
}

export default TreeCharacter
