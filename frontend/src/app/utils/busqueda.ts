// Búsqueda con prioridad: lo que coincide por CÓDIGO va primero.
// Ej: escribir "AR" muestra primero AR16, AR17... y recién después
// un AN133 "ÁRBOL DE LA VIDA" que coincide solo por la descripción.

const normalizar = (s: string | null | undefined) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // "nácar" = "nacar"
    .toLowerCase()
    .trim();

/**
 * Qué tan bien coincide un producto con lo buscado (menor = mejor).
 * 0: el código empieza con lo buscado ("ar" → AR16), o es el número exacto ("148" → AN148)
 * 1: el código lo contiene en otra parte ("16" → AN160)
 * 2: alguna palabra de los textos empieza con lo buscado ("ros" → ROSA NACAR)
 * 3: los textos lo contienen en cualquier parte ("ar" → CIRCULAR)
 * Infinity: no coincide
 */
export function rangoBusqueda(
  termino: string,
  codigo: string | null | undefined,
  textos: (string | null | undefined)[] = [],
): number {
  const t = normalizar(termino);
  if (!t) return 0;

  const cod = normalizar(codigo);
  if (cod.startsWith(t)) return 0;
  const numCodigo = cod.match(/(\d+)$/);
  if (numCodigo && /^\d+$/.test(t) && parseInt(numCodigo[1], 10) === parseInt(t, 10)) return 0;
  if (cod.includes(t)) return 1;

  let mejor = Infinity;
  for (const texto of textos) {
    const s = normalizar(texto);
    if (!s) continue;
    if (s.split(/[\s\-\/.,()]+/).some((palabra) => palabra.startsWith(t))) mejor = Math.min(mejor, 2);
    else if (s.includes(t)) mejor = Math.min(mejor, 3);
  }
  return mejor;
}

/**
 * Filtra y ordena por relevancia. Dentro de la misma relevancia respeta
 * el orden que traía la lista (el sort de JS es estable).
 */
export function filtrarPorRelevancia<T>(
  lista: T[],
  termino: string,
  codigo: (item: T) => string | null | undefined,
  textos: (item: T) => (string | null | undefined)[],
): T[] {
  if (!normalizar(termino)) return lista;
  return lista
    .map((item) => ({ item, rango: rangoBusqueda(termino, codigo(item), textos(item)) }))
    .filter((x) => x.rango !== Infinity)
    .sort((a, b) => a.rango - b.rango)
    .map((x) => x.item);
}
