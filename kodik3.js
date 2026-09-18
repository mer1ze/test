// ==MiruExtension==
// @name         Kodik
// @version      v1.3.1
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

  // Запрос к Kodik с обходом блокировок DNS
  async reqKodik(path) {
    // 1. Пробуем рабочее зеркало
    try {
      return await this.request("", {
        headers: {
          "Miru-Url": `https://kodik-api.com${path}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
    } catch (e) {}

    // 2. Пробуем основной домен
    try {
      return await this.request("", {
        headers: {
          "Miru-Url": `https://kodikapi.com${path}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
    } catch (e) {}

    // 3. Фоллбэк через CORS прокси
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(`https://kodikapi.com${path}`)}`;
    return await this.request("", {
      headers: {
        "Miru-Url": proxyUrl,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
  }

  // Главная страница: через Shikimori API
  async latest(page) {
    const res = await this.request(`/api/animes?page=${page}&limit=24&order=ranked`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: `/api/animes/${item.id}`,
      cover: item.image?.original ? `https://shikimori.one${item.image.original}` : "https://shikimori.one/assets/globals/missing.png",
    }));
  }

  // Поиск: через Shikimori API
  async search(kw, page) {
    const res = await this.request(`/api/animes?search=${encodeURIComponent(kw)}&page=${page}&limit=24`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!Array.isArray(res)) return [];

    return res.map((item) => ({
      title: item.russian || item.name,
      url: `/api/animes/${item.id}`,
      cover: item.image?.original ? `https://shikimori.one${item.image.original}` : "https://shikimori.one/assets/globals/missing.png",
      desc: `Рейтинг: ${item.score || 'N/A'}`,
    }));
  }

  // Карточка тайтла и получение серий
  async detail(url) {
    const anime = await this.request(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const shikimoriId = anime.id;
    const path = `/api/v2/search?shikimori_id=${shikimoriId}&token=${this.kodikToken}&with_episodes=true`;
    
    const kodikRes = await this.reqKodik(path);
    const episodesGroups = [];

    if (kodikRes && kodikRes.results) {
      for (const release of kodikRes.results) {
        const translationName = release.translation ? release.translation.title : "Озвучка";
        const urlsList = [];

        if (release.seasons) {
          for (const seasonNum in release.seasons) {
            const episodes = release.seasons[seasonNum].episodes;
            for (const epNum in episodes) {
              urlsList.push({
                name: `S${seasonNum} E${epNum}`,
                url: episodes[epNum],
              });
            }
          }
        } else if (release.link) {
          urlsList.push({
            name: "Фильм / ОВА",
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

    return {
      title: anime.russian || anime.name,
      cover: anime.image?.original ? `https://shikimori.one${anime.image.original}` : "",
      desc: anime.description || "Описание отсутствует.",
      episodes: episodesGroups,
    };
  }

  // Загрузка видеопотока
  async watch(url) {
    let playerUrl = url.startsWith("//") ? `https:${url}` : url;
    
    playerUrl = playerUrl
      .replace("kodik.info", "kodikplayer.com")
      .replace("kodik.cc", "kodikplayer.com")
      .replace("kodik.biz", "kodikplayer.com")
      .replace("aniqit.com", "kodikplayer.com");

    const html = await this.request("", {
      headers: {
        "Miru-Url": playerUrl,
        "Referer": "https://kodikplayer.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!html || typeof html !== "string") {
      throw new Error("Не удалось загрузить плеер");
    }

    const domainMatch = html.match(/var domain = "(.+?)";/);
    const dSignMatch = html.match(/var d_sign = "(.+?)";/);

    if (!domainMatch || !dSignMatch) {
      throw new Error("Не удалось извлечь токены плеера");
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
      throw new Error("Kodik не отдал ссылки на поток");
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
