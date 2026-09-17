import type { Database } from 'sql.js'
import { createIdFactory, nowIso } from '../ids.ts'
import type { Category, IdFactory, NewCategory } from '../types.ts'
import { bool, queryOne, queryRows, required, runSql, timestamp, writeTransaction } from './common.ts'

const mapCategory = (row: Record<string, unknown>): Category => ({ id: String(row.id), name: String(row.name), colorToken: row.color_token == null ? null : String(row.color_token), isArchived: bool(row.is_archived), createdAt: timestamp(row.created_at, 'created_at') })

export class CategoriesRepository {
  private readonly ids: IdFactory
  private readonly db: Database
  constructor(db: Database, ids?: IdFactory) { this.db = db; this.ids = createIdFactory(ids) }
  getById(id: string): Category | undefined { const row = queryOne(this.db, 'SELECT * FROM categories WHERE id = ?', [id]); return row && mapCategory(row) }
  list(includeArchived = false): Category[] {
    const sql = includeArchived ? 'SELECT * FROM categories ORDER BY name COLLATE NOCASE' : 'SELECT * FROM categories WHERE is_archived = 0 ORDER BY name COLLATE NOCASE'
    return queryRows(this.db, sql).map(mapCategory)
  }
  create(input: NewCategory): Category {
    const id = input.id ?? this.ids(), createdAt = input.createdAt ?? nowIso(), name = input.name.trim(), colorToken = input.colorToken == null ? null : input.colorToken.trim()
    if (!name || (colorToken !== null && !colorToken)) throw new Error('Categoría inválida')
    timestamp(createdAt, 'created_at')
    return writeTransaction(this.db, () => {
      runSql(this.db, 'INSERT INTO categories(id, name, color_token, is_archived, created_at) VALUES (?, ?, ?, ?, ?)', [id, name, colorToken, input.isArchived ? 1 : 0, createdAt])
      return required(this.getById(id), 'category')
    })
  }
  update(id: string, input: Partial<Pick<Category, 'name' | 'colorToken' | 'isArchived'>>): Category {
    const current = required(this.getById(id), 'category'), name = (input.name ?? current.name).trim(), colorToken = input.colorToken === undefined ? current.colorToken : input.colorToken == null ? null : input.colorToken.trim()
    if (!name || (colorToken !== null && !colorToken)) throw new Error('Categoría inválida')
    return writeTransaction(this.db, () => {
      runSql(this.db, 'UPDATE categories SET name = ?, color_token = ?, is_archived = ? WHERE id = ?', [name, colorToken, input.isArchived === undefined ? (current.isArchived ? 1 : 0) : (input.isArchived ? 1 : 0), id])
      return required(this.getById(id), 'category')
    })
  }
  archive(id: string): Category { return this.update(id, { isArchived: true }) }
  restore(id: string): Category { return this.update(id, { isArchived: false }) }
  delete(id: string): void { writeTransaction(this.db, () => { runSql(this.db, 'DELETE FROM categories WHERE id = ?', [id]) }) }
}
