// ==MiruExtension==
// @name         Kodik
// @version      v0.0.1
// @author       mer1ze
// @lang         ru
// @license      MIT
// @icon         https://kodik.biz/favicon.ico
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

  // Последние обновленные аниме
  async latest(page) {
    const res = await this.req(`/list?types=anime-serial,anime&limit=24&page=${page}&with_episodes=true`);
    
    return res.results.map((item) => ({
      title: item.title || item.title_orig,
      url: `/search?id=${item.id}&shikimori_id=${item.shikimori_id || ''}`,
      cover: item.material_data?.poster_url || "https://shikimori.one/assets/globals/missing.png",
    }));
  }

  // Поиск по названию
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
      desc: item.material_data?.description || `Озвучка/Перевод: ${item.translation.title}`,
    }));
  }

  // Получение сезонов, вариантов озвучки и серий
  async detail(rawUrl) {
    let itemData;
    try {
      itemData = JSON.parse(rawUrl);
    } catch (e) {
      // Если перешли из списка latest
      const res = await this.req(rawUrl);
      const item = res.results[0];
      itemData = { link: item.link, title: item.title, id: item.id };
    }

    // Запрашиваем полный список озвучек для этого тайтла
    const searchRes = await this.req(`/search?id=${itemData.id}&with_episodes=true`);
    const episodesGroups = [];

    for (const release of searchRes.results) {
      const translationName = release.translation.title || "Стандартная";
      const urlsList = [];

      if (release.seasons) {
        // Если это сериал
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
        // Если это фильм/спешл
        urlsList.push({
          name: "Фильм / Ова",
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

  // Распаковка ссылки Kodik и получение прямых m3u8 потоков
  async watch(url) {
    let playerUrl = url.startsWith("//") ? `https:${url}` : url;

    // Делаем запрос к плееру Kodik с нужным Referer
    const html = await this.request("", {
      headers: {
        "Miru-Url": playerUrl,
        "Referer": "https://kodik.info/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    // Вытаскиваем зашифрованные видео-параметры из HTML скрипта Kodik
    const domainMatch = html.match(/var domain = "(.+?)";/);
    const dSignMatch = html.match(/var d_sign = "(.+?)";/);
    const pdMatch = html.match(/var pd = "(.+?)";/);
    const pdSignMatch = html.match(/var pd_sign = "(.+?)";/);
    const refMatch = html.match(/var ref = "(.+?)";/);

    if (!domainMatch || !dSignMatch) {
      throw new Error("Не удалось спарсить токен плеера Kodik");
    }

    // Формируем POST-запрос на получения списка ссылок качеств (.m3u8)
    const postData = new URLSearchParams({
      domain: domainMatch[1],
      d_sign: dSignMatch[1],
      pd: pdMatch ? pdMatch[1] : "",
      pd_sign: pdSignMatch ? pdSignMatch[1] : "",
      ref: refMatch ? refMatch[1] : "",
      bad_user: "false",
      type: "video",
    }).toString();

    const gtaRes = await this.request(`/gta`, {
      method: "POST",
      headers: {
        "Miru-Url": `https://${domainMatch[1]}/gta`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": playerUrl,
      },
      data: postData,
    });

    // Извлекаем и декодируем ссылки качеств
    const links = gtaRes.links;
    const maxQuality = Object.keys(links).sort((a, b) => parseInt(b) - parseInt(a))[0];
    const streamUrl = atob(links[maxQuality][0].src); // Расшифровка base64-ссылки

    return {
      type: "hls",
      url: streamUrl.startsWith("//") ? `https:${streamUrl}` : streamUrl,
    };
  }
}