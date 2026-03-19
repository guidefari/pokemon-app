import { BunServices, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { cli } from "./cli";
import { fetchClientLayer } from "./services/FetchClient";
import { terminalRendererLayer } from "./services/TerminalRenderer";

const mainLayer = Layer.mergeAll(
  BunServices.layer,
  fetchClientLayer,
  terminalRendererLayer,
);

cli.pipe(
  Effect.provide(mainLayer),
  BunRuntime.runMain,
);
