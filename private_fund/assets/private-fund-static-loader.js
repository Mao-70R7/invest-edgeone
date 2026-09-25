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

  function unpack(pack) {
    if (pack?.recordEncoding !== 1) return pack;
    const decode=v=>{
      if(!Array.isArray(v))return v;
      const [tag,...values]=v;
      if(tag===-2)return pack.strings[values[0]];
      if(tag===-1)return values.map(decode);
      return Object.fromEntries(pack.schemas[tag].map((k,i)=>[k,decode(values[i])]));
    };
    return decode(pack.data);
  }
  function executeScript(text, sourceUrl) {
    // Static payloads are JSON assignments, never execute their contents as JS.
    const m=text.trim().match(/^window\.(__PRIVATE_FUND_[A-Z_]+__)=([\s\S]*);$/);
    if(!m)throw new Error(`数据包格式无效：${sourceUrl}`);
    window[m[1]]=unpack(JSON.parse(m[2]));
  }

  async function fetchBytes(url, onProgress) {
    // Versioned URLs invalidate on every publication; allow same-version reuse.
    const response = await fetch(url, { cache: "default" });
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
    const blob = new Blob([bytes]);
    const text = bytes[0]===31 && bytes[1]===139
      ? await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text()
      : await blob.text(); // Some hosts already apply Content-Encoding: gzip.
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

  const benchmarkLoads=new WeakMap();
  async function ensureBenchmark(pack, id) {
    const file=pack.meta?.marketExcessFiles?.[id];
    if(!file)return; // Local/unpartitioned snapshots already contain all indices.
    let loads=benchmarkLoads.get(pack);if(!loads){loads=new Map();benchmarkLoads.set(pack,loads);}
    if(!loads.has(id))loads.set(id,(async()=>{
      if(!/^\.\/data\/excess-\d+\.json\.gz$/.test(file))throw new Error('无效指数数据路径');
      const version=window.__PRIVATE_FUND_MANIFEST__?.runId||'';
      const bytes=await fetchBytes(file+'?v='+encodeURIComponent(version));
      const blob=new Blob([bytes]);
      const text=bytes[0]===31&&bytes[1]===139?await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text():await blob.text();
      const data=unpack(JSON.parse(text));
      for(const row of pack.rows)if(Object.hasOwn(data,row.key))(row.marketExcess||={})[id]=data[row.key];
    })().catch(e=>{loads.delete(id);throw e;}));
    return loads.get(id);
  }

  async function boot({ catalogUrl, dataUrls = [], appUrl, label }) {
    try {
      setProgress(5, "正在初始化页面", label);
      const urls = [catalogUrl, ...dataUrls].filter(Boolean);
      await Promise.all(urls.map(async (url,index) => {
        const start = 8 + (76 * index / urls.length);
        const end = 8 + (76 * (index + 1) / urls.length);
        await loadGzipScript(url, { start, end, label });
      }));
      setProgress(88, "正在构建页面", label);
      await loadClassicScript(appUrl);
      if (document.body.dataset.ready === "true") setProgress(100, "页面加载完成", label);
    } catch (error) {
      const root = document.getElementById("mainContent");
      if (root) {
        root.innerHTML = '<section class="empty-panel"><strong>页面加载失败</strong><p></p><button type="button">重新加载</button></section>';
        root.querySelector('p').textContent=String(error?.message || error);
        root.querySelector('button').onclick=()=>location.reload();
      }
      console.error(error);
    }
  }

  window.PrivateFundStaticLoader = { boot, loadGzipScript, setProgress, unpack, ensureBenchmark };
})();
