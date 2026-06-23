import { useEffect, useState } from 'react'
import TreeCharacter from './components/TreeCharacter'
import { loadCodeState, redeemCode } from './utils/codeStorage'

const GOAL_TALENT = 40

const TREE_STAGES = [
  {
    min: 0,
    icon: '🌱',
    label: '새싹 단계',
    description: '윙크 표정 새싹이 싹틔었어요!',
  },
  {
    min: 10,
    icon: '🌿',
    label: '작은 묘목 단계',
    description: '뽀뽀 표정 묘목이 쑥쑥 자라요!',
  },
  {
    min: 20,
    icon: '🌳',
    label: '좀 큰 나무 단계',
    description: '하트뿅뿅! 사랑 가득 작은 나무예요!',
  },
  {
    min: 30,
    icon: '🍃',
    label: '푸릇한 나무 단계',
    description: '활짝 웃는 웅장한 나무가 되었어요!',
  },
  {
    min: 40,
    icon: '🍎',
    label: '열매 달린 나무 단계',
    description: '행복 홍조! 열매 가득 열렸어요!',
  },
]

const ERROR_MESSAGES = {
  invalid: {
    title: '올바른 기부 코드가 아닙니다!',
    description: '코드를 다시 확인해 주세요.',
  },
  used: {
    title: '이미 사용된 코드입니다!',
    description: '이 코드는 한 번만 사용할 수 있어요.',
  },
}

function getTreeStage(total) {
  if (total >= 40) return { ...TREE_STAGES[4], index: 4 }
  if (total >= 30) return { ...TREE_STAGES[3], index: 3 }
  if (total >= 20) return { ...TREE_STAGES[2], index: 2 }
  if (total >= 10) return { ...TREE_STAGES[1], index: 1 }
  return { ...TREE_STAGES[0], index: 0 }
}

function App() {
  const [totalTalent, setTotalTalent] = useState(0)
  const [code, setCode] = useState('')
  const [errorType, setErrorType] = useState(null)
  const [codeState, setCodeState] = useState(null)

  useEffect(() => {
    loadCodeState()
      .then(setCodeState)
      .catch(() => setErrorType('invalid'))
  }, [])

  const stage = getTreeStage(totalTalent)
  const progress = Math.min((totalTalent / GOAL_TALENT) * 100, 100)
  const errorMessage = errorType ? ERROR_MESSAGES[errorType] : null

  const handleDonate = () => {
    if (!codeState) return

    const result = redeemCode(codeState, code)

    if (!result.ok) {
      setErrorType(result.reason)
      return
    }

    setErrorType(null)
    setCodeState(result.state)
    setTotalTalent((prev) => prev + result.amount)
    setCode('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleDonate()
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-emerald-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-emerald-100/60 border border-emerald-100">
        {/* 상단 */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-7 text-white text-center rounded-t-3xl">
          <h1 className="text-lg font-bold leading-snug">
            🌱 성령의 나무가 푸릇푸릇 자라고 있어요!
          </h1>
          <p className="mt-3 text-emerald-50 text-sm font-medium tracking-wide">
            현재 누적:{' '}
            <span className="text-white font-bold text-base">
              {totalTalent} / {GOAL_TALENT} TALENT
            </span>
          </p>

          <div className="mt-4 h-2 bg-white/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 중앙 - 3D 캐릭터 나무 단계 */}
        <div className="px-6 py-8">
          <div className="border-2 border-dashed border-emerald-200 rounded-2xl bg-white/70 px-4 py-8 overflow-visible text-center transition-all duration-500">
            <TreeCharacter talent={totalTalent} />
            <p className="text-emerald-800 font-semibold text-lg">
              {stage.icon} {stage.label}
            </p>
            <p className="mt-3 text-emerald-600/80 text-sm font-medium">
              {stage.description}
            </p>
            <p className="mt-4 text-emerald-600/70 text-sm">
              {totalTalent < GOAL_TALENT
                ? `목표까지 ${GOAL_TALENT - totalTalent} 달란트 남았어요`
                : '목표 달성! 나무에 열매가 열렸어요 🎉'}
            </p>
          </div>
        </div>

        {/* 하단 - 기부 입력 */}
        <div className="px-6 pb-7 space-y-3">
          <label htmlFor="donation-code" className="block text-sm font-medium text-gray-600">
            기부 코드 입력
          </label>
          <input
            id="donation-code"
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              if (errorType) setErrorType(null)
            }}
            onKeyDown={handleKeyDown}
            placeholder="예: 사랑새싹-03"
            disabled={!codeState}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleDonate}
            disabled={!codeState}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-base shadow-md shadow-emerald-200 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            기부하기
          </button>
        </div>
      </div>

      {/* 경고 모달 */}
      {errorMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
          onClick={() => setErrorType(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl px-6 py-5 max-w-xs w-full text-center animate-[fadeIn_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-3xl mb-3">{errorType === 'used' ? '🔒' : '😢'}</p>
            <p className="text-gray-800 font-semibold text-base">
              {errorMessage.title}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              {errorMessage.description}
            </p>
            <button
              type="button"
              onClick={() => setErrorType(null)}
              className="mt-4 w-full py-2.5 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-600 transition"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
