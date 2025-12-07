# @fullstackhouse/opentelemetry-js-decorator

A TypeScript method decorator for OpenTelemetry tracing. Automatically creates spans for decorated methods with support for sync, async, generator, and async generator functions.

## Installation

```bash
npm install @fullstackhouse/opentelemetry-js-decorator @opentelemetry/api
# or
pnpm add @fullstackhouse/opentelemetry-js-decorator @opentelemetry/api
```

## Usage

```typescript
import { Traced } from '@fullstackhouse/opentelemetry-js-decorator';

class UserService {
  @Traced()
  async getUser(id: string) {
    // Span automatically created: "UserService.getUser"
    return await this.repository.findById(id);
  }

  @Traced('fetch-user-profile')
  async getUserProfile(id: string) {
    // Span with custom name: "fetch-user-profile"
    return await this.fetchProfile(id);
  }

  @Traced({ name: 'db-query', op: 'database' })
  async queryDatabase(query: string) {
    // Span with custom name and operation type
    return await this.db.query(query);
  }
}
```

## Features

- Automatic span creation with `ClassName.methodName` naming
- Custom span names via string argument or options
- Support for sync, async, Promise-returning, generator, and async generator methods
- Automatic error recording and span status setting
- Preserves method metadata (works with other decorators)
- Sets `code.function` and `code.namespace` attributes
- Optional `op` attribute for categorizing operations

## API

### `@Traced()`

Creates a span with auto-generated name (`ClassName.methodName`).

### `@Traced(name: string)`

Creates a span with the specified name.

### `@Traced(options: TracedOptions)`

Creates a span with the specified options.

```typescript
interface TracedOptions extends SpanOptions {
  name?: string;  // Custom span name
  op?: string;    // Operation type (set as `code.op` attribute)
}
```

### `@Traced(name: string, options: TracedOptions)`

Creates a span with the specified name and options.

## Requirements

- `@opentelemetry/api` must be installed as a peer dependency
- TypeScript with `experimentalDecorators` enabled

## License

MIT
