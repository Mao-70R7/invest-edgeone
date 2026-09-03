(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function setProgress(percent, message, title) {
    const value = clamp(Math.round(Number(percent) || 0), 0, 100);
    const bar = document.getElementById("pageLoadBar");
    const text = document.getElementById("pageLoadText");
    const heading = document.getElementById("pageLoadTitle");
    if (bar) bar.style.width = `${value}%`;
    if (text && message) text.textContent = `${message} · ${value}%`;
    if (heading && title) heading.textContent = title;
  }

  function executeScript(text, sourceUrl) {
    const script = document.createElement("script");
    script.textContent = `${text}\n//# sourceURL=${sourceUrl}`;
    document.head.appendChild(script);
    script.remove();
  }

  async function fetchBytes(url, onProgress) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`数据包请求失败：${response.status} ${url}`);
    const total = Number(response.headers.get("content-length")) || 0;
    if (!response.body?.getReader) {
      const buffer = new Uint8Array(await response.arrayBuffer());
      onProgress?.(buffer.byteLength, buffer.byteLength);
      return buffer;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    chunks.forEach((chunk) => {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    return bytes;
  }

  async function loadGzipScript(url, options = {}) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("当前浏览器不支持 gzip 数据包解压，请使用最新版 Chrome、Edge、Firefox 或 Safari。");
    }
    const start = Number(options.start ?? 8);
    const end = Number(options.end ?? 82);
    const label = options.label || "正在加载数据";
    setProgress(start, "正在请求压缩数据", label);
    const bytes = await fetchBytes(url, (loaded, total) => {
      const ratio = total ? loaded / total : Math.min(.85, loaded / (1024 * 1024));
      setProgress(start + (end - start) * clamp(ratio, 0, 1) * .72, "正在下载压缩数据", label);
    });
    setProgress(start + (end - start) * .78, "正在解压数据", label);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    setProgress(start + (end - start) * .94, "正在解析数据", label);
    executeScript(text, url);
    setProgress(end, "数据准备完成", label);
  }

  function loadClassicScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`页面脚本加载失败：${url}`));
      document.head.appendChild(script);
    });
  }

  async function boot({ catalogUrl, appUrl, label }) {
    try {
      setProgress(5, "正在初始化页面", label);
      await loadGzipScript(catalogUrl, { start: 8, end: 84, label });
      setProgress(88, "正在构建页面", label);
      await loadClassicScript(appUrl);
      if (document.body.dataset.ready === "true") setProgress(100, "页面加载完成", label);
    } catch (error) {
      const root = document.getElementById("mainContent");
      if (root) {
        root.innerHTML = `<section class="empty-panel"><strong>页面加载失败</strong><div style="margin-top:8px">${String(error?.message || error)}</div></section>`;
      }
      console.error(error);
    }
  }

  window.PrivateFundStaticLoader = { boot, loadGzipScript, setProgress };
})();
