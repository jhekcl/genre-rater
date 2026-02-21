import { openDB } from "idb";

export const dbPromise = openDB("genre-rater", 1, {
  upgrade(db) {
    db.createObjectStore("ratings", { keyPath: "genreId" }); // 1 note par genre
    db.createObjectStore("meta"); // idx, etc.
  },
});

export async function getRating(genreId) {
  return (await dbPromise).get("ratings", genreId);
}

export async function setRating(rating) {
  return (await dbPromise).put("ratings", rating);
}

export async function getAllRatings() {
  return (await dbPromise).getAll("ratings");
}

export async function clearAllRatings() {
  return (await dbPromise).clear("ratings");
}

export async function getMeta(key) {
  return (await dbPromise).get("meta", key);
}

export async function setMeta(key, value) {
  return (await dbPromise).put("meta", value, key);
}

/** Export JSON (backup) */
export async function exportData() {
  const ratings = await getAllRatings();
  const idx = (await getMeta("idx")) ?? 0;
  return { version: 1, exportedAt: new Date().toISOString(), idx, ratings };
}

/** Import JSON (restore) */
export async function importData(data) {
  if (!data || typeof data !== "object") throw new Error("Fichier invalide");
  if (!Array.isArray(data.ratings)) throw new Error("ratings manquant");

  // on remplace tout
  await clearAllRatings();
  const db = await dbPromise;
  for (const r of data.ratings) {
    if (typeof r?.genreId !== "number") continue;
    await db.put("ratings", r);
  }
  if (typeof data.idx === "number") {
    await db.put("meta", data.idx, "idx");
  }
}
