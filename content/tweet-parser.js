(() => {
  const namespace = (globalThis.XToBinance ||= {});

  function normalizeHandle(value) {
    return String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
  }

  function parseTweetPermalink(value) {
    let url;
    try {
      url = new URL(value, "https://x.com");
    } catch {
      return null;
    }
    if (!["x.com", "www.x.com"].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/i);
    if (!match) return null;
    return {
      handle: normalizeHandle(match[1]),
      tweetId: match[2],
      url: `https://x.com/${match[1]}/status/${match[2]}`,
    };
  }

  function findPermalink(article) {
    const timedLink = article.querySelector("time")?.closest('a[href*="/status/"]');
    if (timedLink) return parseTweetPermalink(timedLink.href);
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      const parsed = parseTweetPermalink(link.href);
      if (parsed) return parsed;
    }
    return null;
  }

  function findDisplayedHandle(article) {
    const userName = article.querySelector('[data-testid="User-Name"]');
    if (!userName) return null;
    for (const link of userName.querySelectorAll('a[href^="/"]')) {
      let url;
      try {
        url = new URL(link.href, "https://x.com");
      } catch {
        continue;
      }
      const match = url.pathname.match(/^\/([^/]+)\/?$/);
      if (match) return normalizeHandle(match[1]);
    }
    return null;
  }

  function isRepostArticle(article) {
    const context = article.querySelector('[data-testid="socialContext"]');
    if (!context) return false;
    return /repost|retweeted|转发|轉發|リポスト/i.test(context.textContent || "");
  }

  function ownTweetText(article) {
    const nodes = [...article.querySelectorAll('[data-testid="tweetText"]')];
    const ownNode = nodes.find((node) => node.closest("article") === article) || nodes[0];
    return ownNode?.textContent || "";
  }

  function extractImageUrls(article, tweetId) {
    const urls = [];
    for (const image of article.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
      const mediaLink = image.closest('a[href*="/status/"]');
      if (mediaLink) {
        const linkedTweet = parseTweetPermalink(mediaLink.href);
        if (linkedTweet && linkedTweet.tweetId !== tweetId) continue;
      }
      if (!urls.includes(image.src)) urls.push(image.src);
      if (urls.length === 4) break;
    }
    return urls;
  }

  function hasUnsupportedMedia(article) {
    return Boolean(
      article.querySelector('[data-testid="videoPlayer"]') ||
      article.querySelector('video') ||
      article.querySelector('[data-testid="videoComponent"]'),
    );
  }

  function parseTweetArticle(article, configuredHandle) {
    if (!article?.matches?.('article[data-testid="tweet"]') || isRepostArticle(article)) return null;
    const permalink = findPermalink(article);
    const handle = normalizeHandle(configuredHandle);
    if (!permalink || !handle || permalink.handle !== handle) return null;
    const displayedHandle = findDisplayedHandle(article);
    if (displayedHandle && displayedHandle !== handle) return null;

    return {
      handle,
      tweetId: permalink.tweetId,
      sourceUrl: permalink.url,
      text: ownTweetText(article),
      imageUrls: extractImageUrls(article, permalink.tweetId),
      hasUnsupportedMedia: hasUnsupportedMedia(article),
    };
  }

  const SHOW_MORE_TEXT = /^(show more|显示更多|顯示更多|查看更多|もっと見る)$/i;

  function expandTruncatedText(article) {
    if (!article?.querySelectorAll) return false;
    for (const node of article.querySelectorAll("button, [role='button']")) {
      if (SHOW_MORE_TEXT.test(String(node.textContent || "").trim())) {
        if (typeof node.click === "function") node.click();
        return true;
      }
    }
    return false;
  }

  namespace.TweetParser = {
    normalizeHandle,
    parseTweetPermalink,
    parseTweetArticle,
    findDisplayedHandle,
    isRepostArticle,
    expandTruncatedText,
  };
})();
