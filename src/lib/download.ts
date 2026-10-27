/** In-tab remembered folder (File System Access API). Lost on reload. */
let rememberedDir: FileSystemDirectoryHandle | null = null

export function hasRememberedDir(): boolean {
  return rememberedDir != null
}

export function clearRememberedDir(): void {
  rememberedDir = null
}

export async function pickDownloadFolder(): Promise<boolean> {
  const w = window as Window & {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
  if (!w.showDirectoryPicker) return false
  rememberedDir = await w.showDirectoryPicker({ mode: 'readwrite' })
  return true
}

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\n\r\t]+/g, '_').trim()
  return cleaned || 'document.rtf'
}

function ensureExt(name: string, ext: string): string {
  const n = sanitizeName(name)
  if (/\.[a-z0-9]+$/i.test(n)) return n
  return n + (ext.startsWith('.') ? ext : `.${ext}`)
}

async function writeToDir(dir: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
  const anyDir = dir as FileSystemDirectoryHandle & {
    queryPermission?: (o: { mode: string }) => Promise<PermissionState>
    requestPermission?: (o: { mode: string }) => Promise<PermissionState>
  }
  if (anyDir.queryPermission) {
    let state = await anyDir.queryPermission({ mode: 'readwrite' })
    if (state === 'prompt' && anyDir.requestPermission) {
      state = await anyDir.requestPermission({ mode: 'readwrite' })
    }
    if (state === 'denied') throw new Error('Нет доступа к папке')
  }
  const file = await dir.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(blob)
  await writable.close()
}

/** Save blob: remembered folder → save picker → classic download. */
export async function saveDownload(
  blob: Blob,
  suggestedName: string,
  defaultExt = '.rtf',
): Promise<'folder' | 'picker' | 'anchor'> {
  const name = ensureExt(suggestedName, defaultExt)

  if (rememberedDir) {
    try {
      await writeToDir(rememberedDir, name, blob)
      return 'folder'
    } catch {
      rememberedDir = null
    }
  }

  const w = window as Window & {
    showSaveFilePicker?: (opts?: {
      suggestedName?: string
      types?: { description: string; accept: Record<string, string[]> }[]
    }) => Promise<FileSystemFileHandle>
  }

  if (w.showSaveFilePicker) {
    try {
      const ext = (name.match(/(\.[a-z0-9]+)$/i) || [])[1]?.toLowerCase() || defaultExt
      const types =
        ext === '.html' || ext === '.htm'
          ? [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }]
          : ext === '.csv'
            ? [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }]
            : [{ description: 'RTF', accept: { 'application/rtf': ['.rtf'], 'text/rtf': ['.rtf'] } }]
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types,
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'picker'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return 'anchor'
}
