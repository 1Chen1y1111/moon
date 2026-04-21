declare module 'better-sqlite3' {
  class Database {
    constructor(filename?: string | Buffer, options?: Database.Options)

    exec(sql: string): this
    pragma(source: string, options?: Database.PragmaOptions): unknown
    prepare<BindParameters extends unknown[] | object = unknown[], Result = unknown>(
      source: string
    ): Database.Statement<BindParameters, Result>
    transaction<T extends (...parameters: never[]) => unknown>(callback: T): T
    close(): this
  }

  namespace Database {
    export type SqliteError = Error & {
      code: string
    }

    export type VariableArgFunction = (...parameters: unknown[]) => unknown

    export type Statement<
      BindParameters extends unknown[] | object = unknown[],
      Result = unknown
    > = {
      run(
        ...parameters: BindParameters extends unknown[] ? BindParameters : [BindParameters]
      ): RunResult
      get(
        ...parameters: BindParameters extends unknown[] ? BindParameters : [BindParameters]
      ): Result | undefined
      all(
        ...parameters: BindParameters extends unknown[] ? BindParameters : [BindParameters]
      ): Result[]
      iterate(
        ...parameters: BindParameters extends unknown[] ? BindParameters : [BindParameters]
      ): IterableIterator<Result>
      pluck(toggleState?: boolean): Statement<BindParameters, Result>
      expand(toggleState?: boolean): Statement<BindParameters, Result>
      raw(toggleState?: boolean): Statement<BindParameters, Result>
      bind(
        ...parameters: BindParameters extends unknown[] ? BindParameters : [BindParameters]
      ): this
    }

    export type Options = {
      readonly?: boolean
      fileMustExist?: boolean
      timeout?: number
      verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void
      nativeBinding?: string
    }

    export type PragmaOptions = {
      simple?: boolean
    }
  }

  export type RunResult = {
    changes: number
    lastInsertRowid: number | bigint
  }

  export type Options = Database.Options
  export type Statement = Database.Statement

  export = Database
}
