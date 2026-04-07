/**
 * Client-side export of meeting notes / transcripts to PDF (jspdf) and Word (docx).
 */

function safeFileBase(title) {
  return (
    String(title || 'meeting')
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 72) || 'meeting'
  )
}

function triggerDownload(blob, filename) {
  const u = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = u
  a.download = filename
  a.click()
  URL.revokeObjectURL(u)
}

function addWrappedText(doc, text, margin, startY, pageW, lineHeight = 6) {
  let y = startY
  const maxY = doc.internal.pageSize.getHeight() - 14
  doc.setFontSize(10)
  const lines = doc.splitTextToSize(String(text || ''), pageW)
  for (const line of lines) {
    if (y > maxY) {
      doc.addPage()
      y = 18
    }
    doc.text(line, margin, y)
    y += lineHeight
  }
  return y + 4
}

/**
 * @param {object} summary - Firestore meetingSummaries doc shape
 */
export async function downloadMeetingSummaryPdf(summary) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 14
  const pageW = doc.internal.pageSize.getWidth() - margin * 2
  let y = 18
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(String(summary?.title || 'Meeting summary'), margin, y)
  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(`Exported ${new Date().toLocaleString()}`, margin, y)
  y += 8
  doc.setTextColor(0, 0, 0)
  if (summary?.wordCount != null) {
    doc.text(`Approx. words transcribed: ${summary.wordCount}`, margin, y)
    y += 7
  }
  y += 2
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Summary', margin, y)
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  y = addWrappedText(doc, summary?.summary || '(No summary body.)', margin, y, pageW)
  const kps = Array.isArray(summary?.keyPoints) ? summary.keyPoints : []
  if (kps.length) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      y = 18
    }
    doc.text('Key points', margin, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    for (const p of kps) {
      y = addWrappedText(doc, `• ${p}`, margin, y, pageW)
    }
  }
  const acts = Array.isArray(summary?.actionItems) ? summary.actionItems : []
  if (acts.length) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      y = 18
    }
    doc.text('Action items', margin, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    for (const p of acts) {
      y = addWrappedText(doc, `• ${p}`, margin, y, pageW)
    }
  }
  const tr = String(summary?.transcript || '').trim()
  if (tr) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    if (y > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      y = 18
    }
    doc.text('Full transcript', margin, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    y = addWrappedText(doc, tr, margin, y, pageW, 5)
  }
  doc.save(`${safeFileBase(summary?.title)}-meeting-notes.pdf`)
}

export async function downloadMeetingSummaryDocx(summary) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx')
  const children = [
    new Paragraph({
      text: String(summary?.title || 'Meeting summary'),
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Exported ${new Date().toLocaleString()}`,
          italics: true,
          size: 20,
        }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: String(summary?.summary || '(No summary body.)') }),
  ]
  const kps = Array.isArray(summary?.keyPoints) ? summary.keyPoints : []
  if (kps.length) {
    children.push(new Paragraph({ text: 'Key points', heading: HeadingLevel.HEADING_2 }))
    for (const p of kps) {
      children.push(new Paragraph({ text: `• ${p}` }))
    }
  }
  const acts = Array.isArray(summary?.actionItems) ? summary.actionItems : []
  if (acts.length) {
    children.push(new Paragraph({ text: 'Action items', heading: HeadingLevel.HEADING_2 }))
    for (const p of acts) {
      children.push(new Paragraph({ text: `• ${p}` }))
    }
  }
  const tr = String(summary?.transcript || '').trim()
  if (tr) {
    children.push(new Paragraph({ text: 'Full transcript', heading: HeadingLevel.HEADING_2 }))
    for (const chunk of tr.match(/[\s\S]{1,5000}/g) || [tr]) {
      children.push(new Paragraph({ text: chunk }))
    }
  }
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, `${safeFileBase(summary?.title)}-meeting-notes.docx`)
}

/**
 * @param {string} title
 * @param {string} fullText
 * @param {{ timeLabel?: string, speaker?: string, text: string }[]} [segments] — optional structured lines
 */
export async function downloadTranscriptPdf(title, fullText, segments) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 14
  const pageW = doc.internal.pageSize.getWidth() - margin * 2
  let y = 18
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text(String(title || 'Transcript'), margin, y)
  y += 9
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  doc.text(`Exported ${new Date().toLocaleString()}`, margin, y)
  y += 10
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(10)
  const body =
    Array.isArray(segments) && segments.length
      ? segments
          .map((s) => {
            const head = [s.timeLabel, s.speaker].filter(Boolean).join(' · ')
            return head ? `[${head}] ${s.text}` : s.text
          })
          .join('\n\n')
      : String(fullText || '')
  y = addWrappedText(doc, body || '(Empty.)', margin, y, pageW)
  doc.save(`${safeFileBase(title)}-transcript.pdf`)
}

export async function downloadTranscriptDocx(title, fullText, segments) {
  const { Document, Packer, Paragraph, HeadingLevel } = await import('docx')
  const children = [
    new Paragraph({ text: String(title || 'Transcript'), heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `Exported ${new Date().toLocaleString()}` }),
    new Paragraph({ text: '' }),
  ]
  if (Array.isArray(segments) && segments.length) {
    for (const s of segments) {
      const head = [s.timeLabel, s.speaker].filter(Boolean).join(' · ')
      children.push(new Paragraph({ text: head ? `[${head}] ${s.text}` : s.text }))
    }
  } else {
    for (const chunk of String(fullText || '').match(/[\s\S]{1,4000}/g) || ['']) {
      children.push(new Paragraph({ text: chunk || ' ' }))
    }
  }
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, `${safeFileBase(title)}-transcript.docx`)
}
