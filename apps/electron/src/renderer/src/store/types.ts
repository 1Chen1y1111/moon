import type { StoreApi } from 'zustand'

export type StoreSetter<T> = StoreApi<T>['setState']
