import tree1 from '../assets/tree-characters/tree_1.png'
import tree2 from '../assets/tree-characters/tree_2.png'
import tree3 from '../assets/tree-characters/tree_3.png'
import tree4 from '../assets/tree-characters/tree_4.png'
import tree5 from '../assets/tree-characters/tree_5.png'

const TREE_STAGES = [
  { min: 0, image: tree1, label: '새싹 단계' },
  { min: 10, image: tree2, label: '작은 묘목 단계' },
  { min: 20, image: tree3, label: '좀 큰 나무 단계' },
  { min: 30, image: tree4, label: '푸릇한 나무 단계' },
  { min: 40, image: tree5, label: '열매 달린 나무 단계' },
]

function getTreeStage(talent) {
  if (talent >= 40) return TREE_STAGES[4]
  if (talent >= 30) return TREE_STAGES[3]
  if (talent >= 20) return TREE_STAGES[2]
  if (talent >= 10) return TREE_STAGES[1]
  return TREE_STAGES[0]
}

const TreeCharacter = ({ talent }) => {
  const stage = getTreeStage(talent)

  return (
    <div className="flex justify-center items-end mt-5 mb-2 w-full">
      <img
        src={stage.image}
        alt={stage.label}
        className="tree-character-image animate-tree-breathe w-[300px] max-w-full h-auto select-none"
      />
    </div>
  )
}

export default TreeCharacter
