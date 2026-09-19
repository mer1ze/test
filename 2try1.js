// ==MiruExtension==
// @name         Kodik
// @version      v0.0.2
// @author       mer1ze
// @lang         ru
// @license      MIT
// @icon         https://kodik.info/favicon.ico
// @package      kodik
// @type         bangumi
// @webSite      https://kodik.info
// @nsfw         false
// ==/MiruExtension==

export default class extends Extension {
  async load() {
    this.registerSetting({
      title: "Kodik Domain",
      key: "domain_kodik",
      type: "input",
      description: "Kodik Domain (e.g., https://kodik.info)",
      defaultValue: "https://kodik.info",
    });
    this.domain = (await this.getSetting("domain_kodik")) || "https://kodik.info";
  }

  async req(url) {
    return this.request(url, {
      headers: {
        "Miru-Url": this.domain,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
  }

  async latest(page) {
    const html = await this.req(`/search?types=anime&limit=40&page=${page}`);
    return this.parseSearchResults(html);
  }

  async search(kw, page) {
    const html = await this.req(`/search?types=anime&title=${encodeURIComponent(kw)}&limit=40&page=${page}`);
    return this.parseSearchResults(html);
  }

  parseSearchResults(html) {
    const videos = [];
    const regex = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<div[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/div>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      videos.push({
        title: match[3].trim(),
        url: match[1].startsWith("http") ? match[1] : this.domain + match[1],
        cover: match[2].startsWith("http") ? match[2] : this.domain + match[2],
      });
    }
    return videos;
  }

  async detail(url) {
    const html = await this.req(url);
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const coverMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);

    const epList = [];
    const epRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*episode[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let epMatch;
    while ((epMatch = epRegex.exec(html)) !== null) {
      const epName = epMatch[2].replace(/<[^>]+>/g, "").trim();
      epList.push({
        name: epName || "Эпизод",
        url: epMatch[1].startsWith("http") ? epMatch[1] : this.domain + epMatch[1],
      });
    }

    if (epList.length === 0) {
      epList.push({
        name: "Смотреть",
        url: url,
      });
    }

    return {
      title: titleMatch ? titleMatch[1].trim() : "Unknown",
      cover: coverMatch ? (coverMatch[1].startsWith("http") ? coverMatch[1] : this.domain + coverMatch[1]) : "",
      desc: descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "",
      episodes: [
        {
          title: "Эпизоды",
          urls: epList,
        },
      ],
    };
  }

  async watch(url) {
    let playerUrl = url;

    if (url.includes("kodik.info") || url.includes("kodik.biz") || url.includes("kodik.cc")) {
      const html = await this.request(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      const iframeMatch = html.match(/<iframe[^>]+src="([^"]+kodik[^"]+)"[^>]*>/i);
      if (iframeMatch) {
        playerUrl = iframeMatch[1].startsWith("//") ? "https:" + iframeMatch[1] : iframeMatch[1];
      } else {
        return { type: "hls", url: url };
      }
    }

    const playerHtml = await this.request(playerUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    let urlParams = {};
    const urlParamsMatch = playerHtml.match(/var\s+urlParams\s*=\s*'([^']+)'/);
    if (urlParamsMatch) {
      try {
        urlParams = JSON.parse(urlParamsMatch[1]);
      } catch (e) {
        const getVal = (key) => playerHtml.match(new RegExp(`['"]${key}['"]\\s*:\\s*['"](.*?)['"]`))?.[1];
        urlParams = {
          d: getVal("d"),
          d_sign: getVal("d_sign"),
          pd: getVal("pd"),
          pd_sign: getVal("pd_sign"),
          ref: getVal("ref"),
          ref_sign: getVal("ref_sign"),
        };
      }
    }

    const typeMatch = playerHtml.match(/vInfo\.type\s*=\s*['"](.*?)['"]/);
    const hashMatch = playerHtml.match(/vInfo\.hash\s*=\s*['"](.*?)['"]/);
    const idMatch = playerHtml.match(/vInfo\.id\s*=\s*['"](.*?)['"]/);

    const type = typeMatch ? typeMatch[1] : "seria";
    const hash = hashMatch ? hashMatch[1] : "";
    const id = idMatch ? idMatch[1] : "";

    const refDecoded = urlParams.ref ? decodeURIComponent(urlParams.ref) : "";

    const payload = new URLSearchParams({
      d: urlParams.d || "kodikplayer.com",
      d_sign: urlParams.d_sign || "",
      pd: urlParams.pd || "kodikplayer.com",
      pd_sign: urlParams.pd_sign || "",
      ref: refDecoded,
      ref_sign: urlParams.ref_sign || "",
      bad_user: "false",
      cdn_is_working: "true",
      type: type,
      hash: hash,
      id: id,
      info: "{}",
    });

    const parsedPlayerUrl = new URL(playerUrl);
    const ftorUrl = `https://${parsedPlayerUrl.host}/ftor`;

    try {
      const ftorRes = await this.request("", {
        method: "POST",
        headers: {
          "Miru-Url": ftorUrl,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Origin": `https://${parsedPlayerUrl.host}`,
          "Referer": playerUrl,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: payload.toString(),
      });

      if (ftorRes && typeof ftorRes === "object" && ftorRes.links) {
        const links = [];
        for (const [quality, sources] of Object.entries(ftorRes.links)) {
          if (Array.isArray(sources)) {
            for (const source of sources) {
              if (source.src) {
                const decryptedBase64 = source.src.replace(/[a-zA-Z]/g, (e) => {
                  let code = e.charCodeAt(0);
                  let shifted = code + 18;
                  let limit = code <= 90 ? 90 : 122;
                  return String.fromCharCode(shifted <= limit ? shifted : shifted - 26);
                });
                try {
                  const videoUrl = atob(decryptedBase64);
                  if (videoUrl.includes("http") || videoUrl.includes(".m3u8") || videoUrl.includes(".mp4")) {
                    links.push({
                      url: videoUrl.startsWith("//") ? "https:" + videoUrl : videoUrl,
                      quality: quality,
                    });
                  }
                } catch (e) {
                  // ignore invalid base64
                }
              }
            }
          }
        }

        if (links.length > 0) {
          links.sort((a, b) => {
            const getQ = (q) => parseInt(q) || 0;
            return getQ(b.quality) - getQ(a.quality);
          });
          
          const bestLink = links[0];
          return {
            type: bestLink.url.includes(".m3u8") ? "hls" : "mp4",
            url: bestLink.url,
          };
        }
      }
    } catch (e) {
      console.error("Kodik watch error:", e);
    }

    return {
      type: "hls",
      url: playerUrl,
    };
  }
}
