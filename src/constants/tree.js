import tree1 from '../assets/tree-characters/stage1.gif'
import tree2 from '../assets/tree-characters/tree_2.png'
import tree3 from '../assets/tree-characters/tree_3.png'
import tree4 from '../assets/tree-characters/tree_4.png'
import tree5 from '../assets/tree-characters/tree_5.png'

// Personal tree images (used in the teacher view's per-student thumbnails)
export const TREE_IMAGES = [tree1, tree2, tree3, tree4, tree5]

// true = animated GIF (CSS idle/breathe animations are skipped so the GIF can play)
export const TREE_IMAGE_ANIMATED = [true, false, false, false, false]

// ── Community tree images (5 stages: 0% / 25% / 50% / 75% / 100% of the goal) ──
// TODO: replace these with the dedicated community-tree GIFs once provided.
//   1) drop the files into src/assets/community-tree/ (e.g. community_1.gif … community_5.gif)
//   2) import them here and swap them into COMMUNITY_IMAGES below
//   3) set COMMUNITY_IMAGE_ANIMATED[i] = true for each animated GIF
// For now they reuse the personal images as placeholders so the app still runs.
export const COMMUNITY_IMAGES = [tree1, tree2, tree3, tree4, tree5]
export const COMMUNITY_IMAGE_ANIMATED = [true, false, false, false, false]

// Personal tree stages (driven by talent received from teachers)
export const PERSONAL_STAGES = [
  { icon: '🌱', label: '새싹 단계', description: '윙크 표정 새싹이 싹틔었어요!' },
  { icon: '🌿', label: '작은 묘목 단계', description: '뽀뽀 표정 묘목이 쑥쑥 자라요!' },
  { icon: '🌳', label: '좀 큰 나무 단계', description: '하트뿅뿅! 사랑 가득 작은 나무예요!' },
  { icon: '🍃', label: '푸릇한 나무 단계', description: '활짝 웃는 웅장한 나무가 되었어요!' },
  { icon: '🍎', label: '열매 달린 나무 단계', description: '행복 홍조! 열매 가득 열렸어요!' },
]

// Community tree stages (driven by everyone's donations)
export const COMMUNITY_STAGES = [
  { icon: '✨', label: '씨앗을 심었어요', description: '우리의 나눔이 막 시작됐어요.' },
  { icon: '🌟', label: '함께 싹틔웠어요', description: '여러 친구의 마음이 모이고 있어요!' },
  { icon: '💫', label: '무럭무럭 자라요', description: '나눔의 나무가 절반을 넘었어요!' },
  { icon: '🌠', label: '풍성해지고 있어요', description: '거의 다 왔어요, 조금만 더!' },
  { icon: '🎆', label: '활짝 피었어요!', description: '우리 모두의 사랑이 열매를 맺었어요!' },
]

export function stageFromTalent(total) {
  if (total >= 40) return 4
  if (total >= 30) return 3
  if (total >= 20) return 2
  if (total >= 10) return 1
  return 0
}
