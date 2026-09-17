import type { IdFactory } from './types.ts'

const fallbackId = (): string => {
  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  let value = ''
  for (const byte of bytes) value += byte.toString(16).padStart(2, '0')
  return value || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}

export const defaultIdFactory: IdFactory = () => globalThis.crypto?.randomUUID?.() ?? fallbackId()

export const createIdFactory = (factory?: IdFactory): IdFactory => factory ?? defaultIdFactory

export const nowIso = (): string => new Date().toISOString()
