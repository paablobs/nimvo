import { Button } from '@chakra-ui/react'

import { useTheme } from '../theme/theme.ts'

function ThemeToggle() {
  const { mode, toggle } = useTheme()
  const nextMode = mode === 'light' ? 'oscuro' : 'claro'

  return (
    <Button
      className="theme-toggle"
      type="button"
      variant="outline"
      onClick={toggle}
      aria-label={`Cambiar a tema ${nextMode}`}
    >
      {mode === 'light' ? '☾' : '☀'} <span className="sr-only">Tema {mode}</span>
    </Button>
  )
}

export default ThemeToggle
