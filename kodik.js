// ==MiruExtension==
// @name         Kodik
// @version      v1.1.1
// @author       User
// @lang         ru
// @license      MIT
// @icon         https://kodikplayer.com/favicon.ico
// @package      kodik.ru
// @type         bangumi
// @webSite      https://kodikapi.com
// @nsfw         false
// ==/MiruExtension==

export default class extends Extension {
  apiToken = "q8p5vnf9crt7xfyzke4iwc6r5rvsurv7";
  domain = "https://kodikapi.com";

  async req(endpoint) {
    const symbol = endpoint.includes("?") ? "&" : "?";
    return this.request(`${endpoint}${symbol}token=${this.apiToken}`, {
      headers: {
        "Miru-Url": this.domain,
      },
    });
  }

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

  async latest(page) {
    const res = await this.req(`/list?types=anime-serial,anime&limit=24&page=${page}&with_episodes=true`);
    
    return res.results.map((item) => ({
      title: item.title || item.title_orig,
      url: `/search?id=${item.id}&shikimori_id=${item.shikimori_id || ''}`,
      cover: item.material_data?.poster_url || "https://shikimori.one/assets/globals/missing.png",
    }));
  }

  async search(kw, page) {
    const res = await this.req(`/search?title=${encodeURIComponent(kw)}&types=anime-serial,anime&limit=30&with_episodes=true`);
    
    return res.results.map((item) => ({
      title: `${item.title} (${item.translation.title})`,
      url: JSON.stringify({
        link: item.link,
        title: item.title,
        id: item.id
      }),
      cover: item.material_data?.poster_url || "https://shikimori.one/assets/globals/missing.png",
      desc: item.material_data?.description || `Озвучка: ${item.translation.title}`,
    }));
  }

  async detail(rawUrl) {
    let itemData;
    try {
      itemData = JSON.parse(rawUrl);
    } catch (e) {
      const res = await this.req(rawUrl);
      const item = res.results[0];
      itemData = { link: item.link, title: item.title, id: item.id };
    }

    const searchRes = await this.req(`/search?id=${itemData.id}&with_episodes=true`);
    const episodesGroups = [];

    for (const release of searchRes.results) {
      const translationName = release.translation.title || "Стандартная";
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

    return {
      title: itemData.title,
      cover: searchRes.results[0]?.material_data?.poster_url || "",
      desc: searchRes.results[0]?.material_data?.description || "",
      episodes: episodesGroups,
    };
  }

  async watch(url) {
    let playerUrl = url.startsWith("//") ? `https:${url}` : url;
    
    // Заменяем устаревшие домены
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
      throw new Error("ERR_HTML_EMPTY: Не удалось получить HTML плеера");
    }

    const domainMatch = html.match(/var domain = "(.+?)";/);
    const dSignMatch = html.match(/var d_sign = "(.+?)";/);

    if (!domainMatch || !dSignMatch) {
      throw new Error("ERR_TOKENS_NOT_FOUND: Не найдены var domain или var d_sign в HTML");
    }

    const domain = domainMatch[1];
    const d_sign = dSignMatch[1];
    const pd = (html.match(/var pd = "(.+?)";/) || [])[1] || "";
    const pd_sign = (html.match(/var pd_sign = "(.+?)";/) || [])[1] || "";
    const ref = (html.match(/var ref = "(.+?)";/) || [])[1] || "";

    const postBody = `domain=${encodeURIComponent(domain)}&d_sign=${encodeURIComponent(d_sign)}&pd=${encodeURIComponent(pd)}&pd_sign=${encodeURIComponent(pd_sign)}&ref=${encodeURIComponent(ref)}&bad_user=false&type=video`;

    const gtaRes = await this.request(`/gta`, {
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
      throw new Error("ERR_GTA_FAILED: Запрос /gta не вернул массив links");
    }

    const qualities = Object.keys(gtaRes.links);
    if (qualities.length === 0) {
      throw new Error("ERR_NO_QUALITIES: Массив links пуст");
    }

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
