// ==MiruExtension==
// @name         Kodik
// @version      v3.8.0
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
    const cleanId = String(id).replace(this.shikimoriDomain, "").replace(/\/api\/animes\//g, "").trim();
    const requestUrl = `${this.shikimoriDomain}/api/animes/${cleanId}`;
    
    const anime = await this.fetchApi(requestUrl);

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
                const epVal = episodes[epKey];
                // Сохраняем в url не мусорную ссылку iframe, а данные для API: id и номер серии
                urlsList.push({
                  name: `Серия ${epKey}`,
                  url: `${cleanId}_${epKey}_${release.id || ''}`,
                });
              }
            }
          }
        } else if (release.last_episode) {
          for (let i = 1; i <= release.last_episode; i++) {
            urlsList.push({
              name: `Серия ${i}`,
              url: `${cleanId}_${i}_${release.id || ''}`,
            });
          }
        } else {
          urlsList.push({
            name: "Фильм / OVA",
            url: `${cleanId}_1_${release.id || ''}`,
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

  async watch(urlStr) {
    // Парсим наш кастомный идентификатор серии: shikimoriId_epNumber_releaseId
    const parts = urlStr.split("_");
    const shikimoriId = parts[0];
    const episodeNum = parts[1];
    const releaseId = parts[2];

    if (!shikimoriId || !episodeNum) {
      throw new Error("Неверный формат данных серии");
    }

    try {
      // Запрашиваем актуальные данные из API коддика по этому аниме
      const apiRes = await this.fetchApi(`https://kodik-api.com/search?token=${this.kodikToken}&shikimori_id=${shikimoriId}&with_episodes=true`);
      
      if (apiRes && apiRes.results && apiRes.results.length > 0) {
        // Ищем нужный релиз (озвучку)
        let release = apiRes.results.find(r => r.id === releaseId) || apiRes.results[0];

        // Достаем ссылку на серию из структуры API
        if (release.seasons) {
          for (const sKey in release.seasons) {
            const season = release.seasons[sKey];
            const eps = season.episodes || season;
            if (eps && eps[episodeNum]) {
              const epData = eps[episodeNum];
              let directLink = typeof epData === "string" ? epData : epData.link;
              if (directLink) {
                if (directLink.startsWith("//")) directLink = `https:${directLink}`;
                
                // Если API отдает прямую ссылку на видео или hls, возвращаем её
                return {
                  type: "hls",
                  url: directLink,
                };
              }
            }
          }
        }
        
        // Запасной вариант через link релиза
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

    throw new Error("Не удалось получить прямую ссылку через API Kodik");
  }
}
