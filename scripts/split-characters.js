import { existsSync, readdirSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const assetsDir = path.join(root, 'src', 'assets', 'tree-characters')

const CROP_PADDING = 0.1

const OUTPUTS = [
  'tree_1.png',
  'tree_2.png',
  'tree_3.png',
  'tree_4.png',
  'tree_5.png',
]

const SOURCE_CANDIDATES = [
  path.join(assetsDir, 'all_stages_original.png'),
  path.join(assetsDir, 'source.png'),
  path.join(assetsDir, 'watermarked_img_18047021111054366655.png'),
  path.join(root, 'watermarked_img_18047021111054366655.png'),
]

const EXCLUDED_SOURCE_FILES = new Set([
  ...OUTPUTS,
  'stage-0-sprout.png',
  'stage-1-seedling.png',
  'stage-2-small-tree.png',
  'stage-3-lush-tree.png',
  'stage-4-fruit-tree.png',
])

function findSourceImage() {
  for (const candidate of SOURCE_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  if (!existsSync(assetsDir)) {
    return null
  }

  const pngFiles = readdirSync(assetsDir)
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .filter((file) => !EXCLUDED_SOURCE_FILES.has(file))

  if (pngFiles.length === 0) {
    return null
  }

  if (pngFiles.length === 1) {
    return path.join(assetsDir, pngFiles[0])
  }

  return pngFiles
    .map((file) => path.join(assetsDir, file))
    .sort((a, b) => statSync(b).size - statSync(a).size)[0]
}

function getGridRegions(width, height) {
  const headerHeight = Math.round(height * 0.17)
  const contentTop = headerHeight
  const contentHeight = height - contentTop
  const rowHeight = Math.round(contentHeight / 2)
  const topRowWidth = Math.floor(width / 3)
  const bottomRowWidth = Math.floor(width / 2)

  return [
    { left: 0, top: contentTop, width: topRowWidth, height: rowHeight },
    { left: topRowWidth, top: contentTop, width: topRowWidth, height: rowHeight },
    {
      left: topRowWidth * 2,
      top: contentTop,
      width: width - topRowWidth * 2,
      height: rowHeight,
    },
    {
      left: 0,
      top: contentTop + rowHeight,
      width: bottomRowWidth,
      height: height - contentTop - rowHeight,
    },
    {
      left: bottomRowWidth,
      top: contentTop + rowHeight,
      width: width - bottomRowWidth,
      height: height - contentTop - rowHeight,
    },
  ]
}

function getCharacterCrop(region) {
  const topInset = Math.round(region.height * 0.22)
  const bottomInset = Math.round(region.height * 0.14)
  const sideInset = Math.round(region.width * 0.06)

  return {
    left: region.left + sideInset,
    top: region.top + topInset,
    width: Math.max(1, region.width - sideInset * 2),
    height: Math.max(1, region.height - topInset - bottomInset),
  }
}

function applyPadding(region, paddingRatio, imageWidth, imageHeight) {
  const padX = Math.round(region.width * paddingRatio)
  const padY = Math.round(region.height * paddingRatio)

  const left = Math.max(0, region.left - padX)
  const top = Math.max(0, region.top - padY)
  const right = Math.min(imageWidth, region.left + region.width + padX)
  const bottom = Math.min(imageHeight, region.top + region.height + padY)

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

function sampleBackgroundColor(pixels, width, height, channels) {
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ]

  let red = 0
  let green = 0
  let blue = 0

  for (const [x, y] of points) {
    const index = (y * width + x) * channels
    red += pixels[index]
    green += pixels[index + 1]
    blue += pixels[index + 2]
  }

  const count = points.length
  return {
    r: Math.round(red / count),
    g: Math.round(green / count),
    b: Math.round(blue / count),
  }
}

async function removeCardBackground(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  const pixels = new Uint8ClampedArray(data)
  const background = sampleBackgroundColor(pixels, width, height, channels)
  const threshold = 44
  const feather = 18

  for (let index = 0; index < pixels.length; index += channels) {
    const red = pixels[index]
    const green = pixels[index + 1]
    const blue = pixels[index + 2]
    const distance = Math.hypot(red - background.r, green - background.g, blue - background.b)

    if (distance < threshold) {
      pixels[index + 3] = 0
      continue
    }

    const isGreenish = green > red + 8 && green > blue + 8 && green > 140
    if (isGreenish && distance < threshold + 24) {
      const fade = (distance - threshold) / feather
      pixels[index + 3] = Math.round(Math.min(255, Math.max(0, fade * 255)))
      continue
    }

    if (distance < threshold + feather) {
      const fade = (distance - threshold) / feather
      pixels[index + 3] = Math.round(Math.min(255, Math.max(pixels[index + 3], fade * 255)))
    }
  }

  return sharp(Buffer.from(pixels), {
    raw: { width, height, channels: 4 },
  }).png().toBuffer()
}

async function addTransparentPadding(inputBuffer, paddingRatio) {
  const trimmedBuffer = await sharp(inputBuffer).trim().png().toBuffer()
  const { width, height } = await sharp(trimmedBuffer).metadata()

  if (!width || !height) {
    return trimmedBuffer
  }

  const padX = Math.round(width * paddingRatio)
  const padY = Math.round(height * paddingRatio)

  return sharp(trimmedBuffer)
    .extend({
      top: padY,
      bottom: padY,
      left: padX,
      right: padX,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  console.log('🌱 split-characters 시작...\n')

  const source = findSourceImage()

  if (!source) {
    console.error('❌ 원본 이미지를 찾을 수 없습니다.\n')
    console.error('아래 폴더에 전체 가이드 이미지를 넣어 주세요:')
    console.error(`   ${assetsDir}\n`)
    console.error('권장 파일명: all_stages_original.png')
    process.exit(1)
  }

  await mkdir(assetsDir, { recursive: true })

  const metadata = await sharp(source).metadata()
  const { width, height } = metadata

  if (!width || !height) {
    console.error('❌ 이미지 크기를 읽을 수 없습니다.')
    process.exit(1)
  }

  console.log(`📂 원본: ${source}`)
  console.log(`📐 원본 해상도: ${width} x ${height}px (리사이즈 없이 픽셀 단위 추출)`)
  console.log(`🧱 캐릭터 주변 여백: ${CROP_PADDING * 100}%`)
  console.log('✂️  캐릭터 추출 + 배경 투명 처리 중...\n')

  const regions = getGridRegions(width, height)

  for (let index = 0; index < OUTPUTS.length; index += 1) {
    const outputPath = path.join(assetsDir, OUTPUTS[index])
    const cardRegion = regions[index]
    const characterRegion = getCharacterCrop(cardRegion)
    const paddedRegion = applyPadding(characterRegion, CROP_PADDING, width, height)

    const extracted = await sharp(source)
      .extract(paddedRegion)
      .png({ quality: 100 })
      .toBuffer()

    const transparent = await removeCardBackground(extracted)
    const finalImage = await addTransparentPadding(transparent, CROP_PADDING)

    await sharp(finalImage).toFile(outputPath)

    const outputMeta = await sharp(outputPath).metadata()
    console.log(
      `   ✅ ${OUTPUTS[index]}`,
    )
    console.log(
      `      추출 영역: ${paddedRegion.width}x${paddedRegion.height}px (원본 픽셀 그대로)`,
    )
    console.log(
      `      최종 파일: ${outputMeta.width}x${outputMeta.height}px (다운스케일 없음)`,
    )
  }

  console.log('\n🎉 완료! 캐릭터 전용 이미지 저장 위치:')
  console.log(`   ${assetsDir}\n`)
  OUTPUTS.forEach((file) => console.log(`   - ${file}`))
  console.log('\n이제 개발 서버를 실행해 보세요:')
  console.log('   npm run dev\n')
}

main().catch((error) => {
  console.error('\n❌ split-characters 실행 중 오류가 발생했습니다.\n')
  console.error(error.message || error)
  process.exit(1)
})
