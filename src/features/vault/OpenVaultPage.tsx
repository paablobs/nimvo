import { Button, Input } from '@chakra-ui/react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVaultSession } from './useVaultSession.ts'
import {
  INVALID_MONEO_FILE_MESSAGE,
  MoneoCryptoError,
  UNSUPPORTED_MONEO_VERSION_MESSAGE,
} from '../../crypto/index.ts'

function OpenVaultPage() {
  const navigate = useNavigate()
  const vault = useVaultSession()
  const [password, setPassword] = useState('')
  const [fileName, setFileName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) {
      setError('Selecciona un archivo .moneo.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await vault.open(bytes, password)
      navigate('/boveda')
    } catch (caught) {
      setError(caught instanceof MoneoCryptoError && caught.code === 'UNSUPPORTED_VERSION'
        ? UNSUPPORTED_MONEO_VERSION_MESSAGE
        : INVALID_MONEO_FILE_MESSAGE)
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
      setError(caught instanceof MoneoCryptoError && caught.code === 'UNSUPPORTED_VERSION'
        ? UNSUPPORTED_MONEO_VERSION_MESSAGE
        : INVALID_MONEO_FILE_MESSAGE)
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  return (
    <section className="page-section form-section">
      <div className="form-intro">
        <p className="eyebrow">Abrir archivo</p>
        <h1>Continuar con un archivo local</h1>
        <p>
          Selecciona una copia de Moneo desde este dispositivo y escribe su
          contraseña. La contraseña no se guarda.
        </p>
        <p className="local-note">
          El acceso directo vincula el archivo a esta pestaña cuando el navegador lo permite. En Firefox y otros navegadores se usa la selección manual y la descarga.
        </p>
      </div>
      <form className="vault-form file-picker" onSubmit={handleSubmit} noValidate>
        {vault.directFileAccessSupported && (
          <Button className="button button-secondary" type="button" onClick={chooseWithSystem} loading={busy} disabled={busy}>
            Elegir con el sistema
          </Button>
        )}
        <label htmlFor="vault-file">Archivo de Moneo</label>
        <input
          id="vault-file"
          type="file"
          accept=".moneo"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null
            setFile(selected)
            setFileName(selected?.name ?? '')
            setError('')
          }}
        />
        {fileName && <p role="status">Seleccionado: {fileName}</p>}
        <label htmlFor="open-password">Contraseña</label>
        <Input
          id="open-password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <p className="field-help">Formato: .moneo.</p>
        {error && <p className="form-message error" role="alert">{error}</p>}
        <div className="form-actions">
          <Button className="button button-primary" type="submit" loading={busy} disabled={busy}>
            Abrir bóveda
          </Button>
          <Link className="text-link" to="/">Volver al inicio</Link>
        </div>
      </form>
    </section>
  )
}

export default OpenVaultPage
