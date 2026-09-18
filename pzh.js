// ==MiruExtension==
// @name         Kodik
// @version      v3.7.3
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
        ...options.headers,
      },
      method: options.method || "GET",
      data: options.data,
    });
  }

  async latest(page) {
    const res = await this.fetchApi(`${this.shikimoriDomain}/api/animes?page=${page}&limit=24&order=ranked`);
    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `${this.shikimoriDomain}${item.image.original}` : "",
    }));
  }

  async search(kw, page) {
    const res = await this.fetchApi(`${this.shikimoriDomain}/api/animes?search=${encodeURIComponent(kw)}&page=${page}&limit=24`);
    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `${this.shikimoriDomain}${item.image.original}` : "",
      desc: `Рейтинг: ${item.score || 'N/A'}`,
    }));
  }

  async detail(id) {
    const anime = await this.fetchApi(`${this.shikimoriDomain}/api/animes/${id}`);

    if (!anime || !anime.id) {
      throw new Error("Не удалось загрузить данные Shikimori");
    }

    const episodesGroups = [];
    let kodikRes = null;

    try {
      kodikRes = await this.fetchApi(`https://kodik-api.com/search?token=${this.kodikToken}&shikimori_id=${id}&with_episodes=true`);
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
                const epVal = episodes[epKey];
                const epLink = typeof epVal === "string" ? epVal : (epVal.link || release.link);
                urlsList.push({
                  name: `Серия ${epKey}`,
                  url: `${epLink}|${id}|${epKey}`,
                });
              }
            }
          }
        } else if (release.last_episode && release.link) {
          for (let i = 1; i <= release.last_episode; i++) {
            urlsList.push({
              name: `Серия ${i}`,
              url: `${release.link}|${id}|${i}`,
            });
          }
        } else if (release.link) {
          urlsList.push({
            name: "Фильм / OVA",
            url: `${release.link}|${id}|1`,
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
      cover: anime.image?.original ? `${this.shikimoriDomain}${anime.image.original}` : "",
      desc: anime.description || "Описание отсутствует.",
      episodes: episodesGroups,
    };
  }

  decodeUrl(url) {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//")) {
      return url;
    }
    try {
      const decodedBase64 = atob(url);
      return decodedBase64.replace(/[a-zA-Z]/g, (c) =>
        String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)
      );
    } catch (e) {
      try {
        const rot13 = url.replace(/[a-zA-Z]/g, (c) =>
          String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)
        );
        return atob(rot13);
      } catch (err) {
        return url;
      }
    }
  }

  async watch(urlStr) {
    const parts = urlStr.split("|");
    const shikimoriId = parts[1];
    const episodeNum = parts[2] || "1";

    if (!shikimoriId) {
      throw new Error("Не удалось определить ID релиза для получения потока");
    }

    // Запрашиваем официальное API Кодика, которое отдает прямые ссылки на потоки без защиты /ftor
    const apiRes = await this.fetchApi(`https://kodik-api.com/search?token=${this.kodikToken}&shikimori_id=${shikimoriId}&with_episodes=true`);
    
    if (!apiRes || !apiRes.results || apiRes.results.length === 0) {
      throw new Error("Не удалось найти потоки через API Кодика");
    }

    // Ищем нужную серию в результатах
    for (const release of apiRes.results) {
      let streamUrl = "";

      if (release.seasons) {
        for (const sKey of Object.keys(release.seasons)) {
          const season = release.seasons[sKey];
          const episodes = season.episodes || season;
          if (episodes[episodeNum]) {
            const epData = episodes[episodeNum];
            streamUrl = typeof epData === "string" ? epData : epData.link;
          }
        }
      }

      if (streamUrl) {
        if (streamUrl.startsWith("//")) {
          streamUrl = `https:${streamUrl}`;
        }
        return {
          type: "hls",
          url: streamUrl,
        };
      }
    }

    throw new Error("Указанная серия не найдена в базе потоков");
  }
}
