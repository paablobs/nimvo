import { Button, Input } from '@chakra-ui/react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVaultSession } from './useVaultSession.ts'
import { NimvoCryptoError } from '../../crypto/index.ts'
import { useI18n } from '../../i18n/useI18n.ts'

function OpenVaultPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const vault = useVaultSession()
  const [password, setPassword] = useState('')
  const [fileName, setFileName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) {
      setError(t('selectFile'))
      return
    }
    setError('')
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await vault.open(bytes, password)
      navigate('/boveda')
    } catch (caught) {
      setError(caught instanceof NimvoCryptoError && caught.code === 'UNSUPPORTED_VERSION' ? t('unsupportedVersion') : t('openError'))
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  async function chooseWithSystem() {
    setError('')
    setBusy(true)
    try {
      const opened = await vault.openFromPicker(password)
      if (opened) navigate('/boveda')
    } catch (caught) {
      setError(caught instanceof NimvoCryptoError && caught.code === 'UNSUPPORTED_VERSION' ? t('unsupportedVersion') : t('openError'))
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <section className="page-section form-section">
      <div className="form-intro">
        <p className="eyebrow">{t('openFileTitle')}</p>
        <h1>{t('continueLocalFile')}</h1>
        <p>{t('openDescription')}</p>
        <p className="local-note">{t('directAccessNote')}</p>
      </div>
      <form className="vault-form file-picker" onSubmit={handleSubmit} noValidate>
        {vault.directFileAccessSupported && (
          <Button className="button button-secondary" type="button" onClick={chooseWithSystem} loading={busy} disabled={busy}>
            {t('chooseWithSystem')}
          </Button>
        )}
        <label htmlFor="vault-file">{t('nimvoFile')}</label>
        <input
          id="vault-file"
          type="file"
          accept=".nimvo,.moneo"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null
            setFile(selected)
            setFileName(selected?.name ?? '')
            setError('')
          }}
        />
        {fileName && <p role="status">{t('selected', { name: fileName })}</p>}
        <label htmlFor="open-password">{t('password')}</label>
        <Input
          id="open-password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <p className="field-help">{t('formats')}</p>
        {error && <p className="form-message error" role="alert">{error}</p>}
        <div className="form-actions">
          <Button className="button button-primary" type="submit" loading={busy} disabled={busy}>
            {t('openVault')}
          </Button>
          <Link className="text-link" to="/">{t('backHome')}</Link>
        </div>
      </form>
    </section>
  )
}

export default OpenVaultPage
