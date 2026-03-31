import { Argument, Command, Flag } from "effect/unstable/cli";
import { Duration, Effect, Filter, Option, pipe, Ref, Stream } from "effect";
import {
  FetchClient,
  withExponentialBackoff,
  type PokemonLookup,
  type TimedPokemon,
} from "./services/FetchClient";
import {
  capitalizePokemonName,
  formatError,
  TerminalRenderer,
} from "./services/TerminalRenderer";
import { Pokemon } from "./schema";
import { SchemaError } from "effect/Schema";
import { HttpClientError } from "effect/unstable/http/HttpClientError";
import { FetchHttpClient } from "effect/unstable/http";

const pokemonGenerations = ["1", "2", "3", "4", "5"] as const;
export const config = {
  retries: 3,
};

type PokemonGeneration = (typeof pokemonGenerations)[number];

const pokemonGenerationRanges = {
  "1": { start: 1, end: 151 },
  "2": { start: 152, end: 251 },
  "3": { start: 252, end: 386 },
  "4": { start: 387, end: 493 },
  "5": { start: 494, end: 649 },
} satisfies Record<
  PokemonGeneration,
  { readonly start: number; readonly end: number }
>;

const getPokemonLookupsForGeneration = (
  generation: PokemonGeneration,
): ReadonlyArray<PokemonLookup> => {
  const range = pokemonGenerationRanges[generation];

  return Array.from(
    { length: range.end - range.start + 1 },
    (_, index) => range.start + index,
  );
};

const streamPokemonLookups = (
  lookups: ReadonlyArray<PokemonLookup>,
  concurrency: number,
  chaos: boolean,
) =>
  Stream.fromIterable(lookups).pipe(
    Stream.mapEffect(
      (lookup) =>
        Ref.make(0).pipe(
          Effect.flatMap((attempts) =>
            withExponentialBackoff(
              FetchClient.use((c) => c.fetchPokemon(lookup, chaos)),
              attempts,
            ).pipe(Effect.timed),
          ),
          Effect.map(([duration, pokemon]) =>
            Option.some({ durationMs: Duration.toMillis(duration), pokemon }),
          ),
          Effect.catchTag("FetchErrorRetry", (error) =>
            TerminalRenderer.use((t) => t.showRetryError(error)).pipe(
              Effect.as(Option.none()),
            ),
          ),
        ),
      { concurrency },
    ),
  );

const pokemon = Argument.string("pokemon").pipe(Argument.variadic());
const pokemonCompare = Argument.string("pokemon").pipe(
  Argument.variadic({ min: 2, max: 2 }),
);
const generation = Flag.choice("gen", pokemonGenerations).pipe(
  Flag.withAlias("g"),
  Flag.optional,
);
const chaos = Flag.boolean("chaos").pipe(
  Flag.withAlias("x"),
  Flag.withDefault(false),
);
const concurrency = Flag.integer("concurrency").pipe(
  Flag.withAlias("c"),
  Flag.withDefault(1),
  Flag.mapTryCatch(
    (n) => {
      if (n < 1 || n > 30)
        throw new Error("concurrency must be between 1 and 30");
      return n;
    },
    (e) => String(e),
  ),
);

const compareComand = Command.make(
  "compare",
  { pokemonCompare, concurrency, chaos },
  ({ pokemonCompare, concurrency, chaos }) =>
    streamPokemonLookups(pokemonCompare, concurrency, chaos).pipe(
      Stream.filterMap(Filter.fromPredicateOption((x) => x)),
      Stream.runCollect,
      Effect.flatMap((results) =>
        TerminalRenderer.use((r) =>
          r.showComaparePokemon(Array.from<TimedPokemon>(results)),
        ),
      ),
      Effect.catchTag("HttpClientError", (error) => formatError(error)),
      Effect.catchTag("SchemaError", (error) => Effect.fail("Schema Error")),
    ),
);

const listComand = Command.make(
  "list",
  { generation, concurrency, chaos },
  ({ generation, concurrency, chaos }) =>
    Option.match(generation, {
      onNone: () => Effect.fail(""),
      onSome: (gen) =>
        streamPokemonLookups(
          getPokemonLookupsForGeneration(gen),
          concurrency,
          chaos,
        ).pipe(
          Stream.tap((timedPokemon) =>
            Option.match(timedPokemon, {
              onNone: () => Effect.void,
              onSome: (ti) =>
                TerminalRenderer.use((terminalRenderer) =>
                  terminalRenderer.showPokemon(ti),
                ),
            }),
          ),
          Stream.runDrain,
          Effect.catchTag("HttpClientError", (error) => formatError(error)),
          Effect.catchTag("SchemaError", (error) =>
            Effect.fail("Schema Error"),
          ),
        ),
    }),
);

const pokemonCommand = Command.make(
  "pokemon",
  { pokemon, generation, concurrency, chaos },
  ({ pokemon, concurrency, chaos }) =>
    streamPokemonLookups(pokemon, concurrency, chaos).pipe(
      Stream.tap((timedPokemon) =>
        Option.match(timedPokemon, {
          onNone: () => Effect.void,
          onSome: (ti) =>
            TerminalRenderer.use((terminalRenderer) =>
              terminalRenderer.showPokemon(ti),
            ),
        }),
      ),
      Stream.runDrain,
      Effect.catchTag("HttpClientError", (error) => formatError(error)),
    ),
).pipe(Command.withSubcommands([listComand, compareComand]));

export const cli = Command.run(pokemonCommand, { version: "1.0.0" });
