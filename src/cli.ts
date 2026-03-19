import { Argument, Command, Flag } from "effect/unstable/cli";
import { Duration, Effect, Option, Stream } from "effect";
import {
  FetchClient,
  type PokemonLookup,
  type TimedPokemon,
} from "./services/FetchClient";
import { TerminalRenderer } from "./services/TerminalRenderer";

const pokemonGenerations = ["1", "2", "3", "4", "5"] as const;

type PokemonGeneration = (typeof pokemonGenerations)[number];

const pokemonGenerationRanges = {
  "1": { start: 1, end: 151 },
  "2": { start: 152, end: 251 },
  "3": { start: 252, end: 386 },
  "4": { start: 387, end: 493 },
  "5": { start: 494, end: 649 },
} satisfies Record<PokemonGeneration, { readonly start: number; readonly end: number }>;

const getPokemonLookupsForGeneration = (
  generation: PokemonGeneration,
): ReadonlyArray<PokemonLookup> => {
  const range = pokemonGenerationRanges[generation];

  return Array.from(
    { length: range.end - range.start + 1 },
    (_, index) => range.start + index,
  );
};

const streamPokemonLookups = (lookups: ReadonlyArray<PokemonLookup>) =>
  Stream.fromIterable(lookups).pipe(
    Stream.mapEffect(
      (lookup) =>
        Effect.timed(FetchClient.use((fetchClient) => fetchClient.fetchPokemon(lookup))).pipe(
          Effect.map(
            ([duration, pokemon]): TimedPokemon => ({
              durationMs: Duration.toMillis(duration),
              pokemon,
            }),
          ),
        ),
      { concurrency: 10 },
    ),
  );

const pokemon = Argument.string("pokemon").pipe(Argument.variadic());
const generation = Flag.choice("gen", pokemonGenerations).pipe(
  Flag.withAlias("g"),
  Flag.optional,
);

const resolvePokemonLookups = ({
  pokemon,
  generation,
}: {
  readonly pokemon: ReadonlyArray<string>;
  readonly generation: Option.Option<PokemonGeneration>;
}) =>
  Option.match(generation, {
    onNone: () =>
      Effect.succeed<ReadonlyArray<PokemonLookup>>(
        pokemon.length > 0 ? pokemon : ["pikachu"],
      ),
    onSome: (selectedGeneration) =>
      Effect.succeed<ReadonlyArray<PokemonLookup>>(
        getPokemonLookupsForGeneration(selectedGeneration),
      ),
  });

const command = Command.make(
  "pokemonfetcher",
  { pokemon, generation },
  ({ pokemon, generation }) =>
    resolvePokemonLookups({ pokemon, generation }).pipe(
      Effect.flatMap((lookups) =>
        streamPokemonLookups(lookups).pipe(
          Stream.tap((timedPokemon) =>
            TerminalRenderer.use((terminalRenderer) =>
              terminalRenderer.showPokemon(timedPokemon),
            ),
          ),
          Stream.runDrain,
        ),
      ),
    ),
);

export const cli = Command.run(command, { version: "1.0.0" });
