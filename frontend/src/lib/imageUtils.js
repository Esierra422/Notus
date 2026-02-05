/**
 * Client-side image compression for profile pictures.
 * Stores as base64 data URL in Firestore — no Firebase Storage required.
 * Firestore doc limit ~1MB; we compress to stay under ~400KB.
 */
const MAX_SIZE = 400
const QUALITY = 0.8
const MAX_DATA_SIZE = 400 * 1024 // ~400KB

export function compressImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) {
          height = (height / width) * MAX_SIZE
          width = MAX_SIZE
        } else {
          width = (width / height) * MAX_SIZE
          height = MAX_SIZE
        }
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      let q = QUALITY
      let dataUrl = canvas.toDataURL('image/jpeg', q)
      while (dataUrl.length > MAX_DATA_SIZE && q > 0.3) {
        q -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', Math.max(0.3, q))
      }
      resolve(dataUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image.'))
    }
    img.src = url
  })
}
