export function slugifyForEverynoise(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/\s+/g, "")            // espaces
    .replace(/[^a-z0-9]/g, "");     // caractères spéciaux
}

export function everynoiseUrl(genreName) {
  const slug = slugifyForEverynoise(genreName);
  return `https://everynoise.com/everynoise1d-${slug}.html`;
}

/**
 * Règles demandées :
 * - Special => exclu (return null)
 * - Flou => 0.35*skip + 0.65*kiff
 * - Sinon => 0.5*skip + 0.5*kiff
 * Si skip/kiff manquants => null
 */
export function computedScore(skip, kiff, special, flou) {
  if (special) return null;
  if (skip == null || kiff == null) return null;
  return flou ? 0.35 * skip + 0.65 * kiff : 0.5 * skip + 0.5 * kiff;
}
