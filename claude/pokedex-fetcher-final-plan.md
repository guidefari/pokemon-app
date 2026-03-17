# Pokédex Concurrent Fetcher — Effect.ts Talk Demo

**Talk date:** Thursday, March 26, 2026
**Duration:** 30 minutes
**Format:** Meetup talk with live terminal demo
**Stack:** Effect (pure — no framework), PokéAPI, Node.js
**Today:** Sunday, March 15 — 10 full days to prepare

---

## The Concept

A CLI program that fetches an entire generation of Pokémon from PokéAPI
concurrently, with beautiful terminal output showing live progress. The
audience watches Pokémon load in real-time and sees Effect's concurrency,
error handling, retry, and DI in action — all in the terminal.

You run it multiple times with different configurations:
1. Sequential (concurrency=1) → slow, one at a time
2. Concurrent (concurrency=10) → fast, grid fills up
3. With chaos mode → random failures, retries visible
4. With tight timeout → timeouts fire, typed errors shown
5. With Layer swap → chaos layer vs live layer, same program

The entire codebase is ~300-400 lines of Effect. Small enough to show
on slides. Every line serves the talk.

---

## What the Audience Sees

```
$ npx tsx src/main.ts --gen 1 --concurrency 1

🔴 Pokédex Fetcher — Gen 1 (151 Pokémon) — Concurrency: 1

  ✅ #001 Bulbasaur         Grass · Poison        HP:45  ATK:49  DEF:49   [234ms]
  ✅ #002 Ivysaur           Grass · Poison        HP:60  ATK:62  DEF:63   [189ms]
  ✅ #003 Venusaur          Grass · Poison        HP:80  ATK:82  DEF:83   [312ms]
  ⏳ #004 Charmander        loading...

  Progress: ████░░░░░░░░░░░░░░░░  3/151  (2%)
  Stats: 3 loaded · 0 failed · 0 retries · avg 245ms
  Elapsed: 1.2s
```

Then you kill it, bump concurrency to 10:

```
$ npx tsx src/main.ts --gen 1 --concurrency 10

🟢 Pokédex Fetcher — Gen 1 (151 Pokémon) — Concurrency: 10

  ✅ #001 Bulbasaur         Grass · Poison        HP:45  ATK:49  DEF:49   [234ms]
  ✅ #004 Charmander        Fire                  HP:39  ATK:52  DEF:43   [198ms]
  ✅ #007 Squirtle          Water                 HP:44  ATK:48  DEF:65   [201ms]
  ✅ #002 Ivysaur           Grass · Poison        HP:60  ATK:62  DEF:63   [267ms]
  ✅ #010 Caterpie          Bug                   HP:45  ATK:30  DEF:35   [178ms]
  ✅ #005 Charmeleon        Fire                  HP:58  ATK:64  DEF:58   [312ms]
  ⏳ #013 Weedle            loading...
  ⏳ #014 Kakuna            loading...
  ⏳ #015 Beedrill          loading...
  ...

  Progress: ██████████████░░░░░░  98/151  (65%)
  Stats: 98 loaded · 0 failed · 0 retries · avg 230ms
  Elapsed: 3.4s
```

Then with chaos mode:

```
$ npx tsx src/main.ts --gen 1 --concurrency 10 --chaos

⚡ Pokédex Fetcher — Gen 1 (151 Pokémon) — Concurrency: 10 — CHAOS MODE

  ✅ #001 Bulbasaur         Grass · Poison        HP:45  ATK:49  DEF:49   [234ms]
  🔁 #002 Ivysaur           retry 1/3...                                  [502ms]
  ✅ #004 Charmander        Fire                  HP:39  ATK:52  DEF:43   [198ms]
  ✅ #002 Ivysaur           Grass · Poison        HP:60  ATK:62  DEF:63   [731ms] (retried 1x)
  ❌ #007 Squirtle          FetchError: Chaos! (3 retries exhausted)
  🔁 #010 Caterpie          retry 2/3...                                  [1204ms]
  ⏱️ #013 Weedle            TimeoutError: exceeded 2000ms
  ...

  Progress: ██████████████░░░░░░  142/151  (94%)
  Stats: 142 loaded · 6 failed · 23 retries · avg 340ms
  Elapsed: 6.1s

  ┌─────────────────────────────────────┐
  │ Errors by type:                     │
  │   FetchError:   4                   │
  │   TimeoutError: 2                   │
  │   ParseError:   0                   │
  └─────────────────────────────────────┘
```

**The visual impact is the speed difference.** Concurrency 1 takes ~45s for Gen 1.
Concurrency 10 takes ~5s. The audience sees it. No slides needed.

---

## Architecture

```
src/
├── main.ts              # CLI entry point, parses args, runs program
├── program.ts           # The main Effect program (fetchAll)
├── fetch.ts             # Single Pokémon fetch with timeout + retry
├── services/
│   ├── PokemonClient.ts # Context.Tag + Live + Chaos implementations
│   ├── Logger.ts        # Pretty terminal output service
│   └── Config.ts        # Runtime config (concurrency, timeout, retries, chaos)
├── errors.ts            # FetchError, TimeoutError, ParseError
├── schemas.ts           # Pokemon schema + PokéAPI response mapping
├── layers.ts            # Layer composition
└── display.ts           # Terminal formatting (colors, progress bar, stats)
```

Total: ~10 files, ~300-400 lines.

---

## Effect Feature → Code Mapping

Every major Effect feature maps to a specific, demoable piece of code:

### 1. Services & Layers (Dependency Injection)

```typescript
// services/PokemonClient.ts

class PokemonClient extends Context.Tag("PokemonClient")<
  PokemonClient,
  {
    readonly fetch: (id: number) => Effect<Pokemon, PokemonError>
  }
>() {}

// Real implementation — calls PokéAPI
const PokemonClientLive = Layer.succeed(PokemonClient, {
  fetch: (id) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () => globalThis.fetch(`https://pokeapi.co/api/v2/pokemon/${id}`),
        catch: () => new FetchError({ pokemonId: id, statusCode: 0, message: "Network error" })
      })

      if (!response.ok) {
        return yield* Effect.fail(
          new FetchError({ pokemonId: id, statusCode: response.status, message: response.statusText })
        )
      }

      const json = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () => new ParseError({ pokemonId: id, reason: "Invalid JSON" })
      })

      return yield* Schema.decodeUnknown(PokemonFromApi)(json).pipe(
        Effect.mapError(() => new ParseError({ pokemonId: id, reason: "Schema validation failed" }))
      )
    })
})

// Chaos implementation — wraps Live, randomly fails 30%
const PokemonClientChaos = Layer.effect(
  PokemonClient,
  Effect.gen(function* () {
    const real = yield* PokemonClient
    return {
      fetch: (id) =>
        Effect.gen(function* () {
          const roll = yield* Random.next
          if (roll < 0.3) {
            return yield* Effect.fail(
              new FetchError({ pokemonId: id, statusCode: 500, message: "Chaos!" })
            )
          }
          return yield* real.fetch(id)
        })
    }
  })
).pipe(Layer.provide(PokemonClientLive))
```

**Talk moment:** *"PokemonClientChaos wraps PokemonClientLive. Same interface.
The fetching code doesn't know the difference. But the retries kick in."*

### 2. Typed Errors

```typescript
// errors.ts
import { Data } from "effect"

class FetchError extends Data.TaggedError("FetchError")<{
  pokemonId: number
  statusCode: number
  message: string
}> {}

class TimeoutError extends Data.TaggedError("TimeoutError")<{
  pokemonId: number
  timeoutMs: number
}> {}

class ParseError extends Data.TaggedError("ParseError")<{
  pokemonId: number
  reason: string
}> {}

type PokemonError = FetchError | TimeoutError | ParseError
```

**Talk moment:** Show the function signature:
```
Effect<Pokemon, FetchError | TimeoutError | ParseError, PokemonClient>
```
*"The compiler tells you every way this can fail. Not `catch (e: unknown)`. Actual types."*

### 3. Timeout

```typescript
// fetch.ts — wrapping a fetch with timeout

const fetchWithTimeout = (id: number, timeoutMs: number) =>
  pipe(
    PokemonClient,
    Effect.flatMap((client) => client.fetch(id)),
    Effect.timeout(Duration.millis(timeoutMs)),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new TimeoutError({ pokemonId: id, timeoutMs }))
    )
  )
```

**Talk moment:** *"Effect.timeout is not setTimeout. It interrupts the fiber.
The fetch is actually cancelled, not just ignored. And the error is typed —
TimeoutError, not a generic catch."*

### 4. Retry with Exponential Backoff

```typescript
// fetch.ts — adding retry to the fetch

const fetchWithRetry = (
  id: number,
  config: { timeoutMs: number; maxRetries: number }
) =>
  pipe(
    fetchWithTimeout(id, config.timeoutMs),
    Effect.retry(
      Schedule.exponential("200 millis").pipe(
        Schedule.intersect(Schedule.recurs(config.maxRetries)),
        Schedule.tapInput((error: PokemonError) =>
          // Log each retry attempt to terminal
          logRetry(id, error)
        )
      )
    )
  )
```

**Talk moment:** *"The retry policy is a value. Exponential backoff composed with
a max retry count. I can test it, pass it around, compose it with other schedules.
It's not buried in a while loop."*

### 5. Controlled Concurrency

```typescript
// program.ts — the main program

const fetchAllPokemon = (
  ids: ReadonlyArray<number>,
  concurrency: number
) =>
  Effect.forEach(
    ids,
    (id) =>
      pipe(
        fetchWithRetry(id, { timeoutMs: config.timeoutMs, maxRetries: config.maxRetries }),
        Effect.tap((pokemon) => logSuccess(pokemon)),
        Effect.tapError((error) => logFailure(id, error)),
        Effect.either  // Convert to Either so one failure doesn't abort everything
      ),
    { concurrency }
  )
```

**Talk moment:** Run it with concurrency=1, then concurrency=10.
*"One number. That's the difference between sequential and concurrent.
No thread pools, no worker management. Effect handles the scheduling."*

### 6. Schema Validation

```typescript
// schemas.ts

const PokemonFromApi = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  types: Schema.Array(Schema.Struct({
    type: Schema.Struct({ name: Schema.String })
  })),
  stats: Schema.Array(Schema.Struct({
    base_stat: Schema.Number,
    stat: Schema.Struct({ name: Schema.String })
  }))
}).pipe(
  Schema.transform(
    Pokemon,
    {
      decode: (raw) => ({
        id: raw.id,
        name: raw.name,
        types: raw.types.map((t) => t.type.name),
        hp: raw.stats.find((s) => s.stat.name === "hp")?.base_stat ?? 0,
        attack: raw.stats.find((s) => s.stat.name === "attack")?.base_stat ?? 0,
        defense: raw.stats.find((s) => s.stat.name === "defense")?.base_stat ?? 0,
        specialAttack: raw.stats.find((s) => s.stat.name === "special-attack")?.base_stat ?? 0,
        specialDefense: raw.stats.find((s) => s.stat.name === "special-defense")?.base_stat ?? 0,
        speed: raw.stats.find((s) => s.stat.name === "speed")?.base_stat ?? 0,
      }),
      encode: () => { throw new Error("Not needed") }
    }
  )
)
```

**Talk moment:** *"The API returns a deeply nested JSON blob. Schema.transform
maps it to my domain type. If the API changes shape, I get a ParseError — not
undefined.name at 2am."*

### 7. Layer Composition (the wiring)

```typescript
// layers.ts

const LiveLayer = Layer.mergeAll(
  PokemonClientLive,
  ConfigLive,
  LoggerLive,
)

const ChaosLayer = Layer.mergeAll(
  PokemonClientChaos,
  ConfigLive,
  LoggerLive,
)

// main.ts — pick layer based on CLI flag
const layer = args.chaos ? ChaosLayer : LiveLayer

const program = pipe(
  fetchAllPokemon(pokemonIds, args.concurrency),
  Effect.provide(layer)
)

Effect.runPromise(program)
```

**Talk moment:** *"The program is the same. The layer is different.
Chaos mode isn't an if/else in my fetching code. It's a different
wiring of the same components."*

---

## Data Model

### Pokemon (what you extract from PokéAPI)

```typescript
interface Pokemon {
  id: number
  name: string
  types: Array<string>
  hp: number
  attack: number
  defense: number
  specialAttack: number
  specialDefense: number
  speed: number
}
```

### PokéAPI Endpoint

```
GET https://pokeapi.co/api/v2/pokemon/{id}
```

One endpoint, one call per Pokémon. No auth. Generous rate limits (~100/min).

### Generation Ranges

```typescript
const GENERATIONS: Record<string, { start: number; end: number }> = {
  "1": { start: 1, end: 151 },
  "2": { start: 152, end: 251 },
  "3": { start: 252, end: 386 },
}
```

---

## Terminal Display

### Dependencies for Pretty Output

```typescript
// Use chalk for colors and a simple custom progress bar
import chalk from "chalk"
```

### Display Functions

```typescript
// display.ts

const TYPE_COLORS: Record<string, (s: string) => string> = {
  fire: chalk.red,
  water: chalk.blue,
  grass: chalk.green,
  electric: chalk.yellow,
  psychic: chalk.magenta,
  ice: chalk.cyan,
  dragon: chalk.blueBright,
  dark: chalk.gray,
  fairy: chalk.magentaBright,
  // ... etc, fallback to chalk.white
}

export const logSuccess = (pokemon: Pokemon, durationMs: number) => {
  const types = pokemon.types
    .map((t) => (TYPE_COLORS[t] ?? chalk.white)(t.charAt(0).toUpperCase() + t.slice(1)))
    .join(chalk.dim(" · "))

  const stats = chalk.dim(
    `HP:${pokemon.hp}  ATK:${pokemon.attack}  DEF:${pokemon.defense}`
  )

  const id = chalk.dim(`#${String(pokemon.id).padStart(3, "0")}`)
  const name = chalk.bold(pokemon.name.padEnd(20))
  const time = chalk.dim(`[${durationMs}ms]`)

  console.log(`  ${chalk.green("✅")} ${id} ${name} ${types.padEnd(30)} ${stats}  ${time}`)
}

export const logRetry = (id: number, attempt: number, maxRetries: number, error: PokemonError) => {
  const idStr = chalk.dim(`#${String(id).padStart(3, "0")}`)
  console.log(`  ${chalk.yellow("🔁")} ${idStr} ${"".padEnd(20)} retry ${attempt}/${maxRetries}...`)
}

export const logFailure = (id: number, error: PokemonError) => {
  const idStr = chalk.dim(`#${String(id).padStart(3, "0")}`)
  const errorMsg = chalk.red(`${error._tag}: ${getErrorMessage(error)}`)
  console.log(`  ${chalk.red("❌")} ${idStr} ${"".padEnd(20)} ${errorMsg}`)
}

export const logProgress = (stats: FetchStats) => {
  const bar = makeProgressBar(stats.loaded + stats.failed, stats.total, 30)
  const pct = Math.round(((stats.loaded + stats.failed) / stats.total) * 100)

  // Use \r to overwrite the line (or clear + rewrite at bottom)
  process.stdout.write(
    `\n  Progress: ${bar}  ${stats.loaded + stats.failed}/${stats.total}  (${pct}%)\n` +
    `  Stats: ${chalk.green(stats.loaded + " loaded")} · ` +
    `${chalk.red(stats.failed + " failed")} · ` +
    `${chalk.yellow(stats.totalRetries + " retries")} · ` +
    `avg ${stats.avgDurationMs}ms\n` +
    `  Elapsed: ${(stats.elapsedMs / 1000).toFixed(1)}s\n`
  )
}

const makeProgressBar = (current: number, total: number, width: number) => {
  const filled = Math.round((current / total) * width)
  const empty = width - filled
  return chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(empty))
}
```

### CLI Arguments

```typescript
// main.ts — simple arg parsing (no library needed)

const args = {
  gen: parseInt(process.argv.find((a) => a.startsWith("--gen="))?.split("=")[1] ?? "1"),
  concurrency: parseInt(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? "5"),
  timeout: parseInt(process.argv.find((a) => a.startsWith("--timeout="))?.split("=")[1] ?? "5000"),
  retries: parseInt(process.argv.find((a) => a.startsWith("--retries="))?.split("=")[1] ?? "3"),
  chaos: process.argv.includes("--chaos"),
}
```

Usage:
```bash
npx tsx src/main.ts --gen=1 --concurrency=5
npx tsx src/main.ts --gen=1 --concurrency=10 --chaos
npx tsx src/main.ts --gen=1 --concurrency=1 --timeout=1000
```

---

## Project Structure

```
pokedex-fetcher/
├── src/
│   ├── main.ts              # Entry: parse CLI args, pick layer, run program
│   ├── program.ts           # fetchAllPokemon — the main Effect program
│   ├── fetch.ts             # fetchSingle — timeout + retry per Pokémon
│   ├── services/
│   │   ├── PokemonClient.ts # Context.Tag + Live + Chaos layers
│   │   └── Config.ts        # FetchConfig service (from CLI args)
│   ├── errors.ts            # FetchError, TimeoutError, ParseError
│   ├── schemas.ts           # Pokemon schema + PokéAPI transform
│   ├── layers.ts            # LiveLayer, ChaosLayer composition
│   └── display.ts           # Terminal formatting (chalk, progress bar)
├── package.json
├── tsconfig.json
└── README.md
```

**8 source files. ~300-400 lines total. That's the entire demo.**

---

## Phase 1: Research & Learn (Mon 16 – Tue 17)

### Day 1 — Monday: Effect core concepts

**Morning — Services, Layers, Context.Tag (2-3 hours)**

- Read: https://effect.website/docs/requirements-management/services/
- Read: https://effect.website/docs/requirements-management/layers/
- Exercise: Build a minimal `PokemonClient` Context.Tag with a `fetch(id)` method.
  Create `PokemonClientLive` that calls PokéAPI using `Effect.tryPromise`.
  Create `PokemonClientTest` that returns hardcoded Pikachu.
  Wire them with Layers, run with `Effect.runPromise`.
  Verify you can swap layers and the program works with both.

**Afternoon — Typed errors + Schema (2-3 hours)**

- Read: https://effect.website/docs/error-management/expected-errors/
- Read: https://effect.website/docs/schema/introduction/
- Exercise: Define `FetchError`, `TimeoutError`, `ParseError` using `Data.TaggedError`.
  Write a `fetchSingle` function that:
  1. Fetches from PokéAPI
  2. Decodes with `Schema.decodeUnknown`
  3. Returns typed errors on the error channel
  Test: fetch Pokémon #1 (Bulbasaur) → success.
  Test: fetch Pokémon #99999 → `FetchError` with status 404.
  Test: manually break the schema → `ParseError`.

**Evening — Timeout + Retry + Schedule (2-3 hours)**

- Read: https://effect.website/docs/scheduling/introduction/
- Read: https://effect.website/docs/scheduling/repetition-and-retry/
- Exercise: Add `Effect.timeout` to your fetch.
  Set timeout to 1ms → get `TimeoutError`.
  Add `Effect.retry` with `Schedule.exponential("200 millis")` + `Schedule.recurs(3)`.
  Use `Schedule.tapInput` to log each retry attempt.
  Test: wrap a deliberately failing fetch → see 3 retry attempts with backoff.

### Day 2 — Tuesday: Concurrency + display

**Morning — Concurrent fetching (2-3 hours)**

- Read: https://effect.website/docs/concurrency/concurrency-options/
- Read: https://effect.website/docs/concurrency/fibers/
- Exercise: Fetch Pokémon #1-20 using `Effect.forEach(ids, fn, { concurrency: 3 })`.
  Log each result as it arrives. Note: they arrive out of order! That's correct.
  Change concurrency to 1 → they arrive in order, but slower.
  Change concurrency to 10 → fast, out of order.
  Use `Effect.either` per fetch so one failure doesn't abort everything.

**Afternoon — Pretty terminal output (2-3 hours)**

- Install chalk: `pnpm add chalk`
- Build `display.ts`: success line, retry line, failure line, progress bar, stats
- Wire it into the fetch pipeline:
  - `Effect.tap` after success → `logSuccess`
  - `Effect.tapError` after failure → `logFailure`
  - Retry schedule `tapInput` → `logRetry`
- Run a full fetch of Gen 1 (151) with concurrency=5 and enjoy the output

**Evening — Chaos mode + Layer wiring (1-2 hours)**

- Build `PokemonClientChaos` layer
- Build `layers.ts` with `LiveLayer` and `ChaosLayer`
- Build `main.ts` with CLI arg parsing
- Test the full flow:
  ```bash
  npx tsx src/main.ts --gen=1 --concurrency=5
  npx tsx src/main.ts --gen=1 --concurrency=10 --chaos
  ```
- You should have a working demo by end of Day 2!

---

## Phase 2: Polish & Harden (Wed 18 – Fri 20)

### Day 3 — Wednesday: Edge cases + error handling

- Handle PokéAPI rate limiting gracefully (unlikely but be safe):
  - If you get a 429, add it as a typed error and retry with longer backoff
- Handle network errors (no internet) → clear `FetchError` message
- Make sure `--timeout=500` actually causes some timeouts (test with low values)
- Make sure chaos mode with `--retries=0` shows immediate failures (no retry)
- Test combinations:
  - `--concurrency=1 --chaos` → sequential with failures
  - `--concurrency=20 --timeout=1000` → fast with some timeouts
  - `--concurrency=5 --retries=0 --chaos` → fast failures, no recovery
- Add a summary at the end:
  ```
  ┌───────────────────────────────────────┐
  │ COMPLETE                              │
  │ 145/151 loaded · 6 failed · 23 retries│
  │ Total time: 5.2s                      │
  │                                       │
  │ Errors:                               │
  │   FetchError:   4                     │
  │   TimeoutError: 2                     │
  │   ParseError:   0                     │
  │                                       │
  │ Failed Pokémon:                       │
  │   #007 Squirtle  — FetchError: Chaos! │
  │   #025 Pikachu   — TimeoutError: 2s   │
  │   ...                                 │
  └───────────────────────────────────────┘
  ```

### Day 4 — Thursday: Prepare the "before" code

Write the vanilla TypeScript version of the same program. This is the
"before" slide in your talk. It should look messy but realistic.

```typescript
// vanilla.ts — the "bad" version

async function fetchAllPokemon(ids: number[], concurrency: number) {
  const results: any[] = []
  const errors: any[] = []

  // Manual concurrency limiting with a semaphore pattern
  let running = 0
  let index = 0

  return new Promise((resolve) => {
    function next() {
      while (running < concurrency && index < ids.length) {
        const id = ids[index++]
        running++

        fetchWithRetry(id, 3)
          .then((pokemon) => {
            results.push(pokemon)
            console.log(`✅ ${pokemon.name}`)
          })
          .catch((error) => {
            errors.push({ id, error })
            console.log(`❌ #${id} failed: ${error.message}`) // error is 'unknown' 🙃
          })
          .finally(() => {
            running--
            if (index >= ids.length && running === 0) {
              resolve({ results, errors })
            } else {
              next()
            }
          })
      }
    }
    next()
  })
}

async function fetchWithRetry(id: number, retries: number): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(
        `https://pokeapi.co/api/v2/pokemon/${id}`,
        { signal: controller.signal }
      )
      clearTimeout(timeout)

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      return await response.json() // no validation 🙃
    } catch (error) {
      if (attempt === retries) throw error // re-throw unknown 🙃
      await new Promise((r) => setTimeout(r, 200 * Math.pow(2, attempt)))
    }
  }
}
```

Point out on the slide:
- `error` is `unknown` in every catch
- Concurrency is manual semaphore logic
- Timeout is `AbortController` + `setTimeout` boilerplate
- Retry is a hand-rolled for loop
- No validation on the API response
- 40+ lines just for plumbing

Then show the Effect version: same behavior, typed, composable, ~15 lines of business logic.

### Day 5 — Friday: Code review + cleanup

- Review every file. Remove anything that doesn't serve the talk.
- Make sure variable names are clear for a projector (no abbreviations)
- Add comments at key points that map to your talk sections
- Make sure `npx tsx src/main.ts --help` prints usage info
- Run through the demo 3 times end to end
- Optional: create a few preset scripts:
  ```bash
  # demo-sequential.sh
  npx tsx src/main.ts --gen=1 --concurrency=1

  # demo-concurrent.sh
  npx tsx src/main.ts --gen=1 --concurrency=10

  # demo-chaos.sh
  npx tsx src/main.ts --gen=1 --concurrency=10 --chaos --retries=3

  # demo-timeout.sh
  npx tsx src/main.ts --gen=1 --concurrency=10 --timeout=1000
  ```

---

## Phase 3: Talk Prep (Sat 21 – Wed 25)

### Day 6 — Saturday: Write the talk

**Talk structure (30 minutes):**

```
1. THE HOOK (2 min)
   Terminal is open. Run the concurrent fetch.
   151 Pokémon load in 5 seconds with colored output.
   "That was 151 concurrent HTTP requests with typed errors,
   automatic retries, and controlled concurrency.
   Let me show you how."

2. THE PROBLEM (4 min)
   Show vanilla.ts on a slide.
   Point out: error is `unknown`, concurrency is manual,
   timeout is boilerplate, retry is a for loop, no validation.
   "Raise your hand if you have code like this in production."
   "It works... until it doesn't. And when it fails, you're
   debugging `undefined is not a function` at 2am."

3. TYPED ERRORS (6 min)
   Show the three TaggedError classes (6 lines of code).
   Show the function signature with the error channel.
   Show Effect.catchTag handling each error differently.
   Run the demo with --chaos → show typed errors in terminal.
   Key moment: "TimeoutError is not a string. It's a value
   with pokemonId and timeoutMs. I can pattern match on it."

4. TIMEOUT & RETRY (6 min)
   Show Effect.timeout (one line).
   Show Effect.retry with Schedule.exponential (three lines).
   Run with --timeout=1000 → watch timeouts fire.
   Run with --chaos --retries=3 → watch retries with backoff.
   Key moment: "The retry policy is a value I can compose.
   Exponential backoff, max 3 retries, with a tap that logs
   each attempt. Try doing that in a try/catch."

5. CONCURRENCY (6 min)
   Show Effect.forEach with { concurrency }.
   Run with --concurrency=1 → slow, sequential.
   Run with --concurrency=10 → 10x faster.
   Explain fibers briefly (lightweight, managed by Effect runtime).
   Key moment: "One number. That's it. Effect handles scheduling,
   interruption, and cleanup. Compare that to the manual semaphore
   in the vanilla version."

6. SERVICES & LAYERS (4 min)
   Show PokemonClient Context.Tag.
   Show PokemonClientLive vs PokemonClientChaos.
   Show layers.ts: same program, different wiring.
   "Chaos mode isn't an if/else. It's a Layer that wraps the
   real client. The program doesn't know the difference."
   Mention testing: "I can swap in a test layer that returns
   instant hardcoded data. Zero network calls. Same program."

7. WRAP-UP (2 min)
   Show the full program.ts — it's probably 20-30 lines.
   "This replaces the 60-line vanilla version. It's shorter,
   it's typed, it's composable, and it handles every edge case."
   "Effect isn't just for FP enthusiasts. It's a practical tool
   for making async code that doesn't break at 2am."
   "Questions?"
```

### Day 7 — Sunday: Build slides

- Keep slides minimal. Mostly code snippets.
- Key slides:
  1. Vanilla TS fetcher (the "before" — full screen, messy)
  2. The three TaggedError classes (clean, 6 lines)
  3. Function signature with error channel
  4. `Effect.timeout` (one line)
  5. `Effect.retry` with Schedule (three lines)
  6. `Effect.forEach` with `{ concurrency }` (the money shot)
  7. `PokemonClient` Context.Tag + two implementations
  8. `layers.ts` — LiveLayer vs ChaosLayer
  9. The complete `program.ts` (20-30 lines)
- Consider using code slides in your editor (VS Code with large font)
  rather than actual presentation software

### Day 8 — Monday: First rehearsal

- Rehearse full talk with timer — target 25 minutes
- Run each demo command and make sure the output looks good on a projector
  (high contrast terminal theme, large font)
- Identify any code that's hard to explain → simplify or cut
- Note: the concurrency demo is your strongest moment. Make sure
  the speed difference between 1 and 10 is dramatic and visible.

### Day 9 — Tuesday: Second rehearsal

- Rehearse again, incorporate fixes from Day 8
- Terminal setup:
  - Font size: 20pt+ (test from the back of a room)
  - Theme: dark background, high contrast colors
  - Clear the terminal between demo runs
- Prepare fallback: pre-recorded terminal session (use `asciinema` or a screen recording)
  in case PokéAPI is down or venue Wi-Fi is bad

### Day 10 — Wednesday: Final prep

- One last rehearsal
- Make sure Node, tsx, and dependencies are installed and working
- Pre-run the demo once to warm up PokéAPI caches
- Prepare your demo scripts (the bash one-liners)
- Set up your terminal layout
- Sleep well

### Talk Day — Thursday, March 26

- Arrive early, test the projector resolution + font size
- Run one demo fetch to warm caches
- Have your demo scripts ready
- Keep energy up — you're showing Pokémon loading in a terminal, it's inherently fun
- End with questions

---

## Reading List

### Must-read — Day 1

| # | Topic | URL |
|---|-------|-----|
| 1 | Services & Context.Tag | https://effect.website/docs/requirements-management/services/ |
| 2 | Layers | https://effect.website/docs/requirements-management/layers/ |
| 3 | Expected errors (TaggedError) | https://effect.website/docs/error-management/expected-errors/ |
| 4 | Schema introduction | https://effect.website/docs/schema/introduction/ |
| 5 | Schedule (retry/repeat) | https://effect.website/docs/scheduling/introduction/ |
| 6 | Retry & repetition | https://effect.website/docs/scheduling/repetition-and-retry/ |

### Must-read — Day 2

| # | Topic | URL |
|---|-------|-----|
| 7 | Concurrency options | https://effect.website/docs/concurrency/concurrency-options/ |
| 8 | Fibers | https://effect.website/docs/concurrency/fibers/ |
| 9 | Running effects | https://effect.website/docs/getting-started/running-effects/ |
| 10 | PokéAPI docs | https://pokeapi.co/docs/v2 |

### Nice-to-read

| Topic | URL |
|-------|-----|
| Effect patterns repo | https://github.com/PaulJPhilp/EffectPatterns |
| Ref (mutable state) | https://effect.website/docs/state-management/ref/ |
| Layer memoization | https://effect.website/docs/requirements-management/layer-memoization/ |
| Interruption model | https://effect.website/docs/concurrency/interruption-model/ |
| Effect.either (error recovery) | https://effect.website/docs/error-management/expected-errors/ |

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| PokéAPI rate limiting | Low | ~100 req/min. Gen 1 = 151. Even with retries, you're fine. Pre-warm cache by running once before the talk. |
| PokéAPI is down | Very Low | Pre-record a terminal session with `asciinema`. Or cache responses locally (write a `--cache` flag that saves to JSON). |
| Venue Wi-Fi blocks PokéAPI | Low | Use phone hotspot. Or add a local cache mode. |
| Terminal output is hard to read on projector | Medium | Use 20pt+ font, high contrast theme, test before the talk. Consider using `chalk.level = 3` for true color support. |
| Talk runs long | Medium | Services & Layers section (section 6) is most cuttable — trim to 1 minute. |
| Audience asks "why not just use Promise.allSettled?" | High | Great question! Answer: "Promise.allSettled gives you concurrency and error collection, but no concurrency _limit_, no typed errors, no retry, no timeout, no DI, no composability." |

---

## Dependencies

```bash
pnpm add effect @effect/schema
pnpm add chalk
pnpm add -D typescript tsx @types/node
```

Four dependencies. That's it.

---

## What You're NOT Building

- ❌ No server / HTTP endpoints
- ❌ No frontend / React / HTML
- ❌ No database
- ❌ No WebSocket
- ❌ No framework (Hono, Express, etc.)
- ❌ No build step (tsx runs TypeScript directly)
- ❌ No tests (nice-to-have but not needed for the talk)

**The entire demo is: `npx tsx src/main.ts --gen=1 --concurrency=10`**

---

## Demo Script (What You Run on Stage)

```bash
# 1. Sequential — slow and boring (run for 10 seconds, then Ctrl+C)
npx tsx src/main.ts --gen=1 --concurrency=1

# 2. Concurrent — fast and exciting
npx tsx src/main.ts --gen=1 --concurrency=10

# 3. Chaos mode — failures and retries
npx tsx src/main.ts --gen=1 --concurrency=10 --chaos

# 4. Tight timeout — some requests fail
npx tsx src/main.ts --gen=1 --concurrency=10 --timeout=1000

# 5. No retries + chaos — raw failures
npx tsx src/main.ts --gen=1 --concurrency=10 --chaos --retries=0
```

Each run takes 5-15 seconds. You can demo all 5 in under 2 minutes.
