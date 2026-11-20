export type PasswordScore = 0 | 1 | 2 | 3 | 4

export type PasswordScorer = (password: string) => PasswordScore

let scorerPromise: Promise<PasswordScorer> | null = null

/**
 * Loads the password estimator on demand. The dictionaries are large, so they
 * are fetched as a separate chunk the first time a password is typed. The
 * password is evaluated locally and never leaves the browser.
 */
export function loadPasswordScorer(): Promise<PasswordScorer> {
  scorerPromise ??= (async () => {
    // Only the language-independent lists (common passwords, diceware words
    // and keyboard layouts) are loaded: the per-language word lists add about
    // 1 MB gzipped and little value for a warning-only indicator.
    const [{ ZxcvbnFactory }, common] = await Promise.all([
      import('@zxcvbn-ts/core'),
      import('@zxcvbn-ts/language-common'),
    ])
    const factory = new ZxcvbnFactory({ graphs: common.adjacencyGraphs, dictionary: common.dictionary })
    return (password: string) => factory.check(password).score
  })().catch((error: unknown) => {
    scorerPromise = null
    throw error
  })
  return scorerPromise
}
