import { Span, SpanOptions, SpanStatusCode, trace } from '@opentelemetry/api';

const recordException = (span: Span, error: unknown) => {
  span.recordException(error as Error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : String(error),
  });
};

type AnyFunction = (...args: unknown[]) => unknown;

declare global {
  interface Reflect {
    getMetadataKeys?(target: object): string[];
    getMetadata?(metadataKey: string, target: object): unknown;
    defineMetadata?(metadataKey: string, metadataValue: unknown, target: object): void;
  }
}

const copyMetadataFromFunctionToFunction = (
  originalFunction: AnyFunction,
  newFunction: AnyFunction,
): void => {
  const r = Reflect as typeof Reflect & {
    getMetadataKeys?(target: object): string[];
    getMetadata?(metadataKey: string, target: object): unknown;
    defineMetadata?(metadataKey: string, metadataValue: unknown, target: object): void;
  };
  if (typeof r.getMetadataKeys === 'function') {
    r.getMetadataKeys(originalFunction).forEach((metadataKey: string) => {
      r.defineMetadata?.(
        metadataKey,
        r.getMetadata?.(metadataKey, originalFunction),
        newFunction,
      );
    });
  }
};

function isGenerator(value: unknown): value is Iterable<unknown> {
  return /\[object Generator|GeneratorFunction\]/.test(
    Object.prototype.toString.call(value),
  );
}

function isPromise(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' && value !== null && Symbol.asyncIterator in value
  );
}

function* wrapIterable<T>(
  iterable: Iterable<T>,
  onDone: (error?: unknown) => void,
): Iterable<T> {
  try {
    yield* iterable;
    onDone();
  } catch (error) {
    onDone(error);
    throw error;
  }
}

async function* wrapAsyncIterable<T>(
  iterable: AsyncIterable<T>,
  onDone: (error?: unknown) => void,
): AsyncIterable<T> {
  try {
    yield* iterable;
    onDone();
  } catch (error) {
    onDone(error);
    throw error;
  }
}

function wrapPromise<T>(
  promise: Promise<T>,
  onDone: (error?: unknown) => void,
): Promise<T> {
  return promise
    .then((value) => {
      onDone();
      return value;
    })
    .catch((error: unknown) => {
      onDone(error);
      throw error;
    });
}

function invoke<T>(
  fn: AnyFunction,
  thisObj: unknown,
  args: unknown[],
  onDone: (error?: unknown) => void,
): T {
  try {
    const result = fn.call(thisObj, ...args);

    if (isGenerator(result)) {
      return wrapIterable(result, onDone) as T;
    }

    if (isAsyncIterable(result)) {
      return wrapAsyncIterable(result, onDone) as T;
    }

    if (isPromise(result)) {
      return wrapPromise(result, onDone) as T;
    }

    onDone();
    return result as T;
  } catch (error) {
    onDone(error);
    throw error;
  }
}

export interface TracedOptions extends SpanOptions {
  name?: string;
  op?: string;
}

export function Traced(
  options?: TracedOptions,
): (
  target: object,
  propertyKey: string | symbol,
  propertyDescriptor: TypedPropertyDescriptor<AnyFunction>,
) => void;
export function Traced(
  name?: string,
  options?: TracedOptions,
): (
  target: object,
  propertyKey: string | symbol,
  propertyDescriptor: TypedPropertyDescriptor<AnyFunction>,
) => void;
export function Traced(
  nameOrOptions?: string | TracedOptions,
  maybeOptions?: TracedOptions,
) {
  return (
    target: object,
    propertyKey: string | symbol,
    propertyDescriptor: TypedPropertyDescriptor<AnyFunction>,
  ) => {
    let spanName: string;
    let spanOptions: TracedOptions;

    const className = (target.constructor as { name: string }).name;
    const methodName = String(propertyKey);

    if (typeof nameOrOptions === 'string') {
      spanName = nameOrOptions;
      spanOptions = maybeOptions ?? {};
    } else {
      spanName = nameOrOptions?.name ?? `${className}.${methodName}`;
      spanOptions = nameOrOptions ?? {};
    }

    const originalFunction = propertyDescriptor.value;

    if (typeof originalFunction !== 'function') {
      throw new Error(
        `The @Traced decorator can only be used on methods, but ${String(propertyKey)} is not a method.`,
      );
    }

    const wrappedFunction = function (this: unknown, ...args: unknown[]) {
      const tracer = trace.getTracer('default');

      const { name: _name, op, ...otelSpanOptions } = spanOptions;
      void _name;

      return tracer.startActiveSpan(
        spanName,
        {
          ...otelSpanOptions,
          attributes: {
            'code.function': methodName,
            'code.namespace': className,
            ...otelSpanOptions.attributes,
            ...(op ? { 'code.op': op } : {}),
          },
        },
        (span) => {
          const onDone = (error?: unknown) => {
            if (error) {
              recordException(span, error);
            }
            span.end();
          };

          return invoke(originalFunction, this, args, onDone);
        },
      );
    };

    propertyDescriptor.value = new Proxy(originalFunction, {
      apply: (_, thisArg, args: unknown[]) => {
        return wrappedFunction.apply(thisArg, args);
      },
    });

    copyMetadataFromFunctionToFunction(
      originalFunction,
      propertyDescriptor.value,
    );
  };
}
