import { fold } from "./format";

/** Grandes villes du Maroc, proposées pour les options de prix (d'autres peuvent être ajoutées). */
export const MOROCCO_CITIES = [
  "Agadir",
  "Al Hoceïma",
  "Azrou",
  "Béni Mellal",
  "Benguerir",
  "Berkane",
  "Berrechid",
  "Casablanca",
  "Chefchaouen",
  "Dakhla",
  "El Jadida",
  "El Kelaâ des Sraghna",
  "Errachidia",
  "Essaouira",
  "Fès",
  "Fnideq",
  "Guelmim",
  "Ifrane",
  "Inezgane",
  "Kénitra",
  "Khémisset",
  "Khénifra",
  "Khouribga",
  "Ksar El Kébir",
  "Laâyoune",
  "Larache",
  "Marrakech",
  "Martil",
  "Meknès",
  "Midelt",
  "Mohammédia",
  "Nador",
  "Ouarzazate",
  "Oued Zem",
  "Oujda",
  "Rabat",
  "Safi",
  "Salé",
  "Settat",
  "Sidi Bennour",
  "Sidi Kacem",
  "Sidi Slimane",
  "Skhirat",
  "Tanger",
  "Tan-Tan",
  "Taourirt",
  "Taroudant",
  "Taza",
  "Témara",
  "Tétouan",
  "Tiznit",
  "Youssoufia",
  "Zagora",
];

export const CITY_MAX = 40;

/** Villes proposées : la liste ci-dessus + celles déjà saisies sur des options, triées, sans doublon. */
export function cityChoices(extra: (string | null | undefined)[]): string[] {
  const byKey = new Map<string, string>();
  for (const c of [...MOROCCO_CITIES, ...extra]) {
    if (c && !byKey.has(fold(c))) byKey.set(fold(c), c);
  }
  return [...byKey.values()].sort((a, b) => fold(a).localeCompare(fold(b)));
}

/** Nom de ville nettoyé (espaces) et, s'il existe déjà dans la liste, écrit comme dans la liste. */
export function normalizeCity(raw: string, known: string[] = MOROCCO_CITIES): string {
  const c = raw.trim().replace(/\s+/g, " ");
  return known.find((k) => fold(k) === fold(c)) ?? c;
}
