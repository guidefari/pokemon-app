import { Effect, Schema } from "effect";
import { Pokemon as PokemonSchema, type Pokemon } from "./src/schema";

const fetchPikachu = (): Effect.Effect<
  Pokemon,
  String | Schema.SchemaError,
  never
> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch("https://pokeapi.co/api/v2/pokemon/ditto"),
      catch: (cause) => `Network error: ${String(cause)}`,
    });

    if (response.status === 404) {
      return yield* Effect.fail("Pokemon not found (404)");
    }

    if (!response.ok) {
      return yield* Effect.fail(
        `HTTP ${response.status} ${response.statusText}`,
      );
    }

    const pokemonJson = yield* Effect.tryPromise({
      try: () => response.json() as Promise<Pokemon>,
      catch: (cause) => `Invalid JSON: ${String(cause)}`,
    });

    return yield* Schema.decodeEffect(PokemonSchema)(pokemonJson);
  });

Effect.runPromise(fetchPikachu().pipe(Effect.tap(Effect.log)));
