// ==MiruExtension==
// @name         Kodik
// @version      v1.9.0
// @author       User
// @lang         ru
// @license      MIT
// @icon         https://kodikplayer.com/favicon.ico
// @package      kodik.ru
// @type         bangumi
// @webSite      https://shikimori.one
// @nsfw         false
// ==/MiruExtension==

export default class extends Extension {
  kodikToken = "q8p5vnf9crt7xfyzke4iwc6r5rvsurv7";

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
    // Расшифровка ROT13 + Base64, используемая в Kodik
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

  // Главная страница: каталог Shikimori
  async latest(page) {
    const res = await this.request(`/api/animes?page=${page}&limit=24&order=ranked`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `https://shikimori.one${item.image.original}` : "",
    }));
  }

  // Поиск
  async search(kw, page) {
    const res = await this.request(`/api/animes?search=${encodeURIComponent(kw)}&page=${page}&limit=24`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `https://shikimori.one${item.image.original}` : "",
      desc: `Рейтинг: ${item.score || 'N/A'}`,
    }));
  }

  // Детализация аниме
  async detail(id) {
    const anime = await this.request(`/api/animes/${id}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const episodesGroups = [];

    // Запрос к API Kodik
    let kodikRes = null;
    const apiDomains = ["kodikapi.com", "kodik-api.com", "kodik.info"];
    
    for (const domain of apiDomains) {
      try {
        kodikRes = await this.request("", {
          headers: {
            "Miru-Url": `https://${domain}/v2/search?shikimori_id=${id}&token=${this.kodikToken}&with_episodes=true`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        });
        if (kodikRes && kodikRes.results) break;
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
                url: episodes[epNum],
              });
            }
          }
        } else if (release.link) {
          urlsList.push({
            name: "Фильм / OVA",
            url: release.link,
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

    // Резервная генерация серий, если API заблокирован
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
        title: "Kodik Player",
        urls: urlsList,
      });
    }

    return {
      title: anime.russian || anime.name,
      cover: anime.image?.original ? `https://shikimori.one${item.image.original}` : "",
      desc: anime.description || "Описание отсутствует.",
      episodes: episodesGroups,
    };
  }

  // Получение видеопотока
  async watch(url) {
    let playerUrl = url.startsWith("//") ? `https:${url}` : url;
    
    playerUrl = playerUrl
      .replace("kodik.cc", "kodikplayer.com")
      .replace("kodik.info", "kodikplayer.com")
      .replace("kodik.biz", "kodikplayer.com")
      .replace("aniqit.com", "kodikplayer.com");

    const resHtml = await this.request("", {
      headers: {
        "Miru-Url": playerUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://shikimori.one/",
      },
    });

    if (typeof resHtml !== "string") {
      throw new Error("Не удалось загрузить плеер");
    }

    // Парсим параметры для обращения к API /gta
    const domain = (resHtml.match(/var domain = "(.+?)";/) || [])[1];
    const d_sign = (resHtml.match(/var d_sign = "(.+?)";/) || [])[1];
    const pd = (resHtml.match(/var pd = "(.+?)";/) || [])[1] || "";
    const pd_sign = (resHtml.match(/var pd_sign = "(.+?)";/) || [])[1] || "";
    const ref = (resHtml.match(/var ref = "(.+?)";/) || [])[1] || "";

    if (!domain || !d_sign) {
      throw new Error("Плеер недоступен или заблокирован провайдером.");
    }

    const postBody = `domain=${encodeURIComponent(domain)}&d_sign=${encodeURIComponent(d_sign)}&pd=${encodeURIComponent(pd)}&pd_sign=${encodeURIComponent(pd_sign)}&ref=${encodeURIComponent(ref)}&bad_user=false&type=video`;

    const gtaRes = await this.request("", {
      method: "POST",
      headers: {
        "Miru-Url": `https://${domain}/gta`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": playerUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
      data: postBody,
    });

    if (!gtaRes || !gtaRes.links) {
      throw new Error("Не удалось получить видеоссылки от Kodik");
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
