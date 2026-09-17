import { Button, Input } from '@chakra-ui/react'
import { useState } from 'react'
import { z } from 'zod'
import AccessibleDialog from '../../components/AccessibleDialog.tsx'
import type { Category } from '../../domain/types.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'

const categorySchema = z.object({ name: z.string().trim().min(1, 'Escribí un nombre.') })

interface Props { categories: Category[]; onRefresh: () => Promise<void>; onClose: () => void }

export default function CategoriesPanel({ categories, onRefresh, onClose }: Props) {
  const vault = useVaultSession()
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function edit(category?: Category) { setEditingId(category?.id ?? null); setName(category?.name ?? ''); setError('') }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = categorySchema.safeParse({ name })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Revisá el nombre.'); return }
    setBusy(true)
    try {
      if (editingId) await vault.operation({ kind: 'categories.update', id: editingId, input: { name: parsed.data.name } })
      else await vault.operation({ kind: 'categories.create', input: { name: parsed.data.name, colorToken: null, isArchived: false } })
      setName(''); setEditingId(null); await onRefresh()
    } catch { setError('No se pudo guardar la categoría.') } finally { setBusy(false) }
  }

  async function toggle(category: Category) {
    setBusy(true)
    try { await vault.operation({ kind: category.isArchived ? 'categories.restore' : 'categories.archive', id: category.id }); await onRefresh() } catch { setError('No se pudo cambiar el estado.') } finally { setBusy(false) }
  }

  return <AccessibleDialog titleId="categories-title" onClose={onClose} className="category-manager"><div className="dialog-heading"><div><p className="eyebrow">Configuración</p><h2 id="categories-title">Categorías</h2></div><Button className="button button-secondary" type="button" onClick={onClose} aria-label="Cerrar categorías">Cerrar</Button></div>
    <form className="inline-form" onSubmit={submit} noValidate><label htmlFor="category-name">{editingId ? 'Renombrar categoría' : 'Nueva categoría'} <Input id="category-name" data-dialog-autofocus value={name} onChange={(event) => setName(event.target.value)} /></label><div className="form-actions"><Button className="button button-primary" type="submit" loading={busy} disabled={busy}>{editingId ? 'Guardar nombre' : 'Crear categoría'}</Button>{editingId && <Button className="button button-secondary" type="button" onClick={() => edit()} disabled={busy}>Cancelar</Button>}</div></form>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {categories.length === 0 ? <p className="empty-note">Todavía no hay categorías.</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">Categorías</caption><thead><tr><th>Nombre</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{categories.map((category) => <tr key={category.id}><td>{category.name}</td><td>{category.isArchived ? 'Archivada' : 'Activa'}</td><td className="row-actions"><Button className="button button-small" type="button" onClick={() => edit(category)} disabled={busy}>Renombrar</Button><Button className="button button-small" type="button" onClick={() => toggle(category)} disabled={busy}>{category.isArchived ? 'Activar' : 'Archivar'}</Button></td></tr>)}</tbody></table></div>}
  </AccessibleDialog>
}
