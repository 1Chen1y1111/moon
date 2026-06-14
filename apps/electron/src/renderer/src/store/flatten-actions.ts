export function flattenActions<T extends object>(actions: object[]): T {
  const flattened: Record<string, unknown> = {}

  for (const action of actions) {
    const seenKeys = new Set<string>()
    let target: object | null = action

    while (target !== null && target !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(target)) {
        if (key === 'constructor' || seenKeys.has(key)) {
          continue
        }

        const descriptor = Object.getOwnPropertyDescriptor(target, key)
        if (descriptor === undefined || typeof descriptor.value !== 'function') {
          continue
        }

        flattened[key] = descriptor.value.bind(action)
        seenKeys.add(key)
      }

      target = Object.getPrototypeOf(target)
    }

    const record = action as Record<string, unknown>
    for (const key of Object.keys(record)) {
      const value = record[key]
      flattened[key] = typeof value === 'function' ? value.bind(action) : value
    }
  }

  return flattened as T
}
