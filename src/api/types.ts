export type AccessLevel = 'read' | 'write'

export type MeResponse = {
  username: string
  databases: Record<string, AccessLevel[]>
}

export type DatabaseInfo = {
  name: string
  description?: string
  read_only: boolean
  max_mfn?: number
}

export type ServerConfigResponse = {
  default_workstation: string
  workstations: { code: string; name: string }[]
  search_modes: string[]
  irbis: {
    version?: string
    organization?: string
    databases?: DatabaseInfo[]
  }
}

export type SubField = { code: string; value: string }
export type Field = { tag: number; value?: string; subfields?: SubField[] }

export type RecordDto = {
  database: string
  mfn: number
  status: number
  version: number
  fields: Field[]
  formatted?: string
}

export type SearchHit = {
  mfn: number
  description?: string
  record?: RecordDto
}

export type SearchResponse = {
  expression: string
  count: number
  total?: number
  hits: SearchHit[]
}

export type ApiErrorBody = {
  error?: string
  message?: string
}
