// ==MiruExtension==
// @name         Kodik
// @version      v1.7.0
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

  // Попытка запросить API через разные домены
  async fetchKodikApi(path) {
    const domains = ["kodik-api.com", "kodikapi.info", "kodik.info"];
    for (const domain of domains) {
      try {
        const res = await this.request("", {
          headers: {
            "Miru-Url": `https://${domain}${path}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        if (res && res.results) return res;
      } catch (e) {}
    }
    return null;
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
      cover: item.image?.original ? `https://shikimori.io${item.image.original}` : "",
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
      cover: item.image?.original ? `https://shikimori.io${item.image.original}` : "",
      desc: `Рейтинг: ${item.score || 'N/A'}`,
    }));
  }

  // Детальная страница с гарантированным выводом серий
  async detail(id) {
    const anime = await this.request(`/api/animes/${id}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const episodesGroups = [];

    // 1. Пробуем получить точные озвучки и серии через API
    const apiPath = `/api/v2/search?shikimori_id=${id}&token=${this.kodikToken}&with_episodes=true`;
    const kodikRes = await this.fetchKodikApi(apiPath);

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

    // 2. Гарантированный фоллбэк: если API блокнут, генерируем серии по кол-ву эпизодов из Shikimori
    if (episodesGroups.length === 0) {
      const totalEp = anime.episodes || anime.episodes_aired || 24;
      const urlsList = [];
      for (let i = 1; i <= totalEp; i++) {
        urlsList.push({
          name: `Серия ${i}`,
          url: `https://kodikplayer.com/find-player?shikimori_id=${id}&episode=${i}`,
        });
      }
      episodesGroups.push({
        title: "Kodik (Прямой плеер)",
        urls: urlsList,
      });
    }

    return {
      title: anime.russian || anime.name,
      cover: anime.image?.original ? `https://shikimori.io${anime.image.original}` : "",
      desc: anime.description || "Описание отсутствует.",
      episodes: episodesGroups,
    };
  }

  // Загрузка видеопотока
  async watch(url) {
    let playerUrl = url.startsWith("//") ? `https:${url}` : url;
    
    // Заменяем заблокированные домены на рабочий плеер
    playerUrl = playerUrl
      .replace("kodik.cc", "kodikplayer.com")
      .replace("kodik.info", "kodikplayer.com")
      .replace("kodik.biz", "kodikplayer.com")
      .replace("aniqit.com", "kodikplayer.com");

    const html = await this.request("", {
      headers: {
        "Miru-Url": playerUrl,
        "Referer": "https://kodikplayer.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!html || typeof html !== "string") {
      throw new Error("Не удалось загрузить плеер");
    }

    // В случае фоллбэка получаем iframe с плеером
    const iframeMatch = html.match(/src="(\/\/kodikplayer\.com\/[^"]+)"/);
    if (iframeMatch) {
      return this.watch(`https:${iframeMatch[1]}`);
    }

    const domainMatch = html.match(/var domain = "(.+?)";/);
    const dSignMatch = html.match(/var d_sign = "(.+?)";/);

    if (!domainMatch || !dSignMatch) {
      throw new Error("Серия недоступна или заблокирована");
    }

    const domain = domainMatch[1];
    const d_sign = dSignMatch[1];
    const pd = (html.match(/var pd = "(.+?)";/) || [])[1] || "";
    const pd_sign = (html.match(/var pd_sign = "(.+?)";/) || [])[1] || "";
    const ref = (html.match(/var ref = "(.+?)";/) || [])[1] || "";

    const postBody = `domain=${encodeURIComponent(domain)}&d_sign=${encodeURIComponent(d_sign)}&pd=${encodeURIComponent(pd)}&pd_sign=${encodeURIComponent(pd_sign)}&ref=${encodeURIComponent(ref)}&bad_user=false&type=video`;

    const gtaRes = await this.request("", {
      method: "POST",
      headers: {
        "Miru-Url": `https://${domain}/gta`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": playerUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      data: postBody,
    });

    if (!gtaRes || !gtaRes.links) {
      throw new Error("Не удалось получить видеоссылку");
    }

    const qualities = Object.keys(gtaRes.links);
    const maxQuality = qualities[qualities.length - 1];
    const encodedSrc = gtaRes.links[maxQuality][0].src;

    let streamUrl = this.decodeB64(encodedSrc);
    if (streamUrl.startsWith("//")) {
      streamUrl = `https:${streamUrl}`;
    }

    return {
      type: "hls",
      url: streamUrl,
    };
  }
}
