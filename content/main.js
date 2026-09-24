(() => {
  const { Composer, SyncButton, TweetObserver, TweetParser } = globalThis.XToBinance;
  let settings = null;
  const syncRecords = new Map();

  async function sendMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      return { ok: false, error: { code: "EXTENSION_RELOADED", message: "扩展已更新，请刷新 X 页面后重试。" } };
    }
  }

  function applyRecordState(button, record) {
    SyncButton.setButtonState(button, record?.status || "idle");
    button.dataset.shareLink = record?.shareLink || "";
    if (record?.tweetId) syncRecords.set(String(record.tweetId), record);
  }

  async function onSyncClick(cachedTweet, button) {
    const status = button.dataset.state;
    if (status === "published" && button.dataset.shareLink) {
      window.open(button.dataset.shareLink, "_blank", "noopener,noreferrer");
      return;
    }

    if (!settings.hasApiKey) {
      await sendMessage({ type: "OPEN_OPTIONS" });
      return;
    }

    // X renders media after the article is first inserted and truncates long
    // tweets behind "Show more"; expand and wait one render before re-parsing.
    const article = button.closest('article');
    let fresh = null;
    if (article) {
      if (TweetParser.expandTruncatedText(article)) {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      fresh = TweetParser.parseTweetArticle(article, settings.xHandle);
    }
    const tweet = fresh?.tweetId === cachedTweet.tweetId ? fresh : cachedTweet;

    Composer.open({
      tweet,
      defaultAppendSource: settings.defaultAppendSource,
      initialRecord: status === "uncertain" ? syncRecords.get(tweet.tweetId) || null : null,
      onPublish: async (payload) => {
        SyncButton.setButtonState(button, "publishing");
        const result = await sendMessage({ type: "PUBLISH_POST", payload });
        if (result.ok) applyRecordState(button, result.record);
        else if (result.error?.code === "STALE_RETRY") {
          const latest = await sendMessage({ type: "GET_SYNC_STATUS", tweetId: tweet.tweetId });
          if (latest.ok && latest.record) applyRecordState(button, latest.record);
          else SyncButton.setButtonState(button, "failed");
        } else SyncButton.setButtonState(button, "failed");
        return result;
      },
    });
  }

  async function initializeArticle(article) {
    const tweet = TweetParser.parseTweetArticle(article, settings.xHandle);
    if (!tweet) return;
    const button = SyncButton.injectSyncButton(article, tweet, (target) => onSyncClick(tweet, target));
    if (!button) return;

    const result = await sendMessage({ type: "GET_SYNC_STATUS", tweetId: tweet.tweetId });
    if (result.ok && result.record) applyRecordState(button, result.record);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "PUBLISH_PROGRESS") Composer.updateProgress(message);
  });

  async function start() {
    const result = await sendMessage({ type: "GET_PUBLIC_SETTINGS" });
    if (!result.ok || !result.settings?.xHandle) return;
    settings = result.settings;
    TweetObserver.startTweetObserver(initializeArticle);
  }

  start();
})();
