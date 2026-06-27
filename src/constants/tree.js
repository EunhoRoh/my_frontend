// Community tree growth videos (mp4 — smaller than GIF, smooth playback).
import community1 from '../assets/tree-characters/tree_1.mp4'
import community2 from '../assets/tree-characters/tree_2.mp4'
import community3 from '../assets/tree-characters/tree_3.mp4'
import community4 from '../assets/tree-characters/tree_4.mp4'

// ── Community tree (4 stages, driven by everyone's cumulative donations) ──
//   stage 0: 1단계 · stage 1: +2개 · stage 2: +3개 · stage 3: +3개  (누적 2 / 5 / 8)
export const COMMUNITY_VIDEOS = [community1, community2, community3, community4]

// Community tree stages (4 stages, driven by everyone's donations)
export const COMMUNITY_STAGES = [
  { icon: '🌱', label: '씨앗을 심었어요', description: '우리의 나눔이 막 시작됐어요.' },
  { icon: '🌿', label: '함께 싹틔웠어요', description: '여러 친구의 마음이 모이고 있어요!' },
  { icon: '🌳', label: '무럭무럭 자라요', description: '나눔의 나무가 쑥쑥 자라고 있어요!' },
  { icon: '🎆', label: '활짝 피었어요!', description: '우리 모두의 사랑이 열매를 맺었어요!' },
]

// Cumulative donated talent needed for each community stage (mirrors backend).
export const COMMUNITY_THRESHOLDS = [0, 2, 5, 8]

export function stageFromTalent(total) {
  let stage = 0
  COMMUNITY_THRESHOLDS.forEach((t, i) => {
    if (total >= t) stage = i
  })
  return stage
}
