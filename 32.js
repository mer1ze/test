// ==MiruExtension==
// @name         Kodik
// @version      v3.2.0
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

  decodeB64(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    str = String(str).replace(/=+$/, '');
    for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++);
      ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) {
      buffer = chars.indexOf(buffer);
    }
    return output;
  }

  decodeUrl(str) {
    if (!str) return "";
    try {
      const rot13 = str.replace(/[a-zA-Z]/g, (c) =>
        String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)
      );
      return this.decodeB64(rot13);
    } catch (e) {
      try {
        return this.decodeB64(str);
      } catch (err) {
        return str;
      }
    }
  }

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
                url: `${episodes[epNum]}#shikimori_id=${id}&episode=${epNum}`,
              });
            }
          }
        } else if (release.link) {
          urlsList.push({
            name: "Фильм / OVA",
            url: `${release.link}#shikimori_id=${id}&episode=1`,
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

  parseKodikParams(html) {
    let domain = "", d_sign = "", pd = "", pd_sign = "", ref = "";

    // Поиск параметров в window.urlParams / scriptParams
    const objMatch = html.match(/(?:scriptParams|urlParams|pageParams)\s*=\s*(\{[\s\S]*?\});/);
    if (objMatch && objMatch[1]) {
      try {
        const cleanJson = objMatch[1]
          .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":')
          .replace(/'/g, '"');
        const parsed = JSON.parse(cleanJson);
        domain = parsed.domain || "";
        d_sign = parsed.d_sign || "";
        pd = parsed.pd || "";
        pd_sign = parsed.pd_sign || "";
        ref = parsed.ref || "";
      } catch (e) {}
    }

    // Резервный поиск по регуляркам (учитывая кавычки и замену пробелов)
    if (!d_sign) {
      d_sign = (html.match(/d_sign\s*[:=]\s*["']([^"']+)["']/i) || [])[1] || "";
    }
    if (!domain) {
      domain = (html.match(/domain\s*[:=]\s*["']([^"']+)["']/i) || [])[1] || "";
    }
    if (!pd) {
      pd = (html.match(/pd\s*[:=]\s*["']([^"']+)["']/i) || [])[1] || "";
    }
    if (!pd_sign) {
      pd_sign = (html.match(/pd_sign\s*[:=]\s*["']([^"']+)["']/i) || [])[1] || "";
    }

    return { domain, d_sign, pd, pd_sign, ref };
  }

  async watch(url) {
    let targetUrl = url.startsWith("//") ? `https:${url}` : url;

    // Очищаем хэш-параметры перед отправкой запроса к плееру
    const cleanPlayerUrl = targetUrl.split("#")[0];

    // Обязательные заголовки, эмитирующие переход из AnimeGO / Shikimori
    const headers = {
      "Miru-Url": cleanPlayerUrl,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
      "Referer": "https://animego.org/",
      "Sec-Fetch-Dest": "iframe",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "cross-site",
    };

    let html = await this.request("", { headers });

    if (typeof html !== "string") {
      throw new Error("Не удалось получить ответ от сервера Kodik.");
    }

    // Если плеер обёрнут во внутренний iframe вида /seria/ или /video/
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1]) {
      let iframeUrl = iframeMatch[1];
      if (iframeUrl.startsWith("//")) iframeUrl = `https:${iframeUrl}`;

      headers["Miru-Url"] = iframeUrl;
      headers["Referer"] = cleanPlayerUrl;
      
      html = await this.request("", { headers });
      targetUrl = iframeUrl;
    }

    const parsed = this.parseKodikParams(html);

    if (!parsed.d_sign) {
      throw new Error("Kodik заблокировал проигрывание (ошибка подписи d_sign). Попробуйте сменить IP / VPN.");
    }

    if (!parsed.domain) {
      parsed.domain = new URL(targetUrl).hostname;
    }

    const postBody = `domain=${encodeURIComponent(parsed.domain)}&d_sign=${encodeURIComponent(parsed.d_sign)}&pd=${encodeURIComponent(parsed.pd)}&pd_sign=${encodeURIComponent(parsed.pd_sign)}&ref=${encodeURIComponent(parsed.ref)}&bad_user=false&type=video`;

    const gtaRes = await this.request("", {
      method: "POST",
      headers: {
        "Miru-Url": `https://${parsed.domain}/gta`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": targetUrl,
        "User-Agent": headers["User-Agent"],
        "X-Requested-With": "XMLHttpRequest",
      },
      data: postBody,
    });

    if (!gtaRes || !gtaRes.links) {
      throw new Error("Не удалось извлечь потоковые ссылки из /gta");
    }

    const qualities = Object.keys(gtaRes.links);
    const bestQuality = qualities[qualities.length - 1];
    const rawSrc = gtaRes.links[bestQuality][0].src;

    let streamUrl = this.decodeUrl(rawSrc);
    if (streamUrl.startsWith("//")) {
      streamUrl = `https:${streamUrl}`;
    }

    return {
      type: "hls",
      url: streamUrl,
    };
  }
}
