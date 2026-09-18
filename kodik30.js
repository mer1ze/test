// ==MiruExtension==
// @name         Kodik
// @version      v3.0.0
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

    if (episodesGroups.length === 0) {
      const totalEp = anime.episodes || anime.episodes_aired || 12;
      const urlsList = [];
      for (let i = 1; i <= totalEp; i++) {
        urlsList.push({
          name: `Серия ${i}`,
          url: `https://kodikplayer.com/find-player?shikimori_id=${id}&episode=${i}`,
        });
      }
      episodesGroups.push({
        title: "Kodik Player (Прямой)",
        urls: urlsList,
      });
    }

    return {
      title: anime.russian || anime.name,
      cover: anime.image?.original ? `${this.shikimoriDomain}${anime.image.original}` : "",
      desc: anime.description || "Описание отсутствует.",
      episodes: episodesGroups,
    };
  }

  extractParams(html) {
    let domain = "", d_sign = "", pd = "", pd_sign = "", ref = "";

    const paramsMatch = html.match(/(?:scriptParams|urlParams)\s*=\s*(\{[\s\S]*?\});/);
    if (paramsMatch && paramsMatch[1]) {
      try {
        const rawJson = paramsMatch[1]
          .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":')
          .replace(/'/g, '"');
        const params = JSON.parse(rawJson);
        domain = params.domain || "";
        d_sign = params.d_sign || "";
        pd = params.pd || "";
        pd_sign = params.pd_sign || "";
        ref = params.ref || "";
      } catch (e) {}
    }

    if (!d_sign) {
      d_sign = (html.match(/d_sign\s*[:=]\s*["']([^"']+)["']/i) || [])[1];
    }
    if (!domain) {
      domain = (html.match(/domain\s*[:=]\s*["']([^"']+)["']/i) || [])[1];
    }
    if (!pd) {
      pd = (html.match(/pd\s*[:=]\s*["']([^"']+)["']/i) || [])[1] || "";
    }
    if (!pd_sign) {
      pd_sign = (html.match(/pd_sign\s*[:=]\s*["']([^"']+)["']/i) || [])[1] || "";
    }
    if (!ref) {
      ref = (html.match(/ref\s*[:=]\s*["']([^"']+)["']/i) || [])[1] || "";
    }

    return { domain, d_sign, pd, pd_sign, ref };
  }

  async watch(url) {
    let targetUrls = [url.startsWith("//") ? `https:${url}` : url];

    // Извлекаем shikimori_id и episode для запасных зеркал
    const shikiIdMatch = url.match(/shikimori_id=(\d+)/);
    const epMatch = url.match(/episode=(\d+)/);
    if (shikiIdMatch) {
      const shikiId = shikiIdMatch[1];
      const ep = epMatch ? epMatch[1] : "1";
      
      // Запасные домены на случай заблокированного основного CDN
      targetUrls.push(`https://kodikplayer.com/find-player?shikimori_id=${shikiId}&episode=${ep}`);
      targetUrls.push(`https://aniqit.com/find-player?shikimori_id=${shikiId}&episode=${ep}`);
    }

    let extracted = null;
    let currentPlayerUrl = "";

    for (const pUrl of targetUrls) {
      try {
        currentPlayerUrl = pUrl;
        let resHtml = await this.request("", {
          headers: {
            "Miru-Url": pUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": `${this.shikimoriDomain}/`,
          },
        });

        if (typeof resHtml !== "string") continue;

        // Попытка перейти во фрейм, если отдана обёртка
        const iframeMatch = resHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch && iframeMatch[1] && !iframeMatch[1].includes("shikimori_id=")) {
          let iframeUrl = iframeMatch[1];
          if (iframeUrl.startsWith("//")) iframeUrl = `https:${iframeUrl}`;
          currentPlayerUrl = iframeUrl;

          resHtml = await this.request("", {
            headers: {
              "Miru-Url": currentPlayerUrl,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Referer": `${this.shikimoriDomain}/`,
            },
          });
        }

        const parsed = this.extractParams(resHtml);
        if (parsed.d_sign) {
          if (!parsed.domain) {
            parsed.domain = new URL(currentPlayerUrl).hostname;
          }
          extracted = parsed;
          break;
        }
      } catch (e) {}
    }

    if (!extracted || !extracted.d_sign) {
      throw new Error("Kodik заблокировал релиз или изменил алгоритм. Попробуйте включить VPN.");
    }

    const { domain, d_sign, pd, pd_sign, ref } = extracted;
    const postBody = `domain=${encodeURIComponent(domain)}&d_sign=${encodeURIComponent(d_sign)}&pd=${encodeURIComponent(pd)}&pd_sign=${encodeURIComponent(pd_sign)}&ref=${encodeURIComponent(ref)}&bad_user=false&type=video`;

    const gtaRes = await this.request("", {
      method: "POST",
      headers: {
        "Miru-Url": `https://${domain}/gta`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": currentPlayerUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
      data: postBody,
    });

    if (!gtaRes || !gtaRes.links) {
      throw new Error("Не удалось получить видеопоток от Kodik");
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
