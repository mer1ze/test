// ==MiruExtension==
// @name         Kodik
// @version      v3.6.0
// @author       User
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
    const rawUrl = parts[0];
    let cleanUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;

    const html = await this.fetchApi(cleanUrl, {
      headers: {
        "Referer": "https://kodikplayer.com/",
      },
    });

    if (typeof html !== "string") {
      throw new Error("Не удалось получить страницу фрейма Kodik");
    }

    const extract = (regex) => {
      const match = html.match(regex);
      return match ? match[1] : "";
    };

    let urlParamsJson = {};
    const urlParamsMatch = html.match(/var\s+urlParams\s*=\s*['"]({.*})['"]/i);
    if (urlParamsMatch) {
      try {
        urlParamsJson = JSON.parse(urlParamsMatch[1]);
      } catch (e) {}
    }

    // Для прямого запроса используем стандартный домен плеера
    const domain = "kodikplayer.com";
    const dSign = urlParamsJson.d_sign || extract(/d_sign["']?\s*[:=]\s*["']([^"']+)["']/i);
    const refSign = urlParamsJson.ref_sign || extract(/ref_sign["']?\s*[:=]\s*["']([^"']+)["']/i);

    let videoHash = extract(/vInfo\.hash\s*=\s*["']([^"']+)["']/i) || extract(/hash\s*=\s*["']([^"']+)["']/i);
    let videoId = extract(/vInfo\.id\s*=\s*["']([^"']+)["']/i) || extract(/var\s+videoId\s*=\s*["']([^"']+)["']/i);

    if (!videoHash || !videoId) {
      const urlMatch = cleanUrl.match(/\/(?:seria|video)\/(\d+)\/([a-f0-9]+)/i);
      if (urlMatch) {
        videoId = videoId || urlMatch[1];
        videoHash = videoHash || urlMatch[2];
      }
    }

    if (!dSign || !videoHash || !videoId) {
      throw new Error(`Не удалось спарсить параметры видео. Hash: ${videoHash}, ID: ${videoId}`);
    }

    // Прямой вариант payload (как на втором скриншоте)
    const postDataObj = {
      d: domain,
      d_sign: dSign,
      pd: domain,
      pd_sign: dSign, // При прямом запросе pd_sign полностью равен d_sign
      ref: "",
      ref_sign: refSign || "",
      bad_user: "false",
      cdn_is_working: "true",
      type: "seria",
      hash: videoHash,
      id: videoId,
      info: "{}"
    };

    const postData = Object.keys(postDataObj)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(postDataObj[key])}`)
      .join("&");

    const ftorRes = await this.fetchApi(`https://${domain}/ftor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": cleanUrl,
        "X-Requested-With": "XMLHttpRequest",
      },
      data: postData,
    });

    if (ftorRes && ftorRes.links) {
      const qualities = Object.keys(ftorRes.links);
      const bestQuality = qualities[qualities.length - 1];
      const linkObj = ftorRes.links[bestQuality][0];
      
      let streamUrl = this.decodeUrl(linkObj.src);
      if (streamUrl.startsWith("//")) {
        streamUrl = `https:${streamUrl}`;
      }

      return {
        type: "hls",
        url: streamUrl,
      };
    }

    throw new Error("Не удалось получить поток от Kodik /ftor (прямой запрос)");
  }
}
