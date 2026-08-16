/** ids de lançamento.
 *
 *  O app antigo usava `Date.now()`, que colide em inserções no mesmo
 *  milissegundo (copiar mês criava vários de uma vez) e não sobrevive a
 *  sync entre dispositivos. Aqui é uuid v4 de verdade. */
export function novoId(): string {
  // crypto.randomUUID existe no Safari iOS desde a 15.4 e só em contexto seguro.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6]! & 0x0f) | 0x40
    b[8] = (b[8]! & 0x3f) | 0x80
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
      16,
      20,
    )}-${hex.slice(20)}`
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
