import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { SearchHit } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import {
  clearRememberedDir,
  hasRememberedDir,
  pickDownloadFolder,
  saveDownload,
} from '../lib/download'
import {
  briefLabel,
  buildExpression,
  fieldSubValue,
  RECORD_FIELDS,
  SEARCH_FIELDS,
  type SearchFilter,
} from '../lib/irbisFields'
import { useToast } from '../ui/ToastContext'

function newFilter(): SearchFilter {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fieldId: 'author',
    value: '',
  }
}

type ColumnPick = { tag: number; code: string; label: string }

function cellKey(mfn: number, tag: number, code: string): string {
  return `${mfn}|${tag}|${code}`
}

function seedDraft(hits: SearchHit[], cols: ColumnPick[]): Record<string, string> {
  const next: Record<string, string> = {}
  for (const hit of hits) {
    for (const c of cols) {
      next[cellKey(hit.mfn, c.tag, c.code)] = fieldSubValue(hit.record?.fields, c.tag, c.code)
    }
  }
  return next
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function SearchPage() {
  const { user, config } = useAuth()
  const { pushError } = useToast()

  const databases = useMemo(() => {
    const fromRights = Object.keys(user?.databases ?? {})
    const fromServer = config?.irbis.databases?.map((d) => d.name) ?? []
    const set = new Set([...fromRights, ...fromServer])
    const list = [...set].sort()
    return list.length ? list : ['IBIS']
  }, [user, config])

  const [database, setDatabase] = useState(databases[0] || 'IBIS')
  useEffect(() => {
    if (!databases.includes(database) && databases[0]) setDatabase(databases[0])
  }, [databases, database])
  const [filters, setFilters] = useState<SearchFilter[]>([newFilter()])
  const [hits, setHits] = useState<SearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [expression, setExpression] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Map<number, SearchHit>>(new Map())
  const [trayOpen, setTrayOpen] = useState(false)
  const [collectOpen, setCollectOpen] = useState(false)
  const [columns, setColumns] = useState<ColumnPick[]>([
    { tag: 700, code: 'a', label: 'Автор' },
    { tag: 200, code: 'a', label: 'Заглавие' },
    { tag: 910, code: 'b', label: 'Инв. номер' },
  ])
  const [templates, setTemplates] = useState<string[]>(['dopshab', 'shabl'])
  const [printTemplate, setPrintTemplate] = useState('dopshab')
  const [docName, setDocName] = useState('')
  const [printBusy, setPrintBusy] = useState(false)
  const [folderRemembered, setFolderRemembered] = useState(false)
  /** Editable table cells for print / table download (not written back to Irbis). */
  const [draft, setDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!collectOpen) return
    setFolderRemembered(hasRememberedDir())
    setDraft(seedDraft([...selected.values()], columns))
    api
      .listPrintTemplates()
      .then((res) => {
        if (res.templates?.length) {
          setTemplates(res.templates)
          setPrintTemplate((cur) => (res.templates.includes(cur) ? cur : res.templates[0]))
        }
      })
      .catch(() => {
        /* keep defaults */
      })
    // Seed once when opening; column adds merge separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [collectOpen])

  async function runSearch(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    try {
      const expr = buildExpression(filters)
      const res = await api.search(database, {
        expression: expr,
        limit: 50,
        offset: 0,
        with_records: true,
      })
      setHits(res.hits)
      setTotal(res.total ?? res.count)
      setExpression(res.expression)
    } catch (err) {
      pushError(err instanceof Error ? err.message : 'Ошибка поиска')
    } finally {
      setBusy(false)
    }
  }

  function updateFilter(id: string, patch: Partial<SearchFilter>) {
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function toggleSelect(hit: SearchHit) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(hit.mfn)) next.delete(hit.mfn)
      else next.set(hit.mfn, hit)
      return next
    })
    setTrayOpen(true)
  }

  function removeSelected(mfn: number) {
    setSelected((prev) => {
      const next = new Map(prev)
      next.delete(mfn)
      return next
    })
  }

  function addColumn(tag: number, code: string, label: string) {
    setColumns((prev) => {
      if (prev.some((c) => c.tag === tag && c.code === code)) return prev
      const next = [...prev, { tag, code, label }]
      setDraft((d) => {
        const merged = { ...d }
        for (const hit of selected.values()) {
          const k = cellKey(hit.mfn, tag, code)
          if (!(k in merged)) merged[k] = fieldSubValue(hit.record?.fields, tag, code)
        }
        return merged
      })
      return next
    })
  }

  function setCell(mfn: number, tag: number, code: string, value: string) {
    setDraft((prev) => ({ ...prev, [cellKey(mfn, tag, code)]: value }))
  }

  function cellValue(mfn: number, tag: number, code: string): string {
    const k = cellKey(mfn, tag, code)
    if (k in draft) return draft[k]
    const hit = selected.get(mfn)
    return fieldSubValue(hit?.record?.fields, tag, code)
  }

  const selectedList = [...selected.values()]

  async function chooseFolder() {
    try {
      const ok = await pickDownloadFolder()
      setFolderRemembered(ok || hasRememberedDir())
      if (!ok) pushError('Выбор папки не поддерживается в этом браузере — будет диалог сохранения файла')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      pushError(err instanceof Error ? err.message : 'Не удалось выбрать папку')
    }
  }

  function defaultDocBase(): string {
    return (
      docName.trim() ||
      `${printTemplate}_${selected.size}_${new Date().toISOString().slice(0, 10)}`
    )
  }

  async function downloadPrint() {
    if (selected.size === 0) return
    setPrintBusy(true)
    try {
      const mfns = [...selected.keys()]
      const { blob, filename } = await api.print(database, {
        template: printTemplate,
        mfns,
        filename: defaultDocBase(),
      })
      await saveDownload(blob, filename, '.rtf')
      setFolderRemembered(hasRememberedDir())
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      pushError(err instanceof Error ? err.message : 'Ошибка скачивания')
    } finally {
      setPrintBusy(false)
    }
  }

  async function downloadEditedTable() {
    if (selectedList.length === 0) return
    setPrintBusy(true)
    try {
      const title = escapeHtml(docName.trim() || 'Инвентарная книга')
      const head = ['MFN', ...columns.map((c) => c.label)]
        .map((h) => `<th>${escapeHtml(h)}</th>`)
        .join('')
      const body = selectedList
        .map((hit) => {
          const cells = [
            String(hit.mfn),
            ...columns.map((c) => cellValue(hit.mfn, c.tag, c.code)),
          ]
          return `<tr>${cells.map((v) => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`
        })
        .join('\n')
      const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: Georgia, serif; color: #17241f; margin: 1.5rem; }
  h1 { font-size: 1.35rem; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border: 1px solid #b9c8c0; padding: 0.45rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #e8eeeb; }
</style></head><body>
<h1>${title}</h1>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      await saveDownload(blob, `${defaultDocBase()}.html`, '.html')
      setFolderRemembered(hasRememberedDir())
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      pushError(err instanceof Error ? err.message : 'Ошибка скачивания таблицы')
    } finally {
      setPrintBusy(false)
    }
  }

  return (
    <div className="search-page">
      <header className="page-head">
        <h1>Поиск</h1>
        <p>Фильтры по полям Ирбис; можно добавить несколько условий (логика «И»).</p>
      </header>

      <form className="search-bar" onSubmit={runSearch}>
        <label className="db-select">
          <span className="sr-only">База</span>
          <select value={database} onChange={(e) => setDatabase(e.target.value)} aria-label="База данных">
            {databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </select>
        </label>

        <div className="filters-block">
          {filters.map((f, idx) => {
            const def = SEARCH_FIELDS.find((x) => x.id === f.fieldId)
            return (
              <div key={f.id} className="filter-row">
                <select
                  value={f.fieldId}
                  onChange={(e) => updateFilter(f.id, { fieldId: e.target.value })}
                  aria-label={`Поле фильтра ${idx + 1}`}
                >
                  {SEARCH_FIELDS.map((sf) => (
                    <option key={sf.id} value={sf.id}>
                      {sf.label}
                      {sf.prefix ? ` (${sf.prefix})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  value={f.value}
                  onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                  placeholder={def?.raw ? 'Например "A=ПУШКИН$" * "G=2020"' : 'Значение'}
                  aria-label={`Значение фильтра ${idx + 1}`}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={filters.length === 1}
                  onClick={() => setFilters((prev) => prev.filter((x) => x.id !== f.id))}
                  aria-label="Удалить фильтр"
                >
                  −
                </button>
              </div>
            )
          })}
          <button type="button" className="btn btn-link" onClick={() => setFilters((prev) => [...prev, newFilter()])}>
            + добавить фильтр
          </button>
        </div>

        <button type="submit" className="btn btn-primary search-submit" disabled={busy}>
          {busy ? 'Ищем…' : 'Поиск'}
        </button>
      </form>

      {expression && (
        <p className="expr-hint">
          Выражение: <code>{expression}</code>
          {total > 0 ? ` · найдено ${total}` : null}
        </p>
      )}

      <div className="results">
        {hits.length === 0 && !busy && <p className="empty">Нет результатов — задайте фильтры и нажмите «Поиск».</p>}
        {hits.map((hit) => {
          const checked = selected.has(hit.mfn)
          const title = fieldSubValue(hit.record?.fields, 200, 'a') || briefLabel(hit)
          const author = fieldSubValue(hit.record?.fields, 700, 'a')
          const year = fieldSubValue(hit.record?.fields, 210, 'd')
          const inv = fieldSubValue(hit.record?.fields, 910, 'b')
          return (
            <article key={hit.mfn} className={`result-card ${checked ? 'is-selected' : ''}`}>
              <label className="result-check">
                <input type="checkbox" checked={checked} onChange={() => toggleSelect(hit)} />
                <span className="sr-only">Выбрать MFN {hit.mfn}</span>
              </label>
              <div className="result-body">
                <h2>{title}</h2>
                <p className="result-meta">
                  MFN {hit.mfn}
                  {author ? ` · ${author}` : ''}
                  {year ? ` · ${year}` : ''}
                  {inv ? ` · инв. ${inv}` : ''}
                </p>
              </div>
            </article>
          )
        })}
      </div>

      {(trayOpen || selected.size > 0) && (
        <aside className={`select-tray ${selected.size ? 'has-items' : ''}`} aria-label="Выбранные записи">
          <div className="tray-head">
            <strong>Выбрано: {selected.size}</strong>
            <button type="button" className="btn btn-ghost" onClick={() => setTrayOpen((v) => !v)}>
              {trayOpen ? 'Свернуть' : 'Открыть'}
            </button>
          </div>
          {trayOpen && (
            <>
              <ul className="tray-list">
                {selectedList.length === 0 && <li className="muted">Отметьте записи галочкой</li>}
                {selectedList.map((hit) => (
                  <li key={hit.mfn}>
                    <span>{briefLabel(hit)}</span>
                    <button type="button" className="btn btn-ghost" onClick={() => removeSelected(hit.mfn)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-primary tray-collect"
                disabled={selected.size === 0}
                onClick={() => setCollectOpen(true)}
              >
                Собрать
              </button>
            </>
          )}
        </aside>
      )}

      {collectOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setCollectOpen(false)}>
          <div
            className="modal collect-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collect-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2 id="collect-title">Инвентарная книга</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setCollectOpen(false)} aria-label="Закрыть">
                ×
              </button>
            </div>
            <p className="muted">
              Ячейки можно править перед печатью или скачиванием таблицы. RTF по шаблону берётся с сервера из записей Ирбис.
            </p>

            <div className="print-opts">
              <label>
                Шаблон
                <select value={printTemplate} onChange={(e) => setPrintTemplate(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="print-name">
                Имя файла
                <input
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  placeholder="необязательно — подставится само"
                  aria-label="Имя документа"
                />
              </label>
              <div className="print-folder">
                <button type="button" className="btn btn-ghost" onClick={chooseFolder}>
                  {folderRemembered ? 'Сменить папку' : 'Выбрать папку'}
                </button>
                {folderRemembered && (
                  <button
                    type="button"
                    className="btn btn-link"
                    onClick={() => {
                      clearRememberedDir()
                      setFolderRemembered(false)
                    }}
                  >
                    сбросить
                  </button>
                )}
                <span className="muted small">
                  {folderRemembered ? 'Папка запомнена до закрытия вкладки' : 'Можно скачать без выбора папки'}
                </span>
              </div>
            </div>

            <div className="column-picker">
              <span>Добавить поле:</span>
              <select
                defaultValue=""
                onChange={(e) => {
                  const [tagS, code] = e.target.value.split(':')
                  const tag = Number(tagS)
                  const rf = RECORD_FIELDS.find((r) => r.tag === tag)
                  const sf = rf?.subfields.find((s) => s.code === code)
                  if (rf && sf) addColumn(tag, code, `${rf.label} / ${sf.label}`)
                  e.target.value = ''
                }}
              >
                <option value="" disabled>
                  выбрать поле и подполе…
                </option>
                {RECORD_FIELDS.map((rf) =>
                  rf.subfields.map((sf) => (
                    <option key={`${rf.tag}:${sf.code}`} value={`${rf.tag}:${sf.code}`}>
                      {rf.tag} {rf.label} — ^{sf.code} {sf.label}
                    </option>
                  )),
                )}
              </select>
            </div>

            <div className="collect-table-wrap">
              <table className="collect-table">
                <thead>
                  <tr>
                    <th>MFN</th>
                    {columns.map((c) => (
                      <th key={`${c.tag}:${c.code}`}>
                        {c.label}
                        <button
                          type="button"
                          className="th-remove"
                          onClick={() =>
                            setColumns((prev) => prev.filter((x) => !(x.tag === c.tag && x.code === c.code)))
                          }
                        >
                          ×
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedList.map((hit) => (
                    <tr key={hit.mfn}>
                      <td className="cell-mfn">{hit.mfn}</td>
                      {columns.map((c) => (
                        <td key={`${c.tag}:${c.code}`}>
                          <textarea
                            className="cell-edit"
                            rows={2}
                            value={cellValue(hit.mfn, c.tag, c.code)}
                            onChange={(e) => setCell(hit.mfn, c.tag, c.code, e.target.value)}
                            aria-label={`${c.label}, MFN ${hit.mfn}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-primary" disabled={printBusy || selected.size === 0} onClick={downloadPrint}>
                {printBusy ? 'Готовим…' : 'Скачать RTF'}
              </button>
              <button type="button" className="btn btn-ghost" disabled={printBusy || selected.size === 0} onClick={downloadEditedTable}>
                Скачать таблицу
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  window.print()
                }}
              >
                Печать таблицы
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setCollectOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
