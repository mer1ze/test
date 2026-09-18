// ==MiruExtension==
// @name         Kodik
// @version      v3.4.2
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
  kodikToken = "57359f483cd12969e0483bb3e1f260c6";[cite: 23]
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
    
    try {
      kodikRes = await this.request("", {
        headers: {
          "Miru-Url": `https://kodik-api.com/search?token=${this.kodikToken}&shikimori_id=${id}&with_episodes=true`,[cite: 23]
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });
    } catch (e) {}

    if (kodikRes && kodikRes.results && kodikRes.results.length > 0) {
      for (const release of kodikRes.results) {
        const translationName = release.translation ? release.translation.title : "Озвучка";
        const urlsList = [];

        if (release.seasons) {
          for (const seasonNum in release.seasons) {
            const seasonData = release.seasons[seasonNum];
            const episodes = seasonData.episodes || seasonData;

            if (typeof episodes === "object") {
              for (const epNum in episodes) {
                const epVal = episodes[epNum];
                const epUrl = typeof epVal === "string" ? epVal : (epVal.link || release.link);
                urlsList.push({
                  name: `Серия ${epNum}`,
                  url: `${epUrl}|${id}|${epNum}`,
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
      const rot13 = url.replace(/[a-zA-Z]/g, (c) =>
        String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)
      );
      return atob(rot13);
    } catch (e) {
      return url;
    }
  }

  async watch(urlStr) {
    const parts = urlStr.split("|");
    const rawUrl = parts[0];
    let cleanUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;

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

    const dSignMatch = html.match(/d_sign["']?\s*[:=]\s*["']([^"']+)["']/);[cite: 22]
    const pdSignMatch = html.match(/pd_sign["']?\s*[:=]\s*["']([^"']+)["']/);[cite: 22]
    const refSignMatch = html.match(/ref_sign["']?\s*[:=]\s*["']([^"']+)["']/);[cite: 22]
    const typeMatch = html.match(/videoInfo\.type\s*=\s*["']([^"']+)["']/);[cite: 22]
    const hashMatch = html.match(/videoInfo\.hash\s*=\s*["']([^"']+)["']/);[cite: 22]
    const idMatch = html.match(/videoInfo\.id\s*=\s*["']([^"']+)["']/);[cite: 22]

    if (!dSignMatch || !hashMatch || !idMatch) {
      throw new Error("Не удалось спарсить параметры видео из фрейма");
    }

    const domain = "kodikplayer.com";[cite: 22]
    const postData = new URLSearchParams({
      d: domain,[cite: 22]
      d_sign: dSignMatch[1],[cite: 22]
      pd: domain,[cite: 22]
      pd_sign: pdSignMatch ? pdSignMatch[1] : "",[cite: 22]
      ref: "",[cite: 22]
      ref_sign: refSignMatch ? refSignMatch[1] : "",[cite: 22]
      bad_user: "false",[cite: 22]
      cdn_is_working: "true",[cite: 22]
      type: typeMatch ? typeMatch[1] : "seria",[cite: 22]
      hash: hashMatch[1],[cite: 22]
      id: idMatch[1],[cite: 22]
      info: "{}"[cite: 22]
    }).toString();

    const ftorRes = await this.request("", {
      method: "POST",
      headers: {
        "Miru-Url": `https://${domain}/ftor`,[cite: 22]
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",[cite: 22]
        "Referer": cleanUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",[cite: 22]
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

    throw new Error("Не удалось получить поток от Kodik /ftor");
  }
}
