/**
 * Country codes and phone number formatting by country.
 * Phone numbers are stored as E.164 (e.g. +12025551234).
 * Comprehensive list of all countries — Israel excluded.
 */

/** All countries with dial code and formatting rules (Israel excluded) */
export const COUNTRY_CODES = [
  { code: '+1', dialCode: '1', country: 'United States / Canada', maxLen: 10 },
  { code: '+7', dialCode: '7', country: 'Russia / Kazakhstan', maxLen: 10 },
  { code: '+20', dialCode: '20', country: 'Egypt', maxLen: 10 },
  { code: '+27', dialCode: '27', country: 'South Africa', maxLen: 9 },
  { code: '+30', dialCode: '30', country: 'Greece', maxLen: 10 },
  { code: '+31', dialCode: '31', country: 'Netherlands', maxLen: 9 },
  { code: '+32', dialCode: '32', country: 'Belgium', maxLen: 9 },
  { code: '+33', dialCode: '33', country: 'France', maxLen: 9 },
  { code: '+34', dialCode: '34', country: 'Spain', maxLen: 9 },
  { code: '+36', dialCode: '36', country: 'Hungary', maxLen: 9 },
  { code: '+39', dialCode: '39', country: 'Italy / Vatican', maxLen: 10 },
  { code: '+40', dialCode: '40', country: 'Romania', maxLen: 10 },
  { code: '+41', dialCode: '41', country: 'Switzerland', maxLen: 9 },
  { code: '+43', dialCode: '43', country: 'Austria', maxLen: 10 },
  { code: '+44', dialCode: '44', country: 'United Kingdom', maxLen: 11 },
  { code: '+45', dialCode: '45', country: 'Denmark', maxLen: 8 },
  { code: '+46', dialCode: '46', country: 'Sweden', maxLen: 9 },
  { code: '+47', dialCode: '47', country: 'Norway', maxLen: 8 },
  { code: '+48', dialCode: '48', country: 'Poland', maxLen: 9 },
  { code: '+49', dialCode: '49', country: 'Germany', maxLen: 11 },
  { code: '+51', dialCode: '51', country: 'Peru', maxLen: 9 },
  { code: '+52', dialCode: '52', country: 'Mexico', maxLen: 10 },
  { code: '+53', dialCode: '53', country: 'Cuba', maxLen: 8 },
  { code: '+54', dialCode: '54', country: 'Argentina', maxLen: 10 },
  { code: '+55', dialCode: '55', country: 'Brazil', maxLen: 11 },
  { code: '+56', dialCode: '56', country: 'Chile', maxLen: 9 },
  { code: '+57', dialCode: '57', country: 'Colombia', maxLen: 10 },
  { code: '+58', dialCode: '58', country: 'Venezuela', maxLen: 10 },
  { code: '+60', dialCode: '60', country: 'Malaysia', maxLen: 10 },
  { code: '+61', dialCode: '61', country: 'Australia', maxLen: 9 },
  { code: '+62', dialCode: '62', country: 'Indonesia', maxLen: 11 },
  { code: '+63', dialCode: '63', country: 'Philippines', maxLen: 10 },
  { code: '+64', dialCode: '64', country: 'New Zealand', maxLen: 9 },
  { code: '+65', dialCode: '65', country: 'Singapore', maxLen: 8 },
  { code: '+66', dialCode: '66', country: 'Thailand', maxLen: 9 },
  { code: '+81', dialCode: '81', country: 'Japan', maxLen: 10 },
  { code: '+82', dialCode: '82', country: 'South Korea', maxLen: 10 },
  { code: '+84', dialCode: '84', country: 'Vietnam', maxLen: 9 },
  { code: '+86', dialCode: '86', country: 'China', maxLen: 11 },
  { code: '+90', dialCode: '90', country: 'Turkey', maxLen: 10 },
  { code: '+91', dialCode: '91', country: 'India', maxLen: 10 },
  { code: '+92', dialCode: '92', country: 'Pakistan', maxLen: 10 },
  { code: '+93', dialCode: '93', country: 'Afghanistan', maxLen: 9 },
  { code: '+94', dialCode: '94', country: 'Sri Lanka', maxLen: 9 },
  { code: '+95', dialCode: '95', country: 'Myanmar', maxLen: 9 },
  { code: '+98', dialCode: '98', country: 'Iran', maxLen: 10 },
  { code: '+211', dialCode: '211', country: 'South Sudan', maxLen: 9 },
  { code: '+212', dialCode: '212', country: 'Morocco / Western Sahara', maxLen: 9 },
  { code: '+213', dialCode: '213', country: 'Algeria', maxLen: 9 },
  { code: '+216', dialCode: '216', country: 'Tunisia', maxLen: 8 },
  { code: '+218', dialCode: '218', country: 'Libya', maxLen: 9 },
  { code: '+220', dialCode: '220', country: 'Gambia', maxLen: 7 },
  { code: '+221', dialCode: '221', country: 'Senegal', maxLen: 9 },
  { code: '+222', dialCode: '222', country: 'Mauritania', maxLen: 8 },
  { code: '+223', dialCode: '223', country: 'Mali', maxLen: 8 },
  { code: '+224', dialCode: '224', country: 'Guinea', maxLen: 9 },
  { code: '+225', dialCode: '225', country: 'Ivory Coast', maxLen: 10 },
  { code: '+226', dialCode: '226', country: 'Burkina Faso', maxLen: 8 },
  { code: '+227', dialCode: '227', country: 'Niger', maxLen: 8 },
  { code: '+228', dialCode: '228', country: 'Togo', maxLen: 8 },
  { code: '+229', dialCode: '229', country: 'Benin', maxLen: 8 },
  { code: '+230', dialCode: '230', country: 'Mauritius', maxLen: 8 },
  { code: '+231', dialCode: '231', country: 'Liberia', maxLen: 8 },
  { code: '+232', dialCode: '232', country: 'Sierra Leone', maxLen: 8 },
  { code: '+233', dialCode: '233', country: 'Ghana', maxLen: 9 },
  { code: '+234', dialCode: '234', country: 'Nigeria', maxLen: 10 },
  { code: '+235', dialCode: '235', country: 'Chad', maxLen: 8 },
  { code: '+236', dialCode: '236', country: 'Central African Republic', maxLen: 8 },
  { code: '+237', dialCode: '237', country: 'Cameroon', maxLen: 8 },
  { code: '+238', dialCode: '238', country: 'Cape Verde', maxLen: 7 },
  { code: '+239', dialCode: '239', country: 'São Tomé and Príncipe', maxLen: 7 },
  { code: '+240', dialCode: '240', country: 'Equatorial Guinea', maxLen: 9 },
  { code: '+241', dialCode: '241', country: 'Gabon', maxLen: 8 },
  { code: '+242', dialCode: '242', country: 'Republic of Congo', maxLen: 9 },
  { code: '+243', dialCode: '243', country: 'DR Congo', maxLen: 9 },
  { code: '+244', dialCode: '244', country: 'Angola', maxLen: 9 },
  { code: '+245', dialCode: '245', country: 'Guinea-Bissau', maxLen: 7 },
  { code: '+248', dialCode: '248', country: 'Seychelles', maxLen: 7 },
  { code: '+249', dialCode: '249', country: 'Sudan', maxLen: 9 },
  { code: '+250', dialCode: '250', country: 'Rwanda', maxLen: 9 },
  { code: '+251', dialCode: '251', country: 'Ethiopia', maxLen: 9 },
  { code: '+252', dialCode: '252', country: 'Somalia', maxLen: 8 },
  { code: '+253', dialCode: '253', country: 'Djibouti', maxLen: 8 },
  { code: '+254', dialCode: '254', country: 'Kenya', maxLen: 9 },
  { code: '+255', dialCode: '255', country: 'Tanzania', maxLen: 9 },
  { code: '+256', dialCode: '256', country: 'Uganda', maxLen: 9 },
  { code: '+257', dialCode: '257', country: 'Burundi', maxLen: 8 },
  { code: '+258', dialCode: '258', country: 'Mozambique', maxLen: 9 },
  { code: '+260', dialCode: '260', country: 'Zambia', maxLen: 9 },
  { code: '+261', dialCode: '261', country: 'Madagascar', maxLen: 9 },
  { code: '+262', dialCode: '262', country: 'Réunion / Mayotte', maxLen: 9 },
  { code: '+263', dialCode: '263', country: 'Zimbabwe', maxLen: 9 },
  { code: '+264', dialCode: '264', country: 'Namibia', maxLen: 9 },
  { code: '+265', dialCode: '265', country: 'Malawi', maxLen: 9 },
  { code: '+266', dialCode: '266', country: 'Lesotho', maxLen: 8 },
  { code: '+267', dialCode: '267', country: 'Botswana', maxLen: 8 },
  { code: '+268', dialCode: '268', country: 'Eswatini', maxLen: 8 },
  { code: '+269', dialCode: '269', country: 'Comoros', maxLen: 7 },
  { code: '+290', dialCode: '290', country: 'Saint Helena', maxLen: 4 },
  { code: '+291', dialCode: '291', country: 'Eritrea', maxLen: 7 },
  { code: '+297', dialCode: '297', country: 'Aruba', maxLen: 8 },
  { code: '+298', dialCode: '298', country: 'Faroe Islands', maxLen: 6 },
  { code: '+299', dialCode: '299', country: 'Greenland', maxLen: 6 },
  { code: '+350', dialCode: '350', country: 'Gibraltar', maxLen: 8 },
  { code: '+351', dialCode: '351', country: 'Portugal', maxLen: 9 },
  { code: '+352', dialCode: '352', country: 'Luxembourg', maxLen: 9 },
  { code: '+353', dialCode: '353', country: 'Ireland', maxLen: 9 },
  { code: '+354', dialCode: '354', country: 'Iceland', maxLen: 7 },
  { code: '+355', dialCode: '355', country: 'Albania', maxLen: 9 },
  { code: '+356', dialCode: '356', country: 'Malta', maxLen: 8 },
  { code: '+357', dialCode: '357', country: 'Cyprus', maxLen: 8 },
  { code: '+358', dialCode: '358', country: 'Finland', maxLen: 10 },
  { code: '+359', dialCode: '359', country: 'Bulgaria', maxLen: 9 },
  { code: '+370', dialCode: '370', country: 'Lithuania', maxLen: 8 },
  { code: '+371', dialCode: '371', country: 'Latvia', maxLen: 8 },
  { code: '+372', dialCode: '372', country: 'Estonia', maxLen: 8 },
  { code: '+373', dialCode: '373', country: 'Moldova', maxLen: 8 },
  { code: '+374', dialCode: '374', country: 'Armenia', maxLen: 8 },
  { code: '+375', dialCode: '375', country: 'Belarus', maxLen: 9 },
  { code: '+376', dialCode: '376', country: 'Andorra', maxLen: 6 },
  { code: '+377', dialCode: '377', country: 'Monaco', maxLen: 8 },
  { code: '+378', dialCode: '378', country: 'San Marino', maxLen: 10 },
  { code: '+380', dialCode: '380', country: 'Ukraine', maxLen: 9 },
  { code: '+381', dialCode: '381', country: 'Serbia', maxLen: 9 },
  { code: '+382', dialCode: '382', country: 'Montenegro', maxLen: 8 },
  { code: '+383', dialCode: '383', country: 'Kosovo', maxLen: 9 },
  { code: '+385', dialCode: '385', country: 'Croatia', maxLen: 8 },
  { code: '+386', dialCode: '386', country: 'Slovenia', maxLen: 8 },
  { code: '+387', dialCode: '387', country: 'Bosnia and Herzegovina', maxLen: 8 },
  { code: '+389', dialCode: '389', country: 'North Macedonia', maxLen: 8 },
  { code: '+420', dialCode: '420', country: 'Czech Republic', maxLen: 9 },
  { code: '+421', dialCode: '421', country: 'Slovakia', maxLen: 9 },
  { code: '+423', dialCode: '423', country: 'Liechtenstein', maxLen: 7 },
  { code: '+500', dialCode: '500', country: 'Falkland Islands', maxLen: 5 },
  { code: '+501', dialCode: '501', country: 'Belize', maxLen: 7 },
  { code: '+502', dialCode: '502', country: 'Guatemala', maxLen: 8 },
  { code: '+503', dialCode: '503', country: 'El Salvador', maxLen: 8 },
  { code: '+504', dialCode: '504', country: 'Honduras', maxLen: 8 },
  { code: '+505', dialCode: '505', country: 'Nicaragua', maxLen: 8 },
  { code: '+506', dialCode: '506', country: 'Costa Rica', maxLen: 8 },
  { code: '+507', dialCode: '507', country: 'Panama', maxLen: 8 },
  { code: '+508', dialCode: '508', country: 'Saint Pierre and Miquelon', maxLen: 6 },
  { code: '+509', dialCode: '509', country: 'Haiti', maxLen: 8 },
  { code: '+590', dialCode: '590', country: 'Guadeloupe / Saint Martin', maxLen: 9 },
  { code: '+591', dialCode: '591', country: 'Bolivia', maxLen: 9 },
  { code: '+592', dialCode: '592', country: 'Guyana', maxLen: 7 },
  { code: '+593', dialCode: '593', country: 'Ecuador', maxLen: 9 },
  { code: '+594', dialCode: '594', country: 'French Guiana', maxLen: 9 },
  { code: '+595', dialCode: '595', country: 'Paraguay', maxLen: 9 },
  { code: '+596', dialCode: '596', country: 'Martinique', maxLen: 9 },
  { code: '+597', dialCode: '597', country: 'Suriname', maxLen: 7 },
  { code: '+598', dialCode: '598', country: 'Uruguay', maxLen: 8 },
  { code: '+599', dialCode: '599', country: 'Caribbean Netherlands / Curaçao', maxLen: 8 },
  { code: '+670', dialCode: '670', country: 'East Timor', maxLen: 8 },
  { code: '+672', dialCode: '672', country: 'Antarctica', maxLen: 6 },
  { code: '+673', dialCode: '673', country: 'Brunei', maxLen: 7 },
  { code: '+674', dialCode: '674', country: 'Nauru', maxLen: 7 },
  { code: '+675', dialCode: '675', country: 'Papua New Guinea', maxLen: 8 },
  { code: '+676', dialCode: '676', country: 'Tonga', maxLen: 7 },
  { code: '+677', dialCode: '677', country: 'Solomon Islands', maxLen: 7 },
  { code: '+678', dialCode: '678', country: 'Vanuatu', maxLen: 7 },
  { code: '+679', dialCode: '679', country: 'Fiji', maxLen: 7 },
  { code: '+680', dialCode: '680', country: 'Palau', maxLen: 7 },
  { code: '+681', dialCode: '681', country: 'Wallis and Futuna', maxLen: 6 },
  { code: '+682', dialCode: '682', country: 'Cook Islands', maxLen: 5 },
  { code: '+683', dialCode: '683', country: 'Niue', maxLen: 4 },
  { code: '+685', dialCode: '685', country: 'Samoa', maxLen: 7 },
  { code: '+686', dialCode: '686', country: 'Kiribati', maxLen: 8 },
  { code: '+687', dialCode: '687', country: 'New Caledonia', maxLen: 6 },
  { code: '+688', dialCode: '688', country: 'Tuvalu', maxLen: 5 },
  { code: '+689', dialCode: '689', country: 'French Polynesia', maxLen: 8 },
  { code: '+690', dialCode: '690', country: 'Tokelau', maxLen: 4 },
  { code: '+691', dialCode: '691', country: 'Micronesia', maxLen: 7 },
  { code: '+692', dialCode: '692', country: 'Marshall Islands', maxLen: 7 },
  { code: '+850', dialCode: '850', country: 'North Korea', maxLen: 10 },
  { code: '+852', dialCode: '852', country: 'Hong Kong', maxLen: 8 },
  { code: '+853', dialCode: '853', country: 'Macau', maxLen: 8 },
  { code: '+855', dialCode: '855', country: 'Cambodia', maxLen: 9 },
  { code: '+856', dialCode: '856', country: 'Laos', maxLen: 9 },
  { code: '+880', dialCode: '880', country: 'Bangladesh', maxLen: 10 },
  { code: '+886', dialCode: '886', country: 'Taiwan', maxLen: 9 },
  { code: '+960', dialCode: '960', country: 'Maldives', maxLen: 7 },
  { code: '+961', dialCode: '961', country: 'Lebanon', maxLen: 8 },
  { code: '+962', dialCode: '962', country: 'Jordan', maxLen: 9 },
  { code: '+963', dialCode: '963', country: 'Syria', maxLen: 9 },
  { code: '+964', dialCode: '964', country: 'Iraq', maxLen: 10 },
  { code: '+965', dialCode: '965', country: 'Kuwait', maxLen: 8 },
  { code: '+966', dialCode: '966', country: 'Saudi Arabia', maxLen: 9 },
  { code: '+967', dialCode: '967', country: 'Yemen', maxLen: 9 },
  { code: '+968', dialCode: '968', country: 'Oman', maxLen: 8 },
  { code: '+970', dialCode: '970', country: 'Palestine', maxLen: 9 },
  { code: '+971', dialCode: '971', country: 'UAE', maxLen: 9 },
  { code: '+973', dialCode: '973', country: 'Bahrain', maxLen: 8 },
  { code: '+974', dialCode: '974', country: 'Qatar', maxLen: 8 },
  { code: '+975', dialCode: '975', country: 'Bhutan', maxLen: 8 },
  { code: '+976', dialCode: '976', country: 'Mongolia', maxLen: 8 },
  { code: '+977', dialCode: '977', country: 'Nepal', maxLen: 10 },
  { code: '+992', dialCode: '992', country: 'Tajikistan', maxLen: 9 },
  { code: '+993', dialCode: '993', country: 'Turkmenistan', maxLen: 8 },
  { code: '+994', dialCode: '994', country: 'Azerbaijan', maxLen: 9 },
  { code: '+995', dialCode: '995', country: 'Georgia', maxLen: 9 },
  { code: '+996', dialCode: '996', country: 'Kyrgyzstan', maxLen: 9 },
  { code: '+998', dialCode: '998', country: 'Uzbekistan', maxLen: 9 },
  // Caribbean NANP (share +1)
  { code: '+1242', dialCode: '1242', country: 'Bahamas', maxLen: 7 },
  { code: '+1246', dialCode: '1246', country: 'Barbados', maxLen: 7 },
  { code: '+1264', dialCode: '1264', country: 'Anguilla', maxLen: 7 },
  { code: '+1268', dialCode: '1268', country: 'Antigua and Barbuda', maxLen: 7 },
  { code: '+1284', dialCode: '1284', country: 'British Virgin Islands', maxLen: 7 },
  { code: '+1340', dialCode: '1340', country: 'US Virgin Islands', maxLen: 7 },
  { code: '+1345', dialCode: '1345', country: 'Cayman Islands', maxLen: 7 },
  { code: '+1441', dialCode: '1441', country: 'Bermuda', maxLen: 7 },
  { code: '+1473', dialCode: '1473', country: 'Grenada', maxLen: 7 },
  { code: '+1649', dialCode: '1649', country: 'Turks and Caicos', maxLen: 7 },
  { code: '+1658', dialCode: '1658', country: 'Jamaica', maxLen: 7 },
  { code: '+1664', dialCode: '1664', country: 'Montserrat', maxLen: 7 },
  { code: '+1670', dialCode: '1670', country: 'Northern Mariana Islands', maxLen: 7 },
  { code: '+1671', dialCode: '1671', country: 'Guam', maxLen: 7 },
  { code: '+1684', dialCode: '1684', country: 'American Samoa', maxLen: 7 },
  { code: '+1721', dialCode: '1721', country: 'Sint Maarten', maxLen: 7 },
  { code: '+1758', dialCode: '1758', country: 'Saint Lucia', maxLen: 7 },
  { code: '+1767', dialCode: '1767', country: 'Dominica', maxLen: 7 },
  { code: '+1784', dialCode: '1784', country: 'Saint Vincent and the Grenadines', maxLen: 7 },
  { code: '+1787', dialCode: '1787', country: 'Puerto Rico', maxLen: 7 },
  { code: '+1809', dialCode: '1809', country: 'Dominican Republic', maxLen: 7 },
  { code: '+1868', dialCode: '1868', country: 'Trinidad and Tobago', maxLen: 7 },
  { code: '+1869', dialCode: '1869', country: 'Saint Kitts and Nevis', maxLen: 7 },
  { code: '+1876', dialCode: '1876', country: 'Jamaica', maxLen: 7 },
]

/** Parse E.164 string into { code, national } or null */
export function parseE164(value) {
  if (!value || typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  if (digits.length < 7) return null
  // Match longest dial code first (e.g. +1242 before +1)
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length)
  for (const { code, dialCode } of sorted) {
    if (digits.startsWith(dialCode)) {
      const national = digits.slice(dialCode.length)
      const entry = COUNTRY_CODES.find((c) => c.code === code)
      if (entry && national.length <= (entry.maxLen || 15)) {
        return { code, national }
      }
    }
  }
  return null
}

/** Build E.164 from country code and national digits */
export function toE164(code, digits) {
  if (!code || !digits) return ''
  const d = String(digits).replace(/\D/g, '')
  if (d.length === 0) return ''
  const cleanCode = (code.startsWith('+') ? code.slice(1) : code).replace(/\D/g, '')
  return `+${cleanCode}${d}`
}

/** Format national digits for display (country-specific) */
export function formatPhoneByCountry(code, digits) {
  const d = String(digits ?? '').replace(/\D/g, '')
  if (d.length === 0) return ''
  // US/Canada +1: (XXX) XXX-XXXX
  if (code === '+1' || code === '1') {
    if (d.length <= 3) return d
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`
  }
  // UK +44: XXXX XXX XXXX
  if (code === '+44' || code === '44') {
    if (d.length <= 4) return d
    if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 11)}`
  }
  // Default: group of 3–4 digits
  return d.replace(/(\d{1,3})(?=\d)/g, '$1 ').trim()
}

/** Format E.164 value for display (e.g. +1 (202) 555-1234) */
export function formatPhoneForDisplay(value) {
  const parsed = parseE164(value)
  if (!parsed) return value || ''
  const formatted = formatPhoneByCountry(parsed.code, parsed.national)
  return formatted ? `${parsed.code} ${formatted}` : parsed.code
}

/** Extract national digits from formatted input */
export function extractNationalNumber(code, input) {
  const d = String(input ?? '').replace(/\D/g, '')
  if (d.length < 4) return null
  const entry = COUNTRY_CODES.find((c) => c.code === code)
  const maxLen = entry?.maxLen ?? 15
  return { digits: d.slice(0, maxLen) }
}
