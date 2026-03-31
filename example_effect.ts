import { Effect, Schema } from "effect";
import type { SchemaError } from "effect/Schema";

// ---- Schema (replaces Types + Validation) --------------------------------

// One definition gives us both the TypeScript type AND the runtime validator.
// No NamedResource interface, no isPokemon() guard — Schema handles it all.

const NamedResource = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
});

const Pokemon = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  base_experience: Schema.Number,
  height: Schema.Number,
  weight: Schema.Number,
  abilities: Schema.Array(
    Schema.Struct({
      ability: NamedResource,
      is_hidden: Schema.Boolean,
      slot: Schema.Number,
    }),
  ),
  types: Schema.Array(
    Schema.Struct({ slot: Schema.Number, type: NamedResource }),
  ),
  stats: Schema.Array(
    Schema.Struct({
      base_stat: Schema.Number,
      effort: Schema.Number,
      stat: NamedResource,
    }),
  ),
  moves: Schema.Array(Schema.Struct({ move: NamedResource })),
  sprites: Schema.Struct({
    front_default: Schema.String,
    back_default: Schema.String,
  }),
  species: NamedResource,
});

type Pokemon = Schema.Schema.Type<typeof Pokemon>;

// ---- Errors --------------------------------------------------------------

// Same three error concepts as example.ts — but as Effect tagged errors.
// The _tag discriminant is built in. Fields are typed and validated.

class NetworkError extends Schema.TaggedErrorClass("NetworkError")(
  "NetworkError",
  { cause: Schema.Unknown },
) {}

class HttpError extends Schema.TaggedErrorClass("HttpError")("HttpError", {
  status: Schema.Number,
  statusText: Schema.String,
}) {}

class ParseError extends Schema.TaggedErrorClass("ParseError")("ParseError", {
  message: Schema.String,
}) {}

// ---- Fetcher -------------------------------------------------------------

// The return type is now honest — every failure is visible to the compiler.
// Compare to example.ts: Promise<Pokemon> hides all three error types.

const fetchPokemon = (
  name: string,
): Effect.Effect<
  Pokemon,
  NetworkError | HttpError | SchemaError | ParseError
> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch(`https://pokeapi.co/api/v2/pokemon/${name}`),
      catch: (cause) => new NetworkError({ cause }),
    });

    if (!response.ok) {
      return yield* new HttpError({
        status: response.status,
        statusText: response.statusText,
      });
    }

    const data = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () =>
        new ParseError({ message: "Response body is not valid JSON" }),
    });

    // Schema.decodeEffect validates the shape — replaces isPokemon().
    // On failure it produces a structured error with the exact field path.
    return yield* Schema.decodeUnknownEffect(Pokemon)(data);
  });

// ---- Main ----------------------------------------------------------------

// Effect.match forces you to handle every named error.
// Add a new error to fetchPokemon and the compiler tells you to handle it here.
// Compare to example.ts: catch (error: unknown) — you're guessing what was thrown.

Effect.runPromise(
  fetchPokemon("pikachu").pipe(
    Effect.catchTags({
      SchemaError: (error) => Effect.fail(error),
      HttpError: (error) => Effect.fail(error),
      ParseError: (error) => Effect.fail(error),
      NetworkError: (error) => Effect.fail(error),
    }),
  ),
);
