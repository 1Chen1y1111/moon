export function toIsoTimestamp(timestamp: string): string {
  return new Date(timestamp).toISOString()
}
