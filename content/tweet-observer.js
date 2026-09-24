(() => {
  const namespace = (globalThis.XToBinance ||= {});

  function startTweetObserver(onArticle) {
    const seen = new WeakSet();

    function visit(article) {
      if (seen.has(article)) return;
      seen.add(article);
      onArticle(article);
    }

    function scan(root) {
      if (root?.matches?.('article[data-testid="tweet"]')) visit(root);
      root?.querySelectorAll?.('article[data-testid="tweet"]').forEach(visit);
    }

    scan(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }

  namespace.TweetObserver = { startTweetObserver };
})();
