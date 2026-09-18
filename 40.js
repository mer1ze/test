// ==MiruExtension==
// @name         Kodik
// @version      v3.3.0
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
  kodikToken = "q8p5vnf9crt7xfyzke4iwc6r5rvsurv7";
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

  async watch(urlStr) {
    const parts = urlStr.split("|");
    const rawUrl = parts[0];
    const shikiId = parts[1];
    const ep = parts[2] || "1";

    let cleanUrl = rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;

    // Прямой запрос к обходному шлюзу
    const gateways = [
      `https://kodik.biz/find-player?shikimori_id=${shikiId}&episode=${ep}`,
      cleanUrl
    ];

    for (const gate of gateways) {
      try {
        const html = await this.request("", {
          headers: {
            "Miru-Url": gate,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://animego.org/",
          },
        });

        if (typeof html !== "string") continue;

        // Поиск прямой HLS ссылки в разметке плеере
        const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
        if (m3u8Match) {
          return {
            type: "hls",
            url: m3u8Match[0],
          };
        }

        // Поиск параметров gta
        const dSignMatch = html.match(/d_sign["']?\s*[:=]\s*["']([^"']+)["']/);
        const domainMatch = html.match(/domain["']?\s*[:=]\s*["']([^"']+)["']/);
        const pdMatch = html.match(/pd["']?\s*[:=]\s*["']([^"']+)["']/);
        const pdSignMatch = html.match(/pd_sign["']?\s*[:=]\s*["']([^"']+)["']/);

        if (dSignMatch && dSignMatch[1]) {
          const domain = domainMatch ? domainMatch[1] : new URL(gate).hostname;
          const postBody = `domain=${encodeURIComponent(domain)}&d_sign=${encodeURIComponent(dSignMatch[1])}&pd=${encodeURIComponent(pdMatch ? pdMatch[1] : "")}&pd_sign=${encodeURIComponent(pdSignMatch ? pdSignMatch[1] : "")}&ref=&bad_user=false&type=video`;

          const gtaRes = await this.request("", {
            method: "POST",
            headers: {
              "Miru-Url": `https://${domain}/gta`,
              "Content-Type": "application/x-www-form-urlencoded",
              "Referer": gate,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "X-Requested-With": "XMLHttpRequest",
            },
            data: postBody,
          });

          if (gtaRes && gtaRes.links) {
            const qualities = Object.keys(gtaRes.links);
            const best = qualities[qualities.length - 1];
            let streamUrl = gtaRes.links[best][0].src;
            if (streamUrl.startsWith("//")) streamUrl = `https:${streamUrl}`;

            return {
              type: "hls",
              url: streamUrl,
            };
          }
        }
      } catch (e) {}
    }

    throw new Error("Kodik заблокировал провайдера. Включите прокси/VPN на устройстве или серверной стороне.");
  }
}
