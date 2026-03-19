import { Effect, Layer, Schema, ServiceMap } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientError,
  HttpClientResponse,
} from "effect/unstable/http";
import { Pokemon, type Pokemon as PokemonType } from "../schema";

const baseUrl = "https://pokeapi.co/api/v2/pokemon";

export type PokemonLookup = string | number;

export type TimedPokemon = {
  readonly durationMs: number;
  readonly pokemon: PokemonType;
};

export class FetchClient extends ServiceMap.Service<
  FetchClient,
  {
    readonly fetchPokemon: (
      lookup: PokemonLookup,
    ) => Effect.Effect<PokemonType, HttpClientError.HttpClientError | Schema.SchemaError>;
  }
>()("@pokemon-app/FetchClient") {}

export const fetchClientLayer = Layer.effect(
  FetchClient,
  Effect.service(HttpClient.HttpClient).pipe(
    Effect.map((client) => ({
      fetchPokemon: Effect.fn("FetchClient.fetchPokemon")(function* (
        lookup: PokemonLookup,
      ) {
        return yield* client
          .get(`${baseUrl}/${lookup}`, {
            headers: { "Cache-Control": "no-store" },
          })
          .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Pokemon)));
      }),
    })),
  ),
).pipe(Layer.provide(FetchHttpClient.layer));
