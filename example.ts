type Pokemon = {
  id: number;
  name: string;
  base_experience: number;
  height: number;
  weight: number;

  abilities: {
    ability: {
      name: string;
      url: string;
    };
    is_hidden: boolean;
    slot: number;
  }[];

  types: {
    slot: number;
    type: {
      name: string;
      url: string;
    };
  }[];

  stats: {
    base_stat: number;
    effort: number;
    stat: {
      name: string;
      url: string;
    };
  }[];

  moves: {
    move: {
      name: string;
      url: string;
    };
  }[];

  sprites: {
    front_default: string;
    back_default: string;
  };

  species: {
    name: string;
    url: string;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPokemon = (value: unknown): value is Pokemon => {
  if (!isRecord(value)) {
    return false;
  }

  const pokemon = value as Record<string, unknown>;

  return (
    typeof pokemon.id === "number" &&
    typeof pokemon.name === "string" &&
    typeof pokemon.base_experience === "number" &&
    typeof pokemon.height === "number" &&
    typeof pokemon.weight === "number" &&
    Array.isArray(pokemon.abilities) &&
    Array.isArray(pokemon.types) &&
    Array.isArray(pokemon.stats) &&
    Array.isArray(pokemon.moves) &&
    isRecord(pokemon.sprites) &&
    typeof pokemon.sprites.front_default === "string" &&
    typeof pokemon.sprites.back_default === "string" &&
    isRecord(pokemon.species) &&
    typeof pokemon.species.name === "string" &&
    typeof pokemon.species.url === "string"
  );
};

const fetchPikachu = async () => {
  try {
    const response = await fetch("https://pokeapi.co/api/v2/pokemon/pikachu");

    if (response.status === 404) {
      console.error("Pokemon not found (404).");
      return;
    }

    if (!response.ok) {
      console.error(
        `Request failed (${response.status} ${response.statusText}).`,
      );
      return;
    }

    const payload: unknown = await response.json();

    if (!isPokemon(payload)) {
      console.error("Response JSON does not match the Pokemon type.");
      return;
    }

    console.log(payload);
  } catch (error) {
    if (error instanceof TypeError) {
      console.error(
        "Connection error while fetching Pokemon. Check your internet or API URL.",
      );
      return;
    }

    console.error("Unexpected error while fetching Pokemon:", error);
  }
};

fetchPikachu();

// const fetchItem = async () => {
//   // You first fetch your item.
//   const itemResponse = await fetch("");

//   const itemJson = await itemResponse.json();

//   console.log(itemJson)
// };
