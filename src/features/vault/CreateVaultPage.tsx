import { Button, Input } from '@chakra-ui/react'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useVaultSession } from './useVaultSession.ts'
import { useI18n } from '../../i18n/useI18n.ts'

const createSchema = z.object({
  password: z.string().min(8, 'passwordMin'),
  confirmation: z.string(),
}).refine((values) => values.password === values.confirmation, {
  message: 'passwordMismatch',
  path: ['confirmation'],
})

function CreateVaultPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const vault = useVaultSession()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = createSchema.safeParse({ password, confirmation })
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'reviewData'
      setError(t(message as never))
      return
    }
    setError('')
    setBusy(true)
    try {
      await vault.create(password)
      navigate('/boveda')
    } catch {
      setError(t('createVaultError'))
    } finally {
      setBusy(false)
      setPassword('')
      setConfirmation('')
    }
  }

  return (
    <section className="page-section form-section">
      <div className="form-intro">
        <p className="eyebrow">{t('newFile')}</p>
        <h1>{t('createLocalFile')}</h1>
        <p>{t('createFileDescription')}</p>
      </div>
      <form className="vault-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="password">{t('password')}</label>
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
        <p className="field-help">{t('minimumPassword')}</p>

        <label htmlFor="password-confirmation">{t('passwordConfirmation')}</label>
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
            {t('createVault')}
          </Button>
          <Link className="text-link" to="/">
            {t('backHome')}
          </Link>
        </div>
      </form>
    </section>
  )
}

export default CreateVaultPage
