import {
  Console,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  pipe,
  Schema,
  Stream,
} from "effect";
import type { Pokemon } from "./types/pokemon";
import type { HttpError } from "./services/fetchPokemon";
import { Args, Command, Options } from "@effect/cli";
import PokemonFetcher, { FetchPokemonLive } from "./services/fetchPokemon";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { FetchHttpClient } from "@effect/platform";

const Generation = Schema.Struct({
  start: Schema.Number.pipe(Schema.greaterThanOrEqualTo(1)),
  end: Schema.Number.pipe(Schema.lessThanOrEqualTo(1025)),
});

const GENERATIONS: Record<string, Schema.Schema.Type<typeof Generation>> = {
  "1": { start: 1, end: 151 },
  "2": { start: 152, end: 251 },
  "3": { start: 252, end: 386 },
  "4": { start: 387, end: 493 },
  "5": { start: 494, end: 649 },
};

class PokemonClient extends Context.Tag("PokemonClient")<
  PokemonClient,
  {
    readonly fetch: (id: number) => Effect.Effect<Pokemon, HttpError, never>;
  }
>() {}

const formatPokemon = (pokemon: Pokemon, duration: number) =>
  `✅ #${pokemon.id} ${pokemon.name}\t${pokemon.types.map((t) => t.type.name).join(" | ")}\t${pokemon.stats.map((s) => `${s.stat.name}:${s.base_stat}`).join(" ")}\tduration:${duration.toString()}ms`;

const genOption = pipe(
  Options.integer("gen"),
  Options.withAlias("g"),
  Options.withDescription("Pokemon generation, e.g. --gen 1"),
  Options.optional,
);

const namesArg = pipe(Args.text({ name: "name" }), Args.repeated);

const command = Command.make(
  "pokemon",
  {
    gen: genOption,
    names: namesArg,
  },
  ({ gen, names }) => {
    if (Option.isNone(gen) && names.length === 0) {
      return Console.error("Please provide at least one name or a generation with --gen");
    }

    const ids = Option.match(gen, {
      onNone: () => names,
      onSome: (g) => {
        const gen = GENERATIONS[g];
        if (!gen) return names;
        const { start, end } = gen;
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
      },
    });

    return pipe(
      PokemonFetcher(ids),
      Stream.tap(([duration, pokemon]) =>
        Console.log(formatPokemon(pokemon, Duration.toMillis(duration))),
      ),
      Stream.mapEffect((item) =>
        Effect.flatMap(
          Effect.sync(() => Math.random() < 0.5),
          (heads) =>
            heads
              ? Effect.as(Effect.sleep("1 second"), item)
              : Effect.succeed(item),
        ),
      ),
      Stream.runDrain,
    );
  },
);
// Set up the CLI application
const cli = Command.run(command, {
  name: "Hello World CLI",
  version: "v1.0.0",
});

// Prepare and run the CLI application
cli(process.argv).pipe(
  Effect.provide(BunContext.layer),
  Effect.provide(Layer.provide(FetchPokemonLive, FetchHttpClient.layer)),
  BunRuntime.runMain,
);
