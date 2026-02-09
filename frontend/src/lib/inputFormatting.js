/**
 * Input formatting utilities for birthdate and phone number.
 */

/**
 * Format phone number as (XXX) XXX-XXXX
 * Accepts any input, extracts digits, formats.
 */
export function formatPhoneNumber(input) {
  if (!input) return ''
  const digits = input.replace(/\D/g, '')
  if (digits.length === 0) return ''
  // Handle US country code (leading '1') as +1 (XXX) XXX-XXXX
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 11)}`
  }
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  // For longer inputs, format using the first 10 digits (ignore extensions)
  const d = digits.slice(0, 10)
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`
}

/**
 * Validate and extract phone number (digits only).
 * Returns 10-digit string or empty if invalid.
 */
export function extractPhoneNumber(input) {
  const digits = input.replace(/\D/g, '')
  // Accept 10-digit numbers or 11 digits with a leading US country code '1'
  if (digits.length === 10) return digits
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1)
  return ''
}

/**
 * Validate birthdate format (MM/DD/YYYY or YYYY-MM-DD).
 * Returns ISO date string (YYYY-MM-DD) or empty if invalid.
 */
export function validateBirthdate(input) {
  if (!input) return ''
  
  let dateObj
  
  // Try to parse various formats
  // If input is from type='date', it's already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split('-').map(Number)
    dateObj = new Date(year, month - 1, day)
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) {
    // MM/DD/YYYY or M/D/YYYY
    const [month, day, year] = input.split('/').map(Number)
    dateObj = new Date(year, month - 1, day)
  } else {
    return ''
  }
  
  // Validate the date is valid
  if (isNaN(dateObj.getTime())) return ''
  
  // Ensure not in future
  // Compare dates at local-day precision (ignore time of day)
  const dateOnly = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
  const today = new Date()
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (dateOnly > todayOnly) return ''

  // Format as ISO string (YYYY-MM-DD) using local date components
  const yyyy = dateObj.getFullYear()
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0')
  const dd = String(dateObj.getDate()).padStart(2, '0')

  return `${yyyy}-${mm}-${dd}`
}

/**
 * Format birthdate for display (MM/DD/YYYY from ISO string).
 */
export function formatBirthdateForDisplay(isoDate) {
  if (!isoDate) return ''
  const [year, month, day] = isoDate.split('-')
  return `${month}/${day}/${year}`
}
