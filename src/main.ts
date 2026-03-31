import { BunServices, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { cli } from "./cli";
import { FetchClientLayer } from "./services/FetchClient";
import { terminalRendererLayer } from "./services/TerminalRenderer";

const mainLayer = Layer.mergeAll(
  BunServices.layer,
  FetchClientLayer.pipe(Layer.provide(FetchHttpClient.layer)),
  terminalRendererLayer,
);

cli.pipe(Effect.provide(mainLayer), BunRuntime.runMain);
