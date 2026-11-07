(() => {
  window.__MINIMAL_PUBLISH_NO_FUND_DETAIL__ = true;
  const B = window.BasicData;
  if (!B || typeof B.loadScript !== "function") {
    throw new Error("Minimal publish runtime requires basic-common.js");
  }

  const originalLoadScript = B.loadScript.bind(B);
  const pending = new Map();
  const activeLoads = new Set();
  let deferredDataScripts = [];
  let deferredDataPromise = null;
  const fileProtocol = window.location.protocol === "file:";
  const runtimeScript = Array.from(document.scripts).find((script) => /\/minimal-publish-runtime\.js(?:\?|$)/.test(script.src || ""));
  const buildId = runtimeScript ? new URL(runtimeScript.src, document.baseURI).searchParams.get("v") || "" : "";

  async function withNetworkTimeout(url, options, timeoutMs, read) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return await read(response);
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensureFreshBuild() {
    if (fileProtocol || !buildId) return true;
    try {
      const versionUrl = new URL("../version.json", document.baseURI);
      versionUrl.searchParams.set("verify", String(Date.now()));
      const remote = await withNetworkTimeout(versionUrl, { cache: "no-store" }, 4000,
        async (response) => response.ok ? response.json() : null);
      const remoteBuildId = String(remote?.buildId || "").trim();
      if (!remoteBuildId || remoteBuildId === buildId) return true;
      const nextUrl = new URL(window.location.href);
      // A stale CDN page must still render after one refresh, never loop forever.
      const retryKey = `minimal-refresh:${nextUrl.pathname}:${remoteBuildId}`;
      let alreadyAttempted = nextUrl.searchParams.get("v") === remoteBuildId;
      try {
        alreadyAttempted ||= sessionStorage.getItem(retryKey) === "1";
        if (!alreadyAttempted) sessionStorage.setItem(retryKey, "1");
      } catch (_) { /* The URL guard also works when browser storage is disabled. */ }
      if (alreadyAttempted) {
        console.warn("页面缓存尚未更新，已停止重复刷新，继续显示当前页面。");
        return true;
      }
      nextUrl.searchParams.set("v", remoteBuildId);
      window.location.replace(nextUrl.href);
      return false;
    } catch (error) {
      console.warn("页面版本检查失败，继续使用当前已加载版本。", error);
      return true;
    }
  }

  document.addEventListener("click", (event) => {
    const anchor = event.target?.closest?.('a[href*="strategy.html"]');
    if (!anchor || !buildId || anchor.target === "_blank") return;
    const url = new URL(anchor.getAttribute("href") || anchor.href, document.baseURI);
    if (url.origin !== window.location.origin) return;
    url.searchParams.set("v", buildId);
    anchor.href = url.href;
  }, true);

  function showProtocolNotice() {
    if (!fileProtocol || document.getElementById("minimalPublishProtocolNotice")) return;
    const notice = document.createElement("div");
    notice.id = "minimalPublishProtocolNotice";
    notice.setAttribute("role", "alert");
    notice.style.cssText = "position:sticky;top:0;z-index:9999;padding:12px 18px;background:#fff4e5;border-bottom:1px solid #f5c26b;color:#7a2e0e;font:14px/1.5 system-ui;text-align:center";
    notice.textContent = "当前为 file:// 直接打开模式，浏览器无法读取压缩数据。请通过 HTTP 服务或 GitHub Pages 访问。";
    document.body.prepend(notice);
  }

  function removeRetiredPageLinks() {
    document.querySelectorAll('a[href$="data-quality.html"], a[href$="advisor-fof-ranking.html"]').forEach((link) => {
      const label = document.createElement("span");
      label.className = link.className;
      label.textContent = link.href.endsWith("data-quality.html") ? "质量提示" : link.textContent;
      link.replaceWith(label);
    });
  }

  function finalizeShell() {
    showProtocolNotice();
    removeRetiredPageLinks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", finalizeShell, { once: true });
  } else {
    finalizeShell();
  }

  function shardKey(value) {
    let hash = 0;
    String(value || "").split("").forEach((char) => {
      hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    });
    return (hash % 256).toString(16).padStart(2, "0");
  }

  function detailPath(kind, id) {
    if (kind !== "details") throw new Error("最小发布集不包含基金详情文件");
    const cleanKind = "details";
    const cleanId = String(id || "").trim();
    const path = `./data/${cleanKind}/${shardKey(cleanId)}/${encodeURIComponent(cleanId)}.js`;
    return buildId ? `${path}?v=${encodeURIComponent(buildId)}` : path;
  }

  function compressedScriptUrl(src, detailOnly = false) {
    const url = new URL(src, document.baseURI);
    const path = url.pathname.replace(/\\/g, "/");
    if (/\/performance-static\/[^/]+\.[a-f0-9]{20}\.js\.gz$/.test(path)) return url;
    const isDetail = /\/data\/(details|fund_details)\/(?:[^/]+\/)*[^/]+\.js$/i.test(path);
    if (detailOnly && !isDetail) return null;
    if (!detailOnly && !/\/data\/(?:[^/]+\/)*[^/]+\.js$/i.test(path)) return null;
    url.pathname = `${url.pathname}.gz`;
    return url;
  }

  async function responseText(response) {
    const encoding = String(response.headers.get("content-encoding") || "").toLowerCase();
    if (encoding.includes("gzip")) return response.text();
    if (typeof DecompressionStream !== "function" || !response.body) {
      throw new Error("当前浏览器不支持 gzip 数据加载，请使用新版 Chrome 或 Edge。");
    }
    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  async function loadCompressedScript(src, compressedUrl, options = {}) {
    let source;
    const maxAttempts = options.retry === false ? 1 : 2;
    const timeoutMs = Math.max(1000, Math.min(30000, Number(options.timeoutMs) || 30000));
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        source = await withNetworkTimeout(compressedUrl, { cache: attempt || options.reload ? "reload" : "default" }, timeoutMs,
          async (response) => {
            if (!response.ok) {
              const error = new Error(`压缩数据加载失败 (${response.status}): ${compressedUrl.pathname}`);
              error.retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
              throw error;
            }
            return responseText(response);
          });
        break;
      } catch (error) {
        const transient = error?.retryable || error?.name === "AbortError" || error?.name === "TypeError";
        if (attempt + 1 >= maxAttempts || !transient) throw error;
      }
    }
    const script = document.createElement("script");
    script.text = `${source}\n//# sourceURL=${compressedUrl.href}`;
    document.head.appendChild(script);
  }

  function loadCompressed(src, detailOnly = false, options = {}) {
    const compressedUrl = compressedScriptUrl(src, detailOnly);
    if (!compressedUrl) return originalLoadScript(src);
    if (fileProtocol) {
      return Promise.reject(new Error("压缩数据必须通过 HTTP 访问。"));
    }
    const key = compressedUrl.href;
    if (options.reload && !activeLoads.has(key)) pending.delete(key);
    if (!pending.has(key)) {
      activeLoads.add(key);
      pending.set(key, loadCompressedScript(src, compressedUrl, options).catch((error) => {
        pending.delete(key);
        throw error;
      }).finally(() => activeLoads.delete(key)));
    }
    return pending.get(key);
  }

  B.loadScript = function loadMinimalPublishScript(src, options = {}) {
    const compressedUrl = compressedScriptUrl(src, false);
    if (!compressedUrl) return originalLoadScript(src);
    return loadCompressed(src, false, options).catch((error) => {
      if (!options.compressedOnly && /404/.test(String(error?.message || error))) return originalLoadScript(src);
      throw error;
    });
  };

  function loadDeferredData() {
    if (!deferredDataPromise) {
      deferredDataPromise = Promise.all(deferredDataScripts.map((src) => loadCompressed(src)))
        .catch((error) => {
          deferredDataPromise = null;
          throw error;
        });
    }
    return deferredDataPromise;
  }

  async function startPage(options = {}) {
    const performance = window.__MINIMAL_PERFORMANCE__;
    if (performance?.bootstrap && /strategy\.html$/.test(location.pathname)) {
      options = {...options, renderer: performance.renderer || options.renderer, dataScripts: [performance.bootstrap, ...(options.dataScripts || []).filter(src => !/strategy_detail_index_pack|fund_index_pack/.test(src))]};
    }
    const dataScripts = Array.isArray(options.dataScripts) ? options.dataScripts : [];
    deferredDataScripts = Array.isArray(options.deferredDataScripts) ? options.deferredDataScripts : [];
    deferredDataPromise = null;
    const totalSteps = dataScripts.length + (options.renderer ? 1 : 0);
    let loadedSteps = 0;
    const markLoaded = (detail = "") => {
      loadedSteps += 1;
      if (B.updatePageLoading) B.updatePageLoading(loadedSteps, totalSteps, detail);
    };
    try {
      if (B.updatePageLoading) B.updatePageLoading(0, totalSteps);
      // Start the large transfers while the independent version check is in flight.
      // Catch immediately so a redirect cannot leave an unhandled fetch rejection.
      const cohort=window.BusinessQuery?.loadCohort(buildId);
      if(options.renderer){const preload=document.createElement('link');preload.rel='preload';preload.as='script';preload.href=options.renderer;document.head.append(preload);}
      const dataResult = Promise.all(dataScripts.map(async(src) => {
        if(/strategy_list_pack\.js/.test(src)){const exact=await cohort;if(exact){B.state.summary=exact;markLoaded("结果名单已加载");return;}}
        await loadCompressed(src);markLoaded("数据资源已加载");
      }))
        .then(() => ({ ok: true }), (error) => ({ ok: false, error }));
      if (!(await ensureFreshBuild())) return;
      const result = await dataResult;
      if (!result.ok) throw result.error;
      if (options.qualityScope && B.renderGlobalQualityGate) {
        B.renderGlobalQualityGate(options.qualityScope);
      }
      if (options.renderer) {
        await originalLoadScript(options.renderer);
        markLoaded("页面组件已加载");
      }
      if (B.hidePageLoading) B.hidePageLoading();
      if (B.ensureInternalTestNotice) B.ensureInternalTestNotice();
    } catch (error) {
      console.error(error);
      if (B.hidePageLoading) B.hidePageLoading();
      const root = document.querySelector("main") || document.body;
      const panel = document.createElement("section");
      panel.className = "panel";
      panel.innerHTML = `<div class="empty">页面数据加载失败：${B.esc(error?.message || error)}</div>`;
      panel.setAttribute("role", "alert");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn";
      retry.textContent = "重新加载";
      retry.addEventListener("click", () => window.location.reload());
      panel.appendChild(retry);
      root.prepend(panel);
    }
  }

  window.MinimalPublish = Object.freeze({
    loadDetailFunds: async (id) => {
      const config = window.__MINIMAL_PERFORMANCE__;
      if (!config) return;
      const file = config.fundContexts[shardKey(id)];
      if (!file) throw new Error("策略基金上下文缺失");
      await loadCompressed(file);
    },
    loadDetailBenchmarks: async () => {
      const config = window.__MINIMAL_PERFORMANCE__;
      if (!config) return;
      await loadCompressed(config.benchmarks);
      const pool = B.state.summary.globalBenchmarks;
      for (const row of window.__DETAIL_BENCHMARKS__ || []) {
        const current = pool.find(x => x.code === row.code);
        if (current) Object.assign(current, row);
        else throw new Error("全局基准身份不一致");
      }
    },
    version: 2,
    buildId,
    compressedDetails: true,
    compressedPagePacks: true,
    requiresHttp: true,
    shardKey,
    detailPath,
    startPage,
    loadDeferredData,
    hasDeferredData: () => deferredDataScripts.length > 0,
  });
  window.__MINIMAL_PUBLISH_RUNTIME__ = window.MinimalPublish;
})();
