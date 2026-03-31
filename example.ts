interface Pokemon {
  id: number;
  name: string;
  base_experience: number;
  height: number;
  weight: number;
  abilities: {
    ability: { name: string; url: string };
    is_hidden: boolean;
    slot: number;
  }[];
  types: { slot: number; type: { name: string; url: string } }[];
  stats: {
    base_stat: number;
    effort: number;
    stat: { name: string; url: string };
  }[];
  moves: { move: { name: string; url: string } }[];
  sprites: { front_default: string; back_default: string };
  species: { name: string; url: string };
}

const fetchPokemon = async (name: string): Promise<Pokemon> => {
  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
    try {
      const data = await response.json();
      return data as Pokemon;
    } catch (error) {
      console.error("Parse Error", error);
    }
  } catch (error) {
    console.error(error);
  }
  throw new Error(
    "All the other errors we don't know about, also typescript complains",
  );
};

fetchPokemon("pikachu").then(console.log);

// // ---- Types ---------------------------------------------------------------

// interface NamedResource {
//   name: string;
//   url: string;
// }

// interface Pokemon {
//   id: number;
//   name: string;
//   base_experience: number;
//   height: number;
//   weight: number;
//   abilities: { ability: NamedResource; is_hidden: boolean; slot: number }[];
//   types: { slot: number; type: NamedResource }[];
//   stats: { base_stat: number; effort: number; stat: NamedResource }[];
//   moves: { move: NamedResource }[];
//   sprites: { front_default: string; back_default: string };
//   species: NamedResource;
// }

// // ---- Fetcher -------------------------------------------------------------

// // Promise<Pokemon> — but can throw NetworkError | HttpError | ParseError.
// // TypeScript has no idea. The caller finds out at runtime.
// const fetchPokemon = async (name: string): Promise<Pokemon> => {
//   let response: Response;

//   try {
//     response = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
//   } catch (cause) {
//     throw new NetworkError(cause);
//   }

//   if (!response.ok) {
//     throw new HttpError(response.status, response.statusText);
//   }

//   let data: unknown;
//   try {
//     data = await response.json();
//   } catch {
//     throw new ParseError("Response body is not valid JSON");
//   }

//   if (!isPokemon(data)) {
//     throw new ParseError("Response does not match the expected Pokemon shape");
//   }

//   return data;
// };

// // ---- Main ----------------------------------------------------------------

// fetchPokemon("pikachu")
//   .then((pokemon) => console.log(pokemon))
//   .catch((error: unknown) => {
//     if (error instanceof NetworkError) {
//       console.error("[NetworkError]", error.message);
//     } else if (error instanceof HttpError) {
//       console.error(`[HttpError ${error.status}]`, error.message);
//     } else if (error instanceof ParseError) {
//       console.error("[ParseError]", error.message);
//     } else {
//       console.error("[UnknownError]", error);
//     }
//   });
