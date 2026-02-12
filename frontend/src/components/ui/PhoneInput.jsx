/**
 * Phone input with country code selector and country-specific formatting.
 * Value/onChange use E.164 format (e.g. +12025551234).
 */
import { useState, useEffect } from 'react'
import {
  COUNTRY_CODES,
  formatPhoneByCountry,
  extractNationalNumber,
  parseE164,
  toE164,
} from '../../lib/countryCodes'

export function PhoneInput({ value = '', onChange, disabled, className, id, placeholder }) {
  const parsed = parseE164(value)
  const [countryCode, setCountryCode] = useState(parsed?.code || '+1')
  const [nationalValue, setNationalValue] = useState(
    parsed ? formatPhoneByCountry(parsed.code, parsed.national) : ''
  )

  useEffect(() => {
    const p = parseE164(value)
    if (p) {
      setCountryCode(p.code)
      setNationalValue(formatPhoneByCountry(p.code, p.national))
    } else {
      setNationalValue('')
    }
  }, [value])

  const handleCountryChange = (e) => {
    const code = e.target.value
    setCountryCode(code)
    const ext = extractNationalNumber(code, nationalValue)
    if (ext) {
      const e164 = toE164(code, ext.digits)
      onChange(e164)
      setNationalValue(formatPhoneByCountry(code, ext.digits))
    } else {
      onChange('')
      setNationalValue('')
    }
  }

  const handleNumberChange = (e) => {
    const input = e.target.value
    const formatted = formatPhoneByCountry(countryCode, input)
    setNationalValue(formatted)
    const ext = extractNationalNumber(countryCode, input)
    if (ext) {
      onChange(toE164(countryCode, ext.digits))
    } else {
      onChange('')
    }
  }

  const c = COUNTRY_CODES.find((x) => x.code === countryCode) || { maxLen: 15 }

  return (
    <div className={`phone-input-wrap ${className || ''}`}>
      <select
        value={countryCode}
        onChange={handleCountryChange}
        disabled={disabled}
        className="phone-input-country"
        aria-label="Country code"
      >
        {COUNTRY_CODES.map((opt) => (
          <option key={`${opt.code}-${opt.country}`} value={opt.code}>
            {opt.code} {opt.country}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        value={nationalValue}
        onChange={handleNumberChange}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={c.maxLen + 6}
        className="phone-input-number"
        autoComplete="tel-national"
      />
    </div>
  )
}
