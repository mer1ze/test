// ==MiruExtension==
// @name         Kodik
// @version      v1.4.0
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

  // Главная страница: аниме с Shikimori
  async latest(page) {
    const res = await this.request(`/api/animes?page=${page}&limit=24&order=ranked`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `https://shikimori.one${item.image.original}` : "https://shikimori.one/assets/globals/missing.png",
    }));
  }

  // Поиск
  async search(kw, page) {
    const res = await this.request(`/api/animes?search=${encodeURIComponent(kw)}&page=${page}&limit=24`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: item.id.toString(),
      cover: item.image?.original ? `https://shikimori.one${item.image.original}` : "https://shikimori.one/assets/globals/missing.png",
      desc: `Рейтинг: ${item.score || 'N/A'}`,
    }));
  }

  // Подгрузка видеочерез GraphQL Shikimori и плеер
  async detail(id) {
    const anime = await this.request(`/api/animes/${id}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    // Формируем прямую ссылку на плеер Kodik через видео-агрегатор
    const episodesGroups = [
      {
        title: "Kodik Player",
        urls: [
          {
            name: "Смотреть в плеере (Kodik)",
            url: `https://kodik.cc/find-player?shikimori_id=${id}`,
          }
        ]
      }
    ];

    return {
      title: anime.russian || anime.name,
      cover: anime.image?.original ? `https://shikimori.one${anime.image.original}` : "",
      desc: anime.description || "Описание отсутствует.",
      episodes: episodesGroups,
    };
  }

  // Загрузка потока из веб-страницы плеера
  async watch(url) {
    let playerUrl = url.startsWith("//") ? `https:${url}` : url;

    const html = await this.request("", {
      headers: {
        "Miru-Url": playerUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!html || typeof html !== "string") {
      throw new Error("Не удалось загрузить плеер");
    }

    const domainMatch = html.match(/var domain = "(.+?)";/);
    const dSignMatch = html.match(/var d_sign = "(.+?)";/);

    if (!domainMatch || !dSignMatch) {
      // Если это прямой iframe с плеером
      const iframeMatch = html.match(/src="(https?:\/\/[^"]+kodik[^"]+)"/);
      if (iframeMatch) {
        return this.watch(iframeMatch[1]);
      }
      throw new Error("Не удалось разобрать видеоплеер");
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      data: postBody,
    });

    if (!gtaRes || !gtaRes.links) {
      throw new Error("Kodik не отдал ссылки на видео");
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
