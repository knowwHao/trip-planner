import type { PhotoData } from '@/types'

/** 大圖長邊與縮圖長邊（px）；壓完的 data URL 要符合 schema.sql 的 wish_photos 長度上限 */
const FULL_EDGE = 1280
const THUMB_EDGE = 240
const FULL_MAX_CHARS = 690_000
const THUMB_MAX_CHARS = 59_000

async function loadImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap 會依 EXIF 轉正手機直拍的照片；不支援時退回 <img>（現代瀏覽器也會自動轉正）
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // 例如舊版 Safari 不認得選項，改用 <img>
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function render(src: ImageBitmap | HTMLImageElement, edge: number, maxChars: number): string {
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height
  const scale = Math.min(1, edge / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')!
  // 透明的 PNG 轉 JPEG 會變黑底，先鋪白
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q)
    if (url.length <= maxChars) return url
  }
  throw new Error('照片太大，換一張試試')
}

/** 把使用者選的照片壓成大圖與縮圖（JPEG data URL） */
export async function compressPhoto(file: Blob): Promise<PhotoData> {
  if (!file.type.startsWith('image/')) throw new Error('只能放照片')
  let src: ImageBitmap | HTMLImageElement
  try {
    src = await loadImage(file)
  } catch {
    throw new Error('讀不到這張照片，換一張試試')
  }
  try {
    return { full: render(src, FULL_EDGE, FULL_MAX_CHARS), thumb: render(src, THUMB_EDGE, THUMB_MAX_CHARS) }
  } finally {
    if ('close' in src) src.close()
  }
}
