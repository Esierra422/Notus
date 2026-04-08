/**
 * Client-side image compression for profile pictures.
 * Stores as base64 data URL in Firestore — no Firebase Storage required.
 * Firestore doc limit ~1MB; we compress to stay under ~400KB.
 */
const DEFAULTS = {
  maxSize: 400,
  quality: 0.8,
  maxDataSize: 400 * 1024, // ~400KB
  format: 'image/webp',
}

export function compressImageToDataUrl(file, options = {}) {
  const { maxSize, quality, maxDataSize, format } = { ...DEFAULTS, ...options }
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = (height / width) * maxSize
          width = maxSize
        } else {
          width = (width / height) * maxSize
          height = maxSize
        }
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      let q = quality
      let dataUrl = canvas.toDataURL(format, q)
      while (dataUrl.length > maxDataSize && q > 0.3) {
        q -= 0.1
        dataUrl = canvas.toDataURL(format, Math.max(0.3, q))
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
