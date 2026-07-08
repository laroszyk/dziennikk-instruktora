// strapi-client.js — klient do komunikacji ze Strapi CMS
// Strapi URL pochodzi z config.js (generowanego przez build.js)
// Dokumentacja API: https://strapi-production-6bf4.up.railway.app/documentation

const strapiClient = (() => {
  // STRAPI_URL jest dostępne z config.js ładowanego przed tym skryptem
  const BASE = (typeof STRAPI_URL !== "undefined" ? STRAPI_URL : "https://strapi-production-6bf4.up.railway.app");

  // Token API — pobierz z Strapi → Settings → API Tokens i zapisz w .env.local jako STRAPI_API_TOKEN
  // Na razie działa bez tokenu (publiczne kolekcje). Dla chronionych endpointów ustaw token poniżej.
  let _token = (typeof STRAPI_API_TOKEN !== "undefined" ? STRAPI_API_TOKEN : null);

  function headers() {
    const h = { "Content-Type": "application/json" };
    if (_token) h["Authorization"] = `Bearer ${_token}`;
    return h;
  }

  /**
   * Pobierz listę wpisów z kolekcji.
   * @param {string} collection  np. "treningi", "konie", "jezdzcy"
   * @param {object} [params]    opcjonalne query params (filters, populate, pagination)
   * @returns {Promise<{data: any[], meta: object}>}
   */
  async function getMany(collection, params = {}) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "object") query.append(k, JSON.stringify(v));
      else query.append(k, v);
    }
    const qs = query.toString() ? `?${query}` : "";
    const res = await fetch(`${BASE}/api/${collection}${qs}`, { headers: headers() });
    if (!res.ok) throw new Error(`Strapi getMany ${collection}: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /**
   * Pobierz jeden wpis po ID.
   * @param {string} collection
   * @param {number|string} id
   * @param {object} [params]   np. { populate: "*" }
   */
  async function getOne(collection, id, params = {}) {
    const query = new URLSearchParams(params).toString();
    const qs = query ? `?${query}` : "";
    const res = await fetch(`${BASE}/api/${collection}/${id}${qs}`, { headers: headers() });
    if (!res.ok) throw new Error(`Strapi getOne ${collection}/${id}: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /**
   * Utwórz nowy wpis.
   * @param {string} collection
   * @param {object} data  pola wpisu (bez klucza "data" — dodajemy tu)
   */
  async function create(collection, data) {
    const res = await fetch(`${BASE}/api/${collection}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Strapi create ${collection}: ${res.status} — ${JSON.stringify(err)}`);
    }
    return res.json();
  }

  /**
   * Zaktualizuj wpis.
   * @param {string} collection
   * @param {number|string} id
   * @param {object} data
   */
  async function update(collection, id, data) {
    const res = await fetch(`${BASE}/api/${collection}/${id}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Strapi update ${collection}/${id}: ${res.status} — ${JSON.stringify(err)}`);
    }
    return res.json();
  }

  /**
   * Usuń wpis.
   * @param {string} collection
   * @param {number|string} id
   */
  async function remove(collection, id) {
    const res = await fetch(`${BASE}/api/${collection}/${id}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Strapi delete ${collection}/${id}: ${res.status} ${res.statusText}`);
    return res.json();
  }

  /**
   * Sprawdź połączenie ze Strapi (ping).
   * @returns {Promise<boolean>}
   */
  async function ping() {
    try {
      const res = await fetch(`${BASE}/api`, { headers: headers() });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { getMany, getOne, create, update, remove, ping, get baseUrl() { return BASE; } };
})();
