import { LocalDatabase } from '../database.ts'
import type { WorkerError, WorkerRequest, WorkerResponse } from './protocol.ts'
import { executeOperation } from './operations.ts'
import { replaceDatabase } from './runtime.ts'

let database: LocalDatabase | undefined

const toSafeError = (error: unknown): WorkerError => {
  const message = error instanceof Error ? error.message : ''
  if (/constraint|unique|foreign key|check/i.test(message)) return { code: 'constraint', message: 'La operación viola una regla de datos.' }
  if (/not found/i.test(message)) return { code: 'not_found', message: 'No se encontró el registro solicitado.' }
  if (/closed/i.test(message)) return { code: 'closed', message: 'La base de datos está cerrada.' }
  return { code: 'database', message: 'No se pudo completar la operación.' }
}

const respond = (response: WorkerResponse): void => self.postMessage(response)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    let result: unknown = null
    if (request.type === 'open') {
      database = await replaceDatabase(database, request.bytes)
    } else if (request.type === 'export') {
      if (!database) throw new Error('closed')
      result = database.export()
    } else if (request.type === 'close') {
      database?.close()
      database = undefined
    } else {
      if (!database) throw new Error('closed')
      result = executeOperation(database.raw, request.operation)
    }
    respond({ type: 'success', requestId: request.requestId, result })
  } catch (error) {
    respond({ type: 'error', requestId: request.requestId, error: toSafeError(error) })
  }
}
