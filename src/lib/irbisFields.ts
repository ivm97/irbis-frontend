/** Именованные поисковые префиксы ИРБИС (mode API / сырое выражение). */
export type SearchFieldDef = {
  id: string
  label: string
  /** API mode, если есть; иначе собираем expression вручную */
  mode?: string
  prefix?: string
  raw?: boolean
}

export const SEARCH_FIELDS: SearchFieldDef[] = [
  { id: 'author', label: 'Автор', mode: 'author', prefix: 'A=' },
  { id: 'title', label: 'Заглавие', mode: 'title', prefix: 'T=' },
  { id: 'keyword', label: 'Ключевые слова', mode: 'keyword', prefix: 'K=' },
  { id: 'inventory', label: 'Инвентарный номер', mode: 'inventory', prefix: 'IN=' },
  { id: 'index', label: 'Шифр / ISBN', mode: 'index', prefix: 'I=' },
  { id: 'year', label: 'Год', mode: 'year', prefix: 'G=' },
  { id: 'publisher', label: 'Издательство', mode: 'publisher', prefix: 'O=' },
  { id: 'subject', label: 'Предметная рубрика', mode: 'subject', prefix: 'S=' },
  { id: 'language', label: 'Язык', mode: 'language', prefix: 'J=' },
  { id: 'raw', label: 'Сырое выражение', raw: true },
]

/** Поля записи для просмотра / инвентарной книги. */
export type RecordFieldDef = {
  tag: number
  label: string
  subfields: { code: string; label: string }[]
}

export const RECORD_FIELDS: RecordFieldDef[] = [
  {
    tag: 200,
    label: 'Заглавие',
    subfields: [
      { code: 'a', label: 'Основное заглавие' },
      { code: 'e', label: 'Сведения' },
      { code: 'v', label: 'Номер тома' },
    ],
  },
  {
    tag: 700,
    label: 'Автор',
    subfields: [
      { code: 'a', label: 'Фамилия' },
      { code: 'b', label: 'Инициалы' },
      { code: 'g', label: 'Полное имя' },
    ],
  },
  {
    tag: 210,
    label: 'Выходные данные',
    subfields: [
      { code: 'a', label: 'Место' },
      { code: 'c', label: 'Издательство' },
      { code: 'd', label: 'Год' },
    ],
  },
  {
    tag: 910,
    label: 'Экземпляр',
    subfields: [
      { code: 'b', label: 'Инвентарный номер' },
      { code: 'a', label: 'Статус' },
      { code: 'd', label: 'Дата' },
      { code: 'h', label: 'Место хранения' },
    ],
  },
  {
    tag: 903,
    label: 'Шифр',
    subfields: [{ code: 'a', label: 'Значение' }],
  },
  {
    tag: 101,
    label: 'Язык',
    subfields: [{ code: 'a', label: 'Код языка' }],
  },
]

export type SearchFilter = {
  id: string
  fieldId: string
  value: string
}

function wrapTerm(prefix: string, value: string): string {
  const v = value.trim()
  if (!v) return `"${prefix}$"`
  if (v.endsWith('$') || /[*?]/.test(v) || v.startsWith('"')) {
    return v.startsWith('"') ? v : `"${prefix}${v}"`
  }
  return `"${prefix}${v}$"`
}

/** Собирает выражение ИРБИС из фильтров (логика И). */
export function buildExpression(filters: SearchFilter[]): string {
  const parts: string[] = []
  for (const f of filters) {
    const def = SEARCH_FIELDS.find((x) => x.id === f.fieldId)
    if (!def) continue
    const val = f.value.trim()
    if (!val && !def.raw) continue
    if (def.raw) {
      parts.push(val)
      continue
    }
    if (def.prefix) parts.push(wrapTerm(def.prefix, val))
  }
  if (parts.length === 0) return '*'
  if (parts.length === 1) return parts[0]
  return `(${parts.join(' * ')})`
}

export function fieldSubValue(
  fields: { tag: number; value?: string; subfields?: { code: string; value: string }[] }[] | undefined,
  tag: number,
  code?: string,
): string {
  if (!fields) return ''
  const matches = fields.filter((f) => f.tag === tag)
  if (matches.length === 0) return ''
  if (!code) {
    return matches
      .map((f) => f.value || f.subfields?.map((s) => s.value).join(' ') || '')
      .filter(Boolean)
      .join('; ')
  }
  return matches
    .map((f) => f.subfields?.find((s) => s.code === code)?.value || '')
    .filter(Boolean)
    .join('; ')
}

export function briefLabel(hit: {
  mfn: number
  description?: string
  record?: { fields: { tag: number; value?: string; subfields?: { code: string; value: string }[] }[] }
}): string {
  if (hit.description?.trim()) return hit.description.trim()
  const title = fieldSubValue(hit.record?.fields, 200, 'a')
  const author = fieldSubValue(hit.record?.fields, 700, 'a')
  if (title || author) return [author, title].filter(Boolean).join(' — ')
  return `MFN ${hit.mfn}`
}
