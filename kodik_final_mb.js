// ==MiruExtension==
// @name         Kodik
// @version      v3.4.0
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
  // Свежий токен из перехваченных запросов
  kodikToken = "57359f483cd12969e0483bb3e1f260c6";
  shikimoriDomain = "https://shikimori.io";

  async latest(page) {
    const res = await this.request("", {
      headers: {
        "Miru-Url": `${this.shikimoriDomain}/api/animes?page=${page}&limit=24&order=ranked`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `${this.shikimoriDomain}${item.image.original}` : "",
    }));
  }

  async search(kw, page) {
    const res = await this.request("", {
      headers: {
        "Miru-Url": `${this.shikimoriDomain}/api/animes?search=${encodeURIComponent(kw)}&page=${page}&limit=24`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `${this.shikimoriDomain}${item.image.original}` : "",
      desc: `Рейтинг: ${item.score || 'N/A'}`,
    }));
  }

  async detail(id) {
    const anime = await this.request("", {
      headers: {
        "Miru-Url": `${this.shikimoriDomain}/api/animes/${id}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    if (!anime) {
      throw new Error("Не удалось загрузить данные Shikimori");
    }

    const episodesGroups = [];
    let kodikRes = null;
    const apiDomains = ["kodik-api.com", "kodik.info"];
    
    for (const domain of apiDomains) {
      try {
        kodikRes = await this.request("", {
          headers: {
            "Miru-Url": `https://${domain}/v2/search?shikimori_id=${id}&token=${this.kodikToken}&with_episodes=true`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        });
        if (kodikRes && kodikRes.results && kodikRes.results.length > 0) break;
      } catch (e) {}
    }

    if (kodikRes && kodikRes.results && kodikRes.results.length > 0) {
      for (const release of kodikRes.results) {
        const translationName = release.translation ? release.translation.title : "Озвучка";
        const urlsList = [];

        if (release.seasons) {
          for (const seasonNum in release.seasons) {
            const episodes = release.seasons[seasonNum].episodes;
            for (const epNum in episodes) {
              urlsList.push({
                name: `Серия ${epNum}`,
                url: `${episodes[epNum]}|${id}|${epNum}`,
              });
            }
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

  // Декодер зашифрованных ссылок Kodik (ROT13 + Base64)
  decodeUrl(url) {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//")) {
      return url;
    }
    try {
      const rot13 = url.replace(/[a-zA-Z]/g, (c) =>
        String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)
      );
      const decoded = atob(rot13);
      return decoded;
    } catch (e) {
      return url;
    }
  }

  async watch(urlStr) {
    const parts = urlStr.split("|");
    const rawUrl = parts[0];
    let cleanUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;

    // 1. Получаем HTML страницу фрейма серии
    const html = await this.request("", {
      headers: {
        "Miru-Url": cleanUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
        "Referer": "https://animego.me/",
      },
    });

    if (typeof html !== "string") {
      throw new Error("Не удалось получить страницу фрейма Kodik");
    }

    // 2. Парсим подписи и параметры из HTML
    const dSignMatch = html.match(/d_sign["']?\s*[:=]\s*["']([^"']+)["']/);
    const pdSignMatch = html.match(/pd_sign["']?\s*[:=]\s*["']([^"']+)["']/);
    const refSignMatch = html.match(/ref_sign["']?\s*[:=]\s*["']([^"']+)["']/);
    const typeMatch = html.match(/videoInfo\.type\s*=\s*["']([^"']+)["']/);
    const hashMatch = html.match(/videoInfo\.hash\s*=\s*["']([^"']+)["']/);
    const idMatch = html.match(/videoInfo\.id\s*=\s*["']([^"']+)["']/);

    if (!dSignMatch || !hashMatch || !idMatch) {
      throw new Error("Не удалось спарсить параметры видео из фрейма");
    }

    // 3. Собираем Form Data для POST /ftor
    const domain = "kodikplayer.com";
    const postData = new URLSearchParams({
      d: domain,
      d_sign: dSignMatch[1],
      pd: domain,
      pd_sign: pdSignMatch ? pdSignMatch[1] : "",
      ref: "",
      ref_sign: refSignMatch ? refSignMatch[1] : "",
      bad_user: "false",
      cdn_is_working: "true",
      type: typeMatch ? typeMatch[1] : "seria",
      hash: hashMatch[1],
      id: idMatch[1],
      info: "{}"
    }).toString();

    // 4. Отправляем POST запрос на /ftor
    const ftorRes = await this.request("", {
      method: "POST",
      headers: {
        "Miru-Url": `https://${domain}/ftor`,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": cleanUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
      data: postData,
    });

    // 5. Разбираем ответ и достаем наивысшее качество
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

    throw new Error("Не удалось получить поток от Kodik /ftor");
  }
}
