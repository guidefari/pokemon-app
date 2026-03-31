---
theme: default
title: "The Effects of Effect: What It Is and Why You Might Want It"
titleTemplate: '%s'
highlighter: shiki
lineNumbers: true
transition: slide-left
mdc: true
---

<div class="flex h-full items-center justify-between px-4">

  <div class="flex-1 pr-8">
    <h1 class="text-5xl font-bold leading-tight mb-3">The Effects of Effect</h1>
    <p class="text-xl text-gray-400 mb-12">What It Is and Why You Might Want It</p>
    <div class="border-l-4 border-yellow-400 pl-4">
      <p class="font-bold text-lg">Asimthande Majola</p>
      <p class="text-gray-400">Investec Mobile Developer</p>
    </div>
  </div>

  <div class="relative w-96 h-80 flex-shrink-0">
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png"
      class="absolute top-0 right-0 w-44 drop-shadow-xl" />
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png"
      class="absolute bottom-4 left-4 w-36 drop-shadow-xl" />
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png"
      class="absolute bottom-0 right-12 w-28 drop-shadow-xl" />
  </div>

</div>

---

# Before we start

This talk is for you if:

<div v-click class="mt-6">

- You know TypeScript and have written `async/await` code
- You've seen a `Promise` rejection in production and wondered why TypeScript didn't warn you
- You're curious about what a "better" async model looks like

</div>

<div v-click class="mt-6">

This talk is **not** trying to teach you every API.

It's trying to give you the **mental model** — so when you explore Effect yourself, things make sense.

</div>

---

# The problem with async TypeScript

TypeScript is great at tracking what your functions **return**.

<div v-click class="mt-8">

```typescript
async function fetchPokemon(id: number): Promise<Pokemon>
```

This tells you one thing: if everything goes well, you get a `Pokemon`.

</div>

<div v-click class="mt-8">

But it tells you **nothing** about what can go wrong:

- The network could fail
- The server could return a 404 or 500
- The response JSON could have an unexpected shape
- You might need to retry — but how many times? With what delay?

</div>

<div v-click class="mt-8">

**All of that is invisible to the compiler.** You find out at runtime, in production.

</div>

---
layout: center
class: bg-slate-800 text-white rounded-xl
---

<div class="text-center px-12 py-4">

<div class="text-4xl font-bold mb-6">→ Code time</div>

<div class="text-xl text-slate-300 mb-8">Let's look at the naive approach — and break it</div>

<div class="text-left inline-block space-y-3 text-slate-200">

**Open:** `example_effect.ts` (top of file — the Promise version)

- Read the function signature — what does it promise?
- Ask: what happens if the network is down?
- Ask: what happens if the response is a 500?
- Show what `as Pokemon` actually does (nothing)
- Hover over the return type — TypeScript is silent on all failures

</div>

</div>

---

# What is Effect?

Effect adds two more things to the type your functions return.

<div v-click class="mt-0">
Instead of:
```typescript
Promise<Pokemon>
// "gives you a Pokemon, eventually"
```
</div>
<div v-click class="mt-0">
You get:
```typescript
Effect.Effect<Pokemon, NetworkError | ParseError, HttpClient>
//             ^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^
//           success        what can go wrong      what it needs
```
</div>

<div v-click class="mt-0">

Three channels — every function now carries a complete contract:

| Channel | Question it answers |
|---|---|
| **Success** | What do I get if everything works? |
| **Error** | What can go wrong? (compiler tracks every case) |
| **Requirements** | What does this need to run? |

</div>

---

# Effects are lazy

A `Promise` starts running the moment you create it.

An `Effect` is just a **description**. Nothing runs until you explicitly ask it to.

<div v-click class="mt-8">

| | When does work happen? |
|---|---|
| `Promise` | Immediately, when created |
| `Effect` | Only when you call `Effect.runPromise(...)` |

</div>

<div v-click class="mt-8">

This means you can **build up**, **compose**, and **pass around** effects freely.

Adding retry logic, logging, or a timeout is just wrapping the description — not re-running anything.

</div>

---

# Writing Effect code feels like async/await

Effect uses JavaScript **generator functions**. The syntax looks almost identical to `async/await`.

<div v-click class="mt-8">

`async/await` — unwraps a `Promise`:
```typescript
const user = await getUser()   // Promise<User> → User
```

</div>

<div v-click class="mt-6">

Effect generators — unwraps an `Effect`:
```typescript
const user = yield* getUser()  // Effect<User, Err, Req> → User
```

</div>

<div v-click class="mt-6">

The key difference: every `yield*` call **threads its error and requirement types** into the outer effect automatically.

You write sequential code. The compiler accumulates all the ways it can fail.

</div>

---
layout: center
class: bg-slate-800 text-white rounded-xl
---

<div class="text-center px-12 py-4">

<div class="text-4xl font-bold mb-6">→ Code time</div>

<div class="text-xl text-slate-300 mb-8">Rewriting the fetch with Effect</div>

<div class="text-left inline-block space-y-3 text-slate-200">

**Open:** `example_effect.ts` (the Effect version below)

- Show `Effect.gen(function* () { ... })` — same shape as async/await
- Show `Effect.tryPromise` — wrapping a Promise, naming the error
- Show `if (!response.ok)` → `Effect.fail(...)` — explicit, typed failure
- Hover over the return type — every error is visible now
- Show `Effect.runPromise(...)` at the bottom — nothing ran until here

</div>

</div>

---

# Typed errors

In plain TypeScript, errors are `unknown`. You have to guess what was thrown.

<div v-click class="mt-8">

In Effect, errors are **classes you define** — with typed fields:

```typescript
class FetchError extends Schema.TaggedErrorClass("FetchError")(
  "FetchError",
  { pokemonId: Schema.Number, statusCode: Schema.Number }
) {}
```

</div>

<div v-click class="mt-6">

Each error class has a **tag** — a string that uniquely identifies it.

You handle errors by tag, and the compiler knows which fields are available:

```typescript
Effect.catchTag("FetchError", (e) => {
  console.log(e.pokemonId, e.statusCode) // fully typed
})
```

</div>

<div v-click class="mt-6">

If an error is in your effect's type and you haven't handled it, **the compiler warns you**. No more silent failures.

</div>

---

# Services: "I need a thing"

A **Service** is a typed contract — it describes what something can do, without saying how it does it.

<div v-click class="mt-8">

Think of it like a USB port: it defines the interface.

Your code says *"I need an HTTP client"* — it doesn't care if it's a real network client, a mock, or a test stub. As long as it fits the contract.

</div>

<div v-click class="mt-6">

```typescript
class FetchClient extends ServiceMap.Service<FetchClient, {
  fetchPokemon(id: number): Effect<Pokemon, FetchError>
}>()("@pokemon-app/FetchClient") {}
```

The string tag is how Effect identifies the service at runtime.

</div>

<div v-click class="mt-6">

When your effect uses a service, it appears in the **Requirements** channel.

**If you forget to provide it, the code won't compile.** There are no "service not found" runtime errors.

</div>

---

# Layers: "Here's the thing"

A **Layer** is the implementation of a service — the actual cable for the USB port.

<div v-click class="mt-8">

Layers can depend on other layers. Effect tracks those dependencies in the type system and verifies the whole graph compiles before anything runs.

</div>

<div v-click class="mt-6">

```
Layer<FetchClient, never, never>
      ^^^^^^^^^^^  ^^^^^  ^^^^^
      provides     can't  needs
                   fail   nothing
```

A layer that "needs nothing" is self-contained — ready to run.

</div>

<div v-click class="mt-6">

**The killer feature for testing:**

Swap one layer for a mock, and every piece of code that depends on that service automatically gets the mock — no monkey-patching, no dependency container setup.

</div>

---
layout: center
class: bg-slate-800 text-white rounded-xl
---

<div class="text-center px-12 py-4">

<div class="text-4xl font-bold mb-6">→ Code time</div>

<div class="text-xl text-slate-300 mb-8">Services, Layers, and how they wire together</div>

<div class="text-left inline-block space-y-4 text-slate-200">

**Open:** `src/services/FetchClient.ts`

- Show the `FetchClient` class — the contract, no implementation
- Show `fetchClientLayer` — the implementation, built with `Layer.effect`
- Point out `yield* HttpClient.HttpClient` — the layer itself has dependencies
- Show `Layer.provide(FetchHttpClient.layer)` — satisfying those dependencies

**Open:** `src/main.ts`

- Show `Layer.mergeAll(...)` — three layers snapping together like puzzle pieces
- Show `Effect.provide(mainLayer)` — the moment the Requirements channel becomes `never`

</div>

</div>

---

# Schema: one definition, two uses

The classic problem: your Zod schema and your TypeScript `interface` slowly drift apart.

<div v-click class="mt-8">

Effect's Schema solves this by making them **the same thing**:

```typescript
const Pokemon = S.Struct({ id: S.Number, name: S.String, ... })

type Pokemon = S.Schema.Type<typeof Pokemon>
//   ^^^^^^^ TypeScript type — derived, not written separately
```

</div>

<div v-click class="mt-6">

You define the shape once. You get:

- Runtime validation at API boundaries
- TypeScript types for free
- Typed decode errors with field-level detail (`"abilities[0].name: expected string"`)

</div>

<div v-click class="mt-6">

The same Schema system powers typed error classes, HTTP response validation, and CLI argument parsing — one consistent model throughout.

</div>

---

# Streams: lazy, concurrent arrays

A `Stream` is like an array — but items arrive over time, and you control how many are processed at once.

<div v-click class="mt-8">

```typescript
Stream.fromIterable(pokemonIds).pipe(
  Stream.mapEffect(fetchPokemon, { concurrency: 20 })
)
```

Fetch 20 Pokémon simultaneously. Effect handles backpressure — it won't start the 21st until one of the first 20 finishes.

</div>

<div v-click class="mt-6">

All the same guarantees apply inside a stream:

- Errors are typed and propagate correctly
- Services inside `mapEffect` are tracked in Requirements
- Cancellation and resource cleanup are handled by the runtime

</div>

<div v-click class="mt-6">

`Stream.runDrain` — run every item, like `forEach`.

`Stream.tap` — run a side effect per item without consuming it, great for displaying results as they arrive.

</div>

---
layout: center
class: bg-slate-800 text-white rounded-xl
---

<div class="text-center px-12 py-4">

<div class="text-4xl font-bold mb-6">→ Code time</div>

<div class="text-xl text-slate-300 mb-8">Schema, Streams, and the CLI in action</div>

<div class="text-left inline-block space-y-4 text-slate-200">

**Open:** `src/schema.ts`

- Scroll through — show how nested schemas compose (`Ability`, `PokemonType`, `Sprites`)
- Show the last two lines: `S.Schema.Type<typeof Pokemon>` — the type falls out for free

**Open:** `src/cli.ts`

- Show `streamPokemonLookups` — iterable → Stream → mapEffect with concurrency
- Show `withExponentialBackoff` — retry as a composable Schedule value
- Show a `Command.make` — flags, validation, handler as an Effect

**Run it:**
- `bun run dev pokemon pikachu`
- `bun run dev pokemon list --gen 1 --concurrency 10`

</div>

</div>

---

# How it all fits together

Every concept builds on the one before it.

<div v-click class="mt-6">

**Schema** defines the shape of your data — used everywhere, defined once.

</div>

<div v-click class="mt-4">

**Effects** describe your program — typed errors, lazy execution, composable.

</div>

<div v-click class="mt-4">

**Services** are typed contracts — your business logic depends on interfaces, not implementations.

</div>

<div v-click class="mt-4">

**Layers** wire up the implementations — swappable, composable, type-checked at compile time.

</div>

<div v-click class="mt-4">

**Streams** process data over time — same guarantees, concurrent, backpressure built in.

</div>

<div v-click class="mt-4">

Once you learn the model in one place, it works everywhere. That's the point.

</div>

---

# Why you might want it

<div v-click class="mt-6">

**The compiler becomes your safety net.**
Typed errors mean you can't ship code that silently ignores a failure case. The compiler tells you — before production does.

</div>

<div v-click class="mt-6">

**Testing becomes trivial.**
Swap one layer for a mock. No global state, no monkey-patching. Your test provides a different implementation — your code never changes.

</div>

<div v-click class="mt-6">

**Complexity scales gracefully.**
Retry logic, concurrency, observability — you add them by composing, not by rewriting.

</div>

<div v-click class="mt-6">

**You don't have to go all-in.**
Wrap one fetch in `Effect.tryPromise`. Start there. The benefits show up immediately and you migrate at your own pace.

</div>

---

# When you might not want it

<div v-click class="mt-6">

**The mental model takes time.**
`Effect<A, E, R>` is genuinely different from `Promise<A>`. Budget time for the team to get comfortable — the first few weeks can feel slow.

</div>

<div v-click class="mt-6">

**Small projects may not need it.**
A weekend script or a simple CRUD endpoint doesn't need typed DI and composable schedules. The ceremony exists to manage complexity — if there's no complexity, there's no payoff.

</div>

<div v-click class="mt-8">

**The honest take:**

Once it clicks, going back to untyped async feels like driving without a seatbelt.
You can do it — but every time the road gets rough, you notice it's not there.

</div>

---
layout: center
---

<div class="flex flex-col items-center gap-6">

  <div class="flex gap-4 items-end mb-2">
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png" class="w-28 drop-shadow-lg" />
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png" class="w-20 drop-shadow-lg" />
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png" class="w-16 drop-shadow-lg" />
  </div>

  <h1 class="text-4xl font-bold">Thank You</h1>

  <p class="text-gray-400 text-center max-w-lg">
    The app we walked through is a real Pokémon CLI — fetch, schema, typed errors,
    retry, streams, services, layers, and a full CLI. Built with Effect v4 beta.
  </p>

  <div class="border-l-4 border-yellow-400 pl-4 mt-2">
    <p class="font-bold">Asimthande Majola</p>
    <p class="text-gray-400">Investec Mobile Developer</p>
  </div>

</div>
