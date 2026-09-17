import { Button, Input } from '@chakra-ui/react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useVaultSession } from './useVaultSession.ts'

const createSchema = z.object({
  password: z.string().min(8, 'Usa una contraseña de al menos 8 caracteres.'),
  confirmation: z.string(),
}).refine((values) => values.password === values.confirmation, {
  message: 'Las contraseñas no coinciden.',
  path: ['confirmation'],
})

function CreateVaultPage() {
  const navigate = useNavigate()
  const vault = useVaultSession()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = createSchema.safeParse({ password, confirmation })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await vault.create(password)
      navigate('/boveda')
    } catch {
      setError('No se pudo crear la bóveda.')
    } finally {
      setBusy(false)
      setPassword('')
      setConfirmation('')
    }
  }

  return (
    <section className="page-section form-section">
      <div className="form-intro">
        <p className="eyebrow">Nuevo archivo</p>
        <h1>Crear un archivo local</h1>
        <p>
          Define una contraseña para proteger tu archivo. La contraseña no se
          guarda y no se puede recuperar.
        </p>
      </div>
      <form className="vault-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="password">Contraseña</label>
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="field-help">Mínimo 8 caracteres.</p>

        <label htmlFor="password-confirmation">Confirmar contraseña</label>
        <Input
          id="password-confirmation"
          name="password-confirmation"
          type="password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="new-password"
          required
        />

        {error && (
          <p className="form-message error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button className="button button-primary" type="submit" loading={busy} disabled={busy}>
            Crear bóveda
          </Button>
          <Link className="text-link" to="/">
            Volver al inicio
          </Link>
        </div>
      </form>
    </section>
  )
}

export default CreateVaultPage
