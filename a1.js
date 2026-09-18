// ==MiruExtension==
// @name         Kodik
// @version      v3.7.6
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
    // Безопасный запрос списка популярных
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
    // Безопасный поисковый запрос
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
    // Жёстко формируем чистый URL без возможности задвоить ID
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
                const epLink = typeof epVal === "string" ? epVal : (epVal.link || release.link);
                urlsList.push({
                  name: `Серия ${epKey}`,
                  url: `${epLink}|${cleanId}|${epKey}`,
                });
              }
            }
          }
        } else if (release.last_episode && release.link) {
          for (let i = 1; i <= release.last_episode; i++) {
            urlsList.push({
              name: `Серия ${i}`,
              url: `${release.link}|${cleanId}|${i}`,
            });
          }
        } else if (release.link) {
          urlsList.push({
            name: "Фильм / OVA",
            url: `${release.link}|${cleanId}|1`,
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

  decodeKodikLink(url) {
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
    let rawUrl = parts[0];

    if (!rawUrl) {
      throw new Error("Не указана ссылка на видео");
    }

    if (rawUrl.startsWith("//")) {
      rawUrl = `https:${rawUrl}`;
    }

    try {
      const html = await this.fetchApi(rawUrl, {
        headers: {
          "Referer": "https://shikimori.io/",
        }
      });

      const matchLink = html.match(/url:\s*'([^']+)'/) || html.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
      
      let videoUrl = "";
      if (matchLink) {
        let extracted = matchLink[1] || matchLink[0];
        if (!extracted.startsWith("http")) {
          videoUrl = this.decodeKodikLink(extracted);
        } else {
          videoUrl = extracted;
        }
      }

      if (!videoUrl) {
        const allM3u8 = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>*/]*/g);
        if (allM3u8 && allM3u8.length > 0) {
          videoUrl = allM3u8[0];
        }
      }

      if (videoUrl) {
        if (videoUrl.startsWith("//")) {
          videoUrl = `https:${videoUrl}`;
        }
        return {
          type: "hls",
          url: videoUrl,
        };
      }
    } catch (e) {}

    return {
      type: "hls",
      url: rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl,
    };
  }
}
