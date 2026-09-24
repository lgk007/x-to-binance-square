(() => {
  const namespace = (globalThis.XToBinance ||= {});
  let host = null;
  let shadow = null;
  let currentTweetId = null;

  const template = `
    <style>
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; }
      .shell {
        inset: 0;
        pointer-events: none;
        position: fixed;
        z-index: 2147483647;
      }
      .backdrop {
        background: rgba(5, 8, 12, .28);
        border: 0;
        inset: 0;
        opacity: 0;
        pointer-events: none;
        position: absolute;
        transition: opacity 180ms ease;
        width: 100%;
      }
      .panel {
        background:
          radial-gradient(circle at 90% 0%, rgba(240,185,11,.09), transparent 28%),
          #101419;
        border-left: 1px solid #29323d;
        box-shadow: -22px 0 70px rgba(0,0,0,.35);
        color: #f5f7fa;
        display: flex;
        flex-direction: column;
        font-family: Bahnschrift, "Segoe UI Variable", sans-serif;
        height: 100%;
        margin-left: auto;
        max-width: min(440px, 100vw);
        overflow-y: auto;
        pointer-events: none;
        position: relative;
        transform: translateX(102%);
        transition: transform 220ms cubic-bezier(.22,.8,.2,1);
        width: 440px;
      }
      .shell.open .backdrop { opacity: 1; pointer-events: auto; }
      .shell.open .panel { pointer-events: auto; transform: translateX(0); }
      .header { align-items: flex-start; display: flex; justify-content: space-between; padding: 28px 28px 20px; }
      .eyebrow { color: #f0b90b; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
      h2 { font-size: 25px; letter-spacing: -.03em; line-height: 1.1; margin: 6px 0 0; }
      .close {
        align-items: center; background: #1a2028; border: 1px solid #2a3541; border-radius: 50%; color: #b7c0ca;
        cursor: pointer; display: flex; font-size: 22px; height: 34px; justify-content: center; line-height: 1; width: 34px;
      }
      .close:hover { border-color: #687585; color: white; }
      .body { display: flex; flex: 1; flex-direction: column; gap: 20px; padding: 0 28px 28px; }
      .field-label { color: #8e9ba8; display: block; font-size: 11px; font-weight: 700; letter-spacing: .08em; margin-bottom: 8px; text-transform: uppercase; }
      textarea {
        background: #0a0e13; border: 1px solid #35414d; border-radius: 14px; color: #f5f7fa; font: 14px/1.55 Georgia, "Times New Roman", serif;
        min-height: 170px; outline: none; padding: 15px; resize: vertical; width: 100%;
      }
      textarea:focus { border-color: #f0b90b; box-shadow: 0 0 0 3px rgba(240,185,11,.1); }
      .field-meta { color: #6f7c89; display: flex; font-size: 11px; justify-content: space-between; margin-top: 7px; }
      .toggle-row { align-items: center; display: flex; justify-content: space-between; }
      .toggle-row span { font-size: 13px; font-weight: 700; }
      .switch { display: inline-flex; position: relative; }
      .switch input { height: 1px; opacity: 0; position: absolute; width: 1px; }
      .track { background: #34404c; border-radius: 999px; cursor: pointer; height: 25px; position: relative; transition: background 150ms; width: 44px; }
      .track::after { background: #e6ebef; border-radius: 50%; content: ""; height: 19px; left: 3px; position: absolute; top: 3px; transition: transform 150ms; width: 19px; }
      .switch input:checked + .track { background: #f0b90b; }
      .switch input:checked + .track::after { background: #15120a; transform: translateX(19px); }
      .source { color: #718091; font-size: 11px; margin-top: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .images-head { align-items: center; display: flex; justify-content: space-between; }
      .images-title { font-size: 13px; font-weight: 700; }
      .images-count { color: #80909f; font-size: 11px; }
      .image-grid { display: grid; gap: 9px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 10px; }
      .image-choice { background: #0a0e13; border: 2px solid transparent; border-radius: 12px; cursor: pointer; height: 100px; overflow: hidden; padding: 0; position: relative; }
      .image-choice img { height: 100%; object-fit: cover; width: 100%; }
      .image-choice[aria-pressed="true"] { border-color: #f0b90b; }
      .check { align-items: center; background: #f0b90b; border-radius: 50%; color: #111; display: none; font-size: 12px; font-weight: 900; height: 22px; justify-content: center; position: absolute; right: 7px; top: 7px; width: 22px; }
      .image-choice[aria-pressed="true"] .check { display: flex; }
      .media-note { background: #1a2027; border-left: 3px solid #d48b0c; border-radius: 8px; color: #b9c2ca; font-size: 12px; line-height: 1.5; padding: 10px 12px; }
      .status { border-radius: 10px; display: none; font-size: 12px; line-height: 1.5; padding: 11px 12px; }
      .status.show { display: block; }
      .status.info { background: #161f28; color: #c1ccd6; }
      .status.error { background: #2a1518; color: #ffb9bf; }
      .status.warning { background: #2a2210; color: #f5d981; }
      .status.success { background: #10261f; color: #9ce7ca; }
      .result-link { color: inherit; display: inline-block; font-weight: 800; margin-top: 5px; }
      .publish {
        background: #f0b90b; border: 0; border-radius: 999px; color: #16120a; cursor: pointer; font-family: inherit; font-size: 14px;
        font-weight: 900; margin-top: auto; min-height: 46px; padding: 12px 18px; transition: filter 150ms, transform 150ms; width: 100%;
      }
      .publish:hover:not(:disabled) { filter: brightness(1.06); transform: translateY(-1px); }
      .publish:disabled { cursor: wait; opacity: .62; }
      .footnote { color: #657381; font-size: 10px; line-height: 1.45; text-align: center; }
      @media (max-width: 520px) { .panel { max-width: 100vw; width: 100vw; } }
      @media (prefers-reduced-motion: reduce) { .backdrop, .panel { transition: none; } }
    </style>
    <div class="shell" aria-hidden="true">
      <button class="backdrop" type="button" aria-label="关闭发布面板"></button>
      <section class="panel" role="dialog" aria-modal="true" aria-labelledby="xtb-title">
        <header class="header">
          <div><div class="eyebrow">BINANCE SQUARE</div><h2 id="xtb-title">发布前确认</h2></div>
          <button class="close" type="button" aria-label="关闭">×</button>
        </header>
        <div class="body">
          <label><span class="field-label">正文</span><textarea maxlength="10000"></textarea><span class="field-meta"><span>可在这里编辑</span><span class="counter">0 字</span></span></label>
          <div>
            <div class="toggle-row"><span>附上原推文链接</span><label class="switch"><input class="append-source" type="checkbox"><span class="track"></span></label></div>
            <div class="source"></div>
          </div>
          <div class="images-section"><div class="images-head"><span class="images-title">图片</span><span class="images-count"></span></div><div class="image-grid"></div></div>
          <div class="media-note" hidden>检测到视频或 GIF。第一版只同步正文和静态图片，不会上传该媒体。</div>
          <div class="status" role="status" aria-live="polite"></div>
          <button class="publish" type="button">发布到币安广场</button>
          <div class="footnote">只有点击此按钮后才会发布。Square 专用 Key 不会暴露给 X 页面。</div>
        </div>
      </section>
    </div>`;

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.id = "xtb-composer-host";
    shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = template;
    document.documentElement.append(host);
  }

  function refs() {
    return {
      shell: shadow.querySelector(".shell"),
      backdrop: shadow.querySelector(".backdrop"),
      close: shadow.querySelector(".close"),
      textarea: shadow.querySelector("textarea"),
      counter: shadow.querySelector(".counter"),
      appendSource: shadow.querySelector(".append-source"),
      source: shadow.querySelector(".source"),
      imagesSection: shadow.querySelector(".images-section"),
      imagesCount: shadow.querySelector(".images-count"),
      imageGrid: shadow.querySelector(".image-grid"),
      mediaNote: shadow.querySelector(".media-note"),
      status: shadow.querySelector(".status"),
      publish: shadow.querySelector(".publish"),
    };
  }

  function setStatus(element, kind, message, link = "") {
    element.className = `status ${kind} ${message ? "show" : ""}`;
    element.replaceChildren();
    if (!message) return;
    const text = document.createElement("span");
    text.textContent = message;
    element.append(text);
    if (link) {
      const anchor = document.createElement("a");
      anchor.className = "result-link";
      anchor.href = link;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = "打开币安广场帖子 →";
      element.append(document.createElement("br"), anchor);
    }
  }

  function close() {
    if (!shadow) return;
    const { shell } = refs();
    shell.classList.remove("open");
    shell.setAttribute("aria-hidden", "true");
    currentTweetId = null;
  }

  function updateProgress(message) {
    if (!shadow || message.tweetId !== currentTweetId) return;
    const { status } = refs();
    setStatus(status, "info", message.message);
  }

  function open({ tweet, defaultAppendSource, initialRecord = null, initialStatus = "", onPublish }) {
    ensureHost();
    currentTweetId = tweet.tweetId;
    const elements = refs();
    const selectedImages = new Set(tweet.imageUrls);
    let retryToken = initialRecord?.status === "uncertain" ? initialRecord.retryToken || "" : "";

    elements.textarea.value = tweet.text;
    elements.counter.textContent = `${tweet.text.length} 字`;
    elements.appendSource.checked = defaultAppendSource;
    elements.source.textContent = tweet.sourceUrl;
    elements.mediaNote.hidden = !tweet.hasUnsupportedMedia;
    elements.imageGrid.replaceChildren();
    elements.imagesSection.hidden = tweet.imageUrls.length === 0;

    function updateImageCount() {
      elements.imagesCount.textContent = `已选 ${selectedImages.size}/${tweet.imageUrls.length}`;
    }

    for (const imageUrl of tweet.imageUrls) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "image-choice";
      choice.setAttribute("aria-pressed", "true");
      choice.setAttribute("aria-label", "取消选择这张图片");
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "推文图片预览";
      const check = document.createElement("span");
      check.className = "check";
      check.textContent = "✓";
      choice.append(image, check);
      choice.addEventListener("click", () => {
        if (selectedImages.has(imageUrl)) selectedImages.delete(imageUrl);
        else selectedImages.add(imageUrl);
        const selected = selectedImages.has(imageUrl);
        choice.setAttribute("aria-pressed", String(selected));
        choice.setAttribute("aria-label", selected ? "取消选择这张图片" : "选择这张图片");
        updateImageCount();
      });
      elements.imageGrid.append(choice);
    }
    updateImageCount();

    const openingStatus = initialRecord?.status === "uncertain" ? initialRecord.message : initialStatus;
    setStatus(elements.status, openingStatus ? "warning" : "info", openingStatus || "");
    elements.publish.disabled = initialRecord?.status === "uncertain" && !retryToken;
    elements.publish.textContent = retryToken ? "我已确认未发布，重新发布" : "发布到币安广场";

    elements.textarea.oninput = () => {
      elements.counter.textContent = `${elements.textarea.value.length} 字`;
    };
    elements.backdrop.onclick = close;
    elements.close.onclick = close;
    elements.publish.onclick = async () => {
      const text = elements.textarea.value;
      if (!text.trim() && !elements.appendSource.checked) {
        setStatus(elements.status, "error", "正文和原推文链接不能同时为空。");
        elements.textarea.focus();
        return;
      }

      const confirmedRetry = Boolean(retryToken);
      elements.publish.disabled = true;
      elements.publish.textContent = confirmedRetry ? "正在重新发布…" : "正在发布…";
      setStatus(elements.status, "info", selectedImages.size ? "正在准备图片…" : "正在提交内容…");
      const publishPayload = {
        tweetId: tweet.tweetId,
        sourceUrl: tweet.sourceUrl,
        text,
        appendSource: elements.appendSource.checked,
        imageUrls: [...selectedImages],
      };
      if (confirmedRetry) publishPayload.retryToken = retryToken;
      const result = await onPublish(publishPayload);

      if (!result.ok) {
        setStatus(elements.status, "error", result.error?.message || "发布失败，请重试。");
        const staleRetry = result.error?.code === "STALE_RETRY";
        if (!staleRetry) retryToken = "";
        elements.publish.disabled = staleRetry;
        elements.publish.textContent = staleRetry ? "请重新打开发布面板" : "重新发布";
        return;
      }

      if (result.record.status === "published") {
        retryToken = "";
        setStatus(elements.status, "success", "发布成功。", result.record.shareLink);
        elements.publish.textContent = "已发布";
      } else {
        retryToken = result.record.retryToken || "";
        setStatus(elements.status, "warning", result.record.message || "内容可能已发布，请先到币安广场确认。");
        elements.publish.disabled = !retryToken;
        elements.publish.textContent = retryToken ? "我已确认未发布，重新发布" : "状态待确认";
      }
    };

    elements.shell.classList.add("open");
    elements.shell.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => elements.textarea.focus());
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && currentTweetId) close();
  });

  namespace.Composer = { open, close, updateProgress };
})();
