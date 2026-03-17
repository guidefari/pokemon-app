import { Chunk, Context, Effect, Layer, pipe, Stream } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientError,
  HttpClientResponse,
} from "@effect/platform";
import { Data } from "effect";
import type { ParseError } from "effect/ParseResult";
import { Pokemon } from "../types/pokemon";

export class HttpError extends Data.TaggedError("HttpError")<{
  readonly status: number;
  readonly message: string;
  readonly url?: string;
  readonly method?: string;
  readonly body?: unknown;
}> {}

const request = new Request("https://pokeapi.co/api/v2/pokemon", {
  method: "GET",
});

class PokemonFetcher extends Context.Tag("PokemonFetcher")<
  PokemonFetcher,
  {
    readonly fetchPokemon: (
      id: number,
    ) => Effect.Effect<
      Pokemon,
      HttpClientError.HttpClientError | ParseError,
      HttpClient.HttpClient
    >;
  }
>() {}

const fetchPokemon = (id: number | string) =>
  HttpClient.HttpClient.pipe(
    Effect.flatMap((client) =>
      client.get(`${request.url}/${id}`, { headers: { "Cache-Control": "no-store" } }),
    ),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Pokemon)),
  );

export const FetchPokemonLive = Layer.effect(
  PokemonFetcher,
  pipe(
    HttpClient.HttpClient,
    Effect.map((client) => ({
      fetchPokemon: (id: number | string) => fetchPokemon(id),
    })),
  ),
);

const PokemonFetcherProgram = (ids: Array<number | string>) =>
  Stream.fromIterable(ids).pipe(
    Stream.mapEffect((id) => Effect.timed(fetchPokemon(id)), { concurrency: 10 }),
  );

export default (ids: Array<string | number>) =>
  PokemonFetcherProgram(ids).pipe(
    Stream.provideLayer(FetchHttpClient.layer),
  );
