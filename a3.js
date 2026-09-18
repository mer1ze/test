// ==MiruExtension==
// @name         Kodik
// @version      v3.9.1
// @author       mer1ze
// @lang         ru
// @license      MIT
// @icon         https://kodikplayer.com/favicon.ico
// @package      kodik.ru
// @type         bangumi
// @webSite      https://shikimori.io
// @nsfw         false
// ==/MiruExtension==

export default class extends Extension {
  kodikToken = "57359f483cd12969e0483bb3e1f260c6";
  shikimoriDomain = "https://shikimori.io";

  async fetchApi(url, options = {}) {
    return await this.request(url, {
      headers: {
        "Miru-Url": url,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...options.headers,
      },
      method: options.method || "GET",
      data: options.data,
    });
  }

  async latest(page) {
    const url = `${this.shikimoriDomain}/api/animes?page=${page}&limit=24&order=ranked`;
    const res = await this.fetchApi(url);
    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `${this.shikimoriDomain}${item.image.original}` : "",
    }));
  }

  async search(kw, page) {
    const url = `${this.shikimoriDomain}/api/animes?search=${encodeURIComponent(kw)}&page=${page}&limit=24`;
    const res = await this.fetchApi(url);
    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `${this.shikimoriDomain}${item.image.original}` : "",
      desc: `Рейтинг: ${item.score || 'N/A'}`,
    }));
  }

  async detail(id) {
    // Надежно извлекаем только числовой ID, отсекая любые возможные старые хвосты
    const cleanId = String(id).replace(/[^0-9]/g, "");
    
    // Формируем строгий абсолютный URL для запроса к Shikimori
    const animeUrl = `https://shikimori.io/api/animes/${cleanId}`;
    const anime = await this.fetchApi(animeUrl);

    if (!anime || !anime.id) {
      throw new Error("Не удалось загрузить данные Shikimori");
    }

    const episodesGroups = [];
    let kodikRes = null;

    try {
      kodikRes = await this.fetchApi(`https://kodik-api.com/search?token=${this.kodikToken}&shikimori_id=${cleanId}&with_episodes=true`);
    } catch (e) {}

    if (kodikRes && kodikRes.results && kodikRes.results.length > 0) {
      for (const release of kodikRes.results) {
        const translationName = release.translation ? release.translation.title : "Озвучка";
        const urlsList = [];

        if (release.seasons) {
          const seasonKeys = Object.keys(release.seasons);
          for (const sKey of seasonKeys) {
            const season = release.seasons[sKey];
            const episodes = season.episodes || season;
            if (episodes && typeof episodes === "object") {
              const epKeys = Object.keys(episodes);
              for (const epKey of epKeys) {
                // Передаем служебный токен, чтобы Miru не пытался интерпретировать его как сайт
                urlsList.push({
                  name: `Серия ${epKey}`,
                  url: `KODIK_API|${cleanId}|${epKey}|${release.id || ''}`,
                });
              }
            }
          }
        } else if (release.last_episode) {
          for (let i = 1; i <= release.last_episode; i++) {
            urlsList.push({
              name: `Серия ${i}`,
              url: `KODIK_API|${cleanId}|${i}|${release.id || ''}`,
            });
          }
        } else {
          urlsList.push({
            name: "Фильм / OVA",
            url: `KODIK_API|${cleanId}|1|${release.id || ''}`,
          });
        }

        if (urlsList.length > 0) {
          episodesGroups.push({
            title: translationName,
            urls: urlsList,
          });
        }
      }
    }

    return {
      title: anime.russian || anime.name,
      cover: anime.image?.original ? `https://shikimori.io${anime.image.original}` : "",
      desc: anime.description || "Описание отсутствует.",
      episodes: episodesGroups,
    };
  }

  async watch(urlStr) {
    if (!urlStr || !urlStr.startsWith("KODIK_API")) {
      throw new Error("Неверный формат ссылки серии");
    }

    const parts = urlStr.split("|");
    const shikimoriId = parts[1];
    const episodeNum = parts[2];
    const releaseId = parts[3];

    try {
      const apiRes = await this.fetchApi(`https://kodik-api.com/search?token=${this.kodikToken}&shikimori_id=${shikimoriId}&with_episodes=true`);
      
      if (apiRes && apiRes.results && apiRes.results.length > 0) {
        let release = apiRes.results.find(r => r.id === releaseId) || apiRes.results[0];

        if (release.seasons) {
          for (const sKey in release.seasons) {
            const season = release.seasons[sKey];
            const eps = season.episodes || season;
            if (eps && eps[episodeNum]) {
              const epData = eps[episodeNum];
              let directLink = typeof epData === "string" ? epData : epData.link;
              if (directLink) {
                if (directLink.startsWith("//")) directLink = `https:${directLink}`;
                return {
                  type: "hls",
                  url: directLink,
                };
              }
            }
          }
        }
        
        if (release.link) {
          let fallbackLink = release.link;
          if (fallbackLink.startsWith("//")) fallbackLink = `https:${fallbackLink}`;
          return {
            type: "hls",
            url: fallbackLink,
          };
        }
      }
    } catch (e) {}

    throw new Error("Не удалось получить поток из API Kodik");
  }
}
