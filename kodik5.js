// ==MiruExtension==
// @name         Kodik
// @version      v1.5.0
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

  // Каталог
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

  // Страница тайтла: получаем серии и озвучки без вызова блокнутого API Kodik
  async detail(id) {
    const anime = await this.request(`/api/animes/${id}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    // Загружаем HTML-страницу виджета Kodik через рабочее зеркало
    const playerWidgetUrl = `https://kodikplayer.com/find-player?shikimori_id=${id}`;
    let html = "";
    try {
      html = await this.request("", {
        headers: {
          "Miru-Url": playerWidgetUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });
    } catch (e) {
      // Игнорируем ошибку, если виджет не доступен
    }

    const episodesGroups = [];

    if (typeof html === "string" && html.includes("seasons")) {
      // Извлекаем JSON структуры серий и озвучек из переменной в HTML
      const seriesDataMatch = html.match(/var\s+seriesData\s*=\s*(\{.+?\});/s) || html.match(/var\s+seasons\s*=\s*(\{.+?\});/s);
      
      if (seriesDataMatch) {
        try {
          const seasonsData = JSON.parse(seriesDataMatch[1]);
          const urlsList = [];

          for (const seasonNum in seasonsData) {
            const episodes = seasonsData[seasonNum];
            for (const epNum in episodes) {
              urlsList.push({
                name: `Серия ${epNum}`,
                url: episodes[epNum],
              });
            }
          }

          if (urlsList.length > 0) {
            episodesGroups.push({
              title: "Озвучка / Плеер",
              urls: urlsList,
            });
          }
        } catch (e) {}
      }
    }

    // Резервный вариант, если список серий не удалось распарсить
    if (episodesGroups.length === 0) {
      const totalEp = anime.episodes || anime.episodes_aired || 1;
      const urlsList = [];
      for (let i = 1; i <= totalEp; i++) {
        urlsList.push({
          name: `Серия ${i}`,
          url: `https://kodikplayer.com/find-player?shikimori_id=${id}&episode=${i}`,
        });
      }
      episodesGroups.push({
        title: "Kodik (Автоматический выбор)",
        urls: urlsList,
      });
    }

    return {
      title: anime.russian || anime.name,
      cover: anime.image?.original ? `https://shikimori.one${anime.image.original}` : "",
      desc: anime.description || "Описание отсутствует.",
      episodes: episodesGroups,
    };
  }

  // Воспроизведение
  async watch(url) {
    let playerUrl = url.startsWith("//") ? `https:${url}` : url;
    
    // Принудительно меняем заблокированные домены на рабочий kodikplayer.com
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

    const domainMatch = html.match(/var domain = "(.+?)";/);
    const dSignMatch = html.match(/var d_sign = "(.+?)";/);

    if (!domainMatch || !dSignMatch) {
      throw new Error("Не удалось получить видеопоток. Возможно, тайтл изъят из публичного доступа.");
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
      throw new Error("Kodik не передал ссылки на видео");
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
