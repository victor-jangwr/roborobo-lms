import * as XLSX from 'xlsx'

type ClaudeWin = { claude?: { use?: (n: string) => Promise<{ save: (r: { filename: string; data: ArrayBuffer }) => Promise<unknown> } | null> } }

/** 파일 저장: 미리보기(Claude 아티팩트)에서는 downloads 기능, 실제 배포에서는 브라우저 다운로드 */
export async function saveFile(filename: string, data: ArrayBuffer): Promise<'saved' | 'declined' | 'unavailable'> {
  const w = window as unknown as ClaudeWin
  if (w.claude?.use) {
    try {
      const dl = await w.claude.use('downloads')
      if (!dl) return 'unavailable'
      await dl.save({ filename, data })
      return 'saved'
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unavailable'
    }
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'saved'
}

export function workbook(sheets: { name: string; rows: Record<string, string | number>[] }[]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows)
    const keys = Object.keys(s.rows[0] ?? {})
    ws['!cols'] = keys.map(k => ({ wch: Math.max(8, k.length * 2 + 2, ...s.rows.slice(0, 50).map(r => String(r[k] ?? '').length + 2)) }))
    XLSX.utils.book_append_sheet(wb, ws, s.name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

export async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
}

export const STUDENT_TEMPLATE_COLS = ['이름', '출생연도', '학년', '학교', '학부모 이름', '학부모 연락처', '메모']
