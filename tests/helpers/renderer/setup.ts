import '@testing-library/jest-dom/vitest'

class ResizeObserverMock {
  observe(): void {
    return undefined
  }

  unobserve(): void {
    return undefined
  }

  disconnect(): void {
    return undefined
  }
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
}
