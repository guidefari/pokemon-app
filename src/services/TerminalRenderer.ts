import { Console, Effect, Layer, Match, Schema, ServiceMap } from "effect";
import chalk, { type ChalkInstance } from "chalk";
import ansiEscapes from "ansi-escapes";
import type { Pokemon } from "../schema";
import type {
  FetchError,
  FetchErrorRetry,
  PokemonLookup,
  TimedPokemon,
} from "./FetchClient";
import { HttpApiError } from "effect/unstable/httpapi";
import { HttpClientError } from "effect/unstable/http";
import { config } from "../cli";

const supportsInlineSprites =
  process.env["TERM_PROGRAM"] === "iTerm.app" ||
  process.env["TERM_PROGRAM"] === "WezTerm" ||
  process.env["TERM_PROGRAM"] === "WarpTerminal" ||
  process.env["TERM_PROGRAM"] === "Warp" ||
  process.env["TERM"] === "xterm-kitty";

const spriteColumns = 14;
const spriteRows = 6;

const pokemonTypeColors: Readonly<Record<string, ChalkInstance>> = {
  fire: chalk.red,
  water: chalk.blue,
  grass: chalk.green,
  electric: chalk.yellow,
  ice: chalk.cyanBright,
  fighting: chalk.redBright,
  poison: chalk.magenta,
  ground: chalk.yellow,
  flying: chalk.cyan,
  psychic: chalk.magenta,
  bug: chalk.greenBright,
  rock: chalk.yellow,
  ghost: chalk.magentaBright,
  dragon: chalk.blueBright,
  dark: chalk.blackBright,
  steel: chalk.cyan,
  fairy: chalk.magentaBright,
  normal: chalk.white,
};

const pokemonTypeEmoji: Readonly<Record<string, string>> = {
  fire: "🔥",
  water: "💧",
  grass: "🌿",
  electric: "⚡",
  ice: "❄️",
  fighting: "🥊",
  poison: "☠️",
  ground: "🌍",
  flying: "🦅",
  psychic: "🔮",
  bug: "🐛",
  rock: "🪨",
  ghost: "👻",
  dragon: "🐉",
  dark: "🌑",
  steel: "⚙️",
  fairy: "🧚",
  normal: "⭐",
};

const pokemonStatLabels: Readonly<Record<string, string>> = {
  hp: "HP",
  attack: "ATK",
  defense: "DEF",
  "special-attack": "SpATK",
  "special-defense": "SpDEF",
  speed: "SPD",
};

export const capitalizePokemonName = (name: string) =>
  name.charAt(0).toLocaleUpperCase() + name.slice(1);

const formatPokemonType = (name: string) => {
  const color = pokemonTypeColors[name] ?? chalk.white;
  const emoji = pokemonTypeEmoji[name] ?? "🔹";

  return `${emoji} ${color(capitalizePokemonName(name))}`;
};

const getPokemonStatColor = (value: number) =>
  value >= 100 ? chalk.green : value >= 60 ? chalk.yellow : chalk.red;

const formatPokemonStat = ({ stat, base_stat }: Pokemon["stats"][number]) => {
  const label = pokemonStatLabels[stat.name] ?? stat.name;
  const filled = Math.round((base_stat / 255) * 20);
  const bar =
    getPokemonStatColor(base_stat)("█".repeat(filled)) +
    chalk.dim("░".repeat(20 - filled));

  return `${chalk.gray(label.padEnd(7))} ${getPokemonStatColor(base_stat)(String(base_stat).padStart(3))}  ${bar}`;
};

const renderInlineSprite = (url: string | null): Effect.Effect<string> => {
  if (!supportsInlineSprites || url === null) {
    return Effect.succeed("");
  }

  return Effect.tryPromise(() =>
    fetch(url).then((response) => response.arrayBuffer()),
  ).pipe(
    Effect.map((buffer) => {
      const base64 = Buffer.from(buffer).toString("base64");

      return `\x1b]1337;File=inline=1;width=12;height=${spriteRows};preserveAspectRatio=1:${base64}\x07`;
    }),
    Effect.orElseSucceed(() => ""),
  );
};

const formatPokemon = (
  { durationMs, pokemon }: TimedPokemon,
  sprite: string,
) => {
  const id = chalk.gray(`#${String(pokemon.id).padStart(4, "0")}`);
  const name = chalk.bold.white(capitalizePokemonName(pokemon.name));
  const types = pokemon.types
    .map((pokemonType) => formatPokemonType(pokemonType.type.name))
    .join(chalk.gray("  │  "));
  const timing = `${chalk.gray("⏲️").padEnd(14)} ${chalk.dim(`${durationMs.toFixed(2)}ms`)}`;
  const header = `${timing}  ${id} ${name}  ${types}`;
  const statLines = pokemon.stats.map(formatPokemonStat);

  if (!sprite) {
    return `${header}\n${statLines.join("\n")}\n`;
  }

  const verticalOffset = Math.max(
    0,
    Math.floor((spriteRows - statLines.length) / 2),
  );
  const totalRows = Math.max(spriteRows, verticalOffset + statLines.length);
  const statSection = statLines
    .map((line, index) => {
      const row = verticalOffset + index;
      const down = row > 0 ? ansiEscapes.cursorDown(row) : "";
      const up = row > 0 ? ansiEscapes.cursorUp(row) : "";

      return `${down}${ansiEscapes.cursorForward(spriteColumns)}${line}\r${up}`;
    })
    .join("");

  return `\n${header}\n\n\n${sprite}\r${ansiEscapes.cursorUp(spriteRows)}${statSection}${ansiEscapes.cursorDown(totalRows)}\n`;
};

const formatCompare = (
  pokemon: ReadonlyArray<TimedPokemon>,
  sprites: ReadonlyArray<string>,
): string => {
  if (pokemon.length === 0) return "";
  if (pokemon.length === 1) return formatPokemon(pokemon[0]!, sprites[0] ?? "");

  const [a, b] = pokemon as [TimedPokemon, TimedPokemon];
  const [spriteA, spriteB] = [sprites[0] ?? "", sprites[1] ?? ""];

  const nameA = chalk.bold.white(capitalizePokemonName(a.pokemon.name));
  const nameB = chalk.bold.white(capitalizePokemonName(b.pokemon.name));
  const idA = chalk.gray(`#${String(a.pokemon.id).padStart(4, "0")}`);
  const idB = chalk.gray(`#${String(b.pokemon.id).padStart(4, "0")}`);
  const typesA = a.pokemon.types.map((t) => formatPokemonType(t.type.name)).join(" ");
  const typesB = b.pokemon.types.map((t) => formatPokemonType(t.type.name)).join(" ");

  const BAR = 12;
  const statLines = a.pokemon.stats.map((statA) => {
    const statB = b.pokemon.stats.find((s) => s.stat.name === statA.stat.name);
    const valA = statA.base_stat;
    const valB = statB?.base_stat ?? 0;
    const label = chalk.gray((pokemonStatLabels[statA.stat.name] ?? statA.stat.name).padStart(7));

    const colorA = valA > valB ? chalk.green : valA < valB ? chalk.red : chalk.yellow;
    const colorB = valB > valA ? chalk.green : valB < valA ? chalk.red : chalk.yellow;

    const filledA = Math.round((valA / 255) * BAR);
    const filledB = Math.round((valB / 255) * BAR);
    const barA = colorA("█".repeat(filledA)) + chalk.dim("░".repeat(BAR - filledA));
    const barB = chalk.dim("░".repeat(BAR - filledB)) + colorB("█".repeat(filledB));

    return `${colorA(String(valA).padStart(3))} ${barA}  ${label}  ${barB} ${colorB(String(valB).padStart(3))}`;
  });

  const totalA = a.pokemon.stats.reduce((s, x) => s + x.base_stat, 0);
  const totalB = b.pokemon.stats.reduce((s, x) => s + x.base_stat, 0);
  const colorTotalA = totalA > totalB ? chalk.green : totalA < totalB ? chalk.red : chalk.yellow;
  const colorTotalB = totalB > totalA ? chalk.green : totalB < totalA ? chalk.red : chalk.yellow;
  const filledTA = Math.round((totalA / 1530) * BAR);
  const filledTB = Math.round((totalB / 1530) * BAR);
  const barTA = colorTotalA("█".repeat(filledTA)) + chalk.dim("░".repeat(BAR - filledTA));
  const barTB = chalk.dim("░".repeat(BAR - filledTB)) + colorTotalB("█".repeat(filledTB));
  const totalLine = `${colorTotalA(String(totalA).padStart(3))} ${barTA}  ${chalk.gray("   BST")}  ${barTB} ${colorTotalB(String(totalB).padStart(3))}`;

  const winner =
    totalA > totalB ? `${nameA} wins!` :
    totalB > totalA ? `${nameB} wins!` :
    chalk.yellow("It's a draw!");

  const spritesRow = spriteA
    ? `${spriteA}\r${ansiEscapes.cursorUp(spriteRows)}${ansiEscapes.cursorForward(spriteColumns + 6)}${spriteB}${ansiEscapes.cursorDown(spriteRows)}`
    : "";

  const headerPad = 28;
  const header = `${idA} ${nameA}  ` + chalk.bold.gray("VS") + `  ${idB} ${nameB}`;
  const typesRow = `${typesA} + ${typesB}`;

  return [
    "",
    header,
    typesRow,
    "",
    spritesRow,
    ...statLines,
    "",
    totalLine,
    "",
    `${" ".repeat(14)}${winner}`,
    "",
  ].join("\n");
};

const displayName = (pokemonId: PokemonLookup) =>
  Match.value(pokemonId).pipe(
    Match.when(
      Schema.is(Schema.Number),
      (id) => `#${`${String(id).padStart(3, "0")}`}`,
    ),
    Match.when(Schema.is(Schema.String), (id) => capitalizePokemonName(id)),
    Match.exhaustive,
  );

export const formatError = (error: HttpClientError.HttpClientError) =>
  Match.value(error.response?.status).pipe(
    Match.when(404, () =>
      Console.error(
        `\n${chalk.bgRed.white.bold(" 404 ")} ${chalk.red("Pokemon not found")}  ${chalk.dim(error.request.url)}\n`,
      ),
    ),
    Match.when(0, () =>
      Console.error(
        `\n${chalk.bgYellow.black.bold(" NET ")} ${chalk.yellow("Could not reach server")}  ${chalk.dim(error.request.url)}\n`,
      ),
    ),
    Match.orElse(() =>
      Console.error(
        `\n${chalk.bgRed.white.bold(" HTTP ")} ${chalk.red(error.message)}\n`,
      ),
    ),
  );

export class TerminalRenderer extends ServiceMap.Service<
  TerminalRenderer,
  {
    readonly showWhileRetry: (
      error: FetchError,
      attempt: number,
      retries: number,
    ) => Effect.Effect<void>;
    readonly showRetryError: (error: FetchErrorRetry) => Effect.Effect<void>;
    readonly showPokemon: (timedPokemon: TimedPokemon) => Effect.Effect<void>;
    readonly showComaparePokemon: (
      pokemon: ReadonlyArray<TimedPokemon>,
    ) => Effect.Effect<void>;
    readonly showHttpError: (
      error: HttpClientError.HttpClientError,
    ) => Effect.Effect<void>;
  }
>()("@pokemon-app/TerminalRenderer") {}

export const terminalRendererLayer = Layer.sync(TerminalRenderer, () => ({
  showWhileRetry: (error, attempt, retries) =>
    Console.error(
      `${chalk.bgCyan.black.bold(" RETRY ")} ${chalk.cyan(displayName(error.pokemonId))}  ${chalk.dim(`attempt ${attempt}/${retries}`)}  ${chalk.gray("Chaos!")}`,
    ),
  showComaparePokemon: (pokemon: ReadonlyArray<TimedPokemon>) =>
    Effect.all(
      pokemon.map((tp) => renderInlineSprite(tp.pokemon.sprites.front_default)),
      { concurrency: "unbounded" },
    ).pipe(
      Effect.flatMap((sprites) =>
        Console.log(formatCompare(pokemon, sprites)),
      ),
    ),
  showRetryError: (error) =>
    Console.error(
      `${chalk.bgRed.white.bold(" FAIL ")} ${chalk.red(displayName(error.pokemonId))}  ${chalk.dim(`gave up after ${config.retries} retries`)}`,
    ),
  showHttpError: (error) => formatError(error),
  showPokemon: (timedPokemon: TimedPokemon) =>
    renderInlineSprite(timedPokemon.pokemon.sprites.front_default).pipe(
      Effect.flatMap((sprite) =>
        Console.log(formatPokemon(timedPokemon, sprite)),
      ),
    ),
}));
