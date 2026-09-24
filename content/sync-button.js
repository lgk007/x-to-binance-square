(() => {
  const namespace = (globalThis.XToBinance ||= {});

  const labels = {
    idle: "同步到币安广场",
    publishing: "正在同步到币安广场",
    published: "已同步，点击打开币安广场",
    uncertain: "可能已发布，点击查看详情",
    failed: "同步失败，点击重试",
  };

  function createIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 2.6 15.1 5.7 12 8.8 8.9 5.7 12 2.6Zm5.3 5.3 3.1 3.1-3.1 3.1-3.1-3.1 3.1-3.1ZM6.7 7.9 9.8 11l-3.1 3.1L3.6 11l3.1-3.1Zm5.3 5.3 3.1 3.1-3.1 3.1-3.1-3.1 3.1-3.1Zm0-3.1 1 1-1 1-1-1 1-1Z");
    svg.append(path);
    return svg;
  }

  function findActionGroup(article) {
    const groups = [...article.querySelectorAll('[role="group"]')];
    return groups.find((group) => group.closest("article") === article) || null;
  }

  function setButtonState(button, state) {
    const normalized = labels[state] ? state : "idle";
    button.dataset.state = normalized;
    button.disabled = normalized === "publishing";
    button.title = labels[normalized];
    button.setAttribute("aria-label", labels[normalized]);
  }

  function injectSyncButton(article, tweet, onClick) {
    const existing = article.querySelector(`[data-xtb-sync-for="${tweet.tweetId}"]`);
    if (existing) return existing;
    const group = findActionGroup(article);
    if (!group) return null;

    const slot = document.createElement("div");
    slot.className = "xtb-sync-slot";
    slot.dataset.xtbSyncFor = tweet.tweetId;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "xtb-sync-button";
    button.append(createIcon());
    setButtonState(button, "idle");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(button);
    });

    slot.append(button);
    group.append(slot);
    return button;
  }

  namespace.SyncButton = { injectSyncButton, setButtonState };
})();
