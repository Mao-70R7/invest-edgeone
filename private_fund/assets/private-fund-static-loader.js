(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const scriptUrl=typeof document==='undefined'?null:document.currentScript?.src;
  let worker,workerId=0;
  const jobs=new Map();
  async function decodeBytes(bytes,sourceUrl='',expectedVariable=null){
    let result;
    if(typeof Worker==='function'&&scriptUrl){
      if(!worker){worker=new Worker(new URL('private-fund-data-worker.js'+new URL(scriptUrl).search,scriptUrl));
        worker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;
          if(data.type==='header'){job.result=data;return;}if(data.type==='rows'){job.result.payload.rows.push(...data.rows);return;}
          jobs.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data.type==='done'?job.result:data);};
        worker.onerror=()=>{for(const job of jobs.values())job.reject(new Error('数据解析线程加载失败，请重试'));jobs.clear();worker.terminate();worker=null;};}
      result=await new Promise((resolve,reject)=>{const id=++workerId;jobs.set(id,{resolve,reject});worker.postMessage({id,buffer:bytes.buffer},[bytes.buffer]);});
    }else{
      const blob=new Blob([bytes]);const text=(bytes[0]===31&&bytes[1]===139?await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text():await blob.text()).trim();
      const m=text.match(/^window\.(__PRIVATE_FUND_[A-Z_]+__)=([\s\S]*);$/);
      result={name:m?.[1]||null,payload:unpack(JSON.parse(m?m[2]:text))};
    }
    if(expectedVariable&&result.name!==expectedVariable)throw new Error(`数据包格式无效：${sourceUrl}`);
    return result;
  }

  function setProgress(percent, message, title) {
    const value = clamp(Math.round(Number(percent) || 0), 0, 100);
    const bar = document.getElementById("pageLoadBar");
    const text = document.getElementById("pageLoadText");
    const heading = document.getElementById("pageLoadTitle");
    if (bar) bar.style.width = `${value}%`;
    if (text && message) text.textContent = `${message} · ${value}%`;
    if (heading && title) heading.textContent = title;
    document.querySelectorAll("[data-product-load-region]").forEach((region) => {
      const progress = region.querySelector("[data-product-load-bar]");
      const status = region.querySelector("[data-product-load-text]");
      if (progress) progress.style.width = `${value}%`;
      if (status && message) status.textContent = `${message} · 约 ${value}%`;
    });
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
    setProgress(start + (end - start) * .94, "正在后台解析数据", label);
    const result=await decodeBytes(bytes,url);
    if(!result.name)throw new Error(`数据包格式无效：${url}`);
    window[result.name]=result.payload;
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
    if(pack.meta?.defaultBenchmarkSnapshot===id)return;
    const file=pack.meta?.marketExcessFiles?.[id];
    if(!file)return; // Local/unpartitioned snapshots already contain all indices.
    let loads=benchmarkLoads.get(pack);if(!loads){loads=new Map();benchmarkLoads.set(pack,loads);}
    if(!loads.has(id))loads.set(id,(async()=>{
      if(!/^\.\/data\/excess-(?:\d+|default)\.json\.gz$/.test(file))throw new Error('无效指数数据路径');
      const version=window.__PRIVATE_FUND_MANIFEST__?.assetVersion||window.__PRIVATE_FUND_MANIFEST__?.runId||window.__PRIVATE_FUND_MANIFEST__?.generatedAt||'';
      const bytes=await fetchBytes(file+'?v='+encodeURIComponent(version));
      const data=(await decodeBytes(bytes,file)).payload;
      for(const row of pack.rows)if(Object.hasOwn(data,row.key))(row.marketExcess||={})[id]=data[row.key];
    })().catch(e=>{loads.delete(id);throw e;}));
    return loads.get(id);
  }

  const metricLoads=new WeakMap();
  const productLoads=new WeakMap();
  async function ensureProductData(pack){
    if(pack.meta.completeProductData!==false)return;
    if(!productLoads.has(pack))productLoads.set(pack,(async()=>{
      const file=pack.meta.productExtraFile;if(file!=='./data/products-extra.js.gz')throw new Error('无效产品指标路径');
      const v=window.__PRIVATE_FUND_MANIFEST__?.assetVersion||window.__PRIVATE_FUND_MANIFEST__?.generatedAt||'';
      const data=(await decodeBytes(await fetchBytes(file+'?v='+encodeURIComponent(v)),file)).payload;
      const byKey=new Map(data.rows.map(r=>[r.key,r]));
      if(byKey.size!==pack.rows.length||pack.rows.some(r=>!byKey.has(r.key)))throw new Error('产品指标覆盖不一致，请刷新页面');
      for(const row of pack.rows){const item=byKey.get(row.key);if(row.metricDetailsReady)item.metrics=row.metrics;Object.assign(row,item);}
      pack.meta.completeProductData=true;
    })().catch(error=>{productLoads.delete(pack);throw error;}));
    return productLoads.get(pack);
  }
  async function ensureMetricDetails(pack,row){
    const file=row.metricDetailFile;if(!file||row.metricDetailsReady)return;
    if(!/^\.\/data\/product-info\/\d+\.json\.gz$/.test(file))throw new Error('无效指标说明路径');
    let loads=metricLoads.get(pack);if(!loads){loads=new Map();metricLoads.set(pack,loads);}
    if(!loads.has(file))loads.set(file,(async()=>{
      const v=window.__PRIVATE_FUND_MANIFEST__?.assetVersion||window.__PRIVATE_FUND_MANIFEST__?.generatedAt||'';
      const data=(await decodeBytes(await fetchBytes(file+'?v='+encodeURIComponent(v)),file)).payload;
      for(const r of pack.rows)if(data[r.key]){Object.assign(r,data[r.key]);r.metricDetailsReady=true;}
    })().catch(e=>{loads.delete(file);throw e;}));
    return loads.get(file);
  }

  async function bootProducts(options){
    try{
      const version=new URL(options.catalogUrl,location.href).searchParams.get('v')||'';
      const cohort=window.BusinessQuery?.loadCohort(version);
      const preload=document.createElement('link');preload.rel='preload';preload.as='script';preload.href=options.appUrl;document.head.append(preload);
      await Promise.all([loadGzipScript(options.filterUrl,{start:5,end:15,label:options.label}),loadClassicScript(options.previewUrl)]);
      window.PrivateFundProductPreview.mount(window.__PRIVATE_FUND_PRODUCT_FILTERS__);
      const exact=await cohort;
      if(exact)window.__PRIVATE_FUND_CATALOG__=exact;
      else await loadGzipScript(options.catalogUrl,{start:18,end:85,label:options.label});
      await loadClassicScript(options.appUrl);
    }catch(error){showError(error);}
  }

  function showError(error){
    const root=document.getElementById('mainContent'),regions=root?.querySelectorAll('[data-product-load-region]');
    if(regions?.length){regions.forEach(region=>{region.classList.add('is-error');region.setAttribute('aria-busy','false');region.querySelector('[data-product-load-text]').textContent='产品数据加载失败，请检查网络后重试。';const retry=region.querySelector('[data-product-load-retry]');retry.hidden=false;retry.onclick=()=>location.reload();});document.body.dataset.loadError='true';}
    else if(root){root.innerHTML='<section class="empty-panel"><strong>页面加载失败</strong><p></p><button type="button">重新加载</button></section>';root.querySelector('p').textContent=String(error?.message||error);root.querySelector('button').onclick=()=>location.reload();}
    console.error(error);
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
      const productRegions = root?.querySelectorAll("[data-product-load-region]");
      if (productRegions?.length) {
        root.classList.add("is-load-error");
        root.querySelectorAll(".panel-count").forEach((count) => { count.textContent = "加载失败"; });
        root.querySelectorAll(".product-shell-filter-grid select option").forEach((option) => { option.textContent = "数据加载失败"; });
        const search = root.querySelector(".product-shell-filter-grid input");
        if (search) search.placeholder = "数据加载失败，暂不可搜索";
        const asof = root.querySelector(".asof-block span");
        if (asof) asof.textContent = "产品数据加载失败";
        productRegions.forEach((region) => {
          region.classList.add("is-error");
          region.setAttribute("aria-busy", "false");
          region.querySelector("[data-product-load-text]").textContent = "产品数据加载失败，请检查网络后重试。";
          const retry = region.querySelector("[data-product-load-retry]");
          retry.hidden = false;
          retry.onclick = () => location.reload();
        });
        document.body.dataset.loadError = "true";
      } else if (root) {
        root.innerHTML = '<section class="empty-panel"><strong>页面加载失败</strong><p></p><button type="button">重新加载</button></section>';
        root.querySelector('p').textContent=String(error?.message || error);
        root.querySelector('button').onclick=()=>location.reload();
      }
      console.error(error);
    }
  }

  window.PrivateFundStaticLoader = { boot, bootProducts, loadGzipScript, setProgress, unpack, ensureBenchmark, ensureMetricDetails, ensureProductData, decodeBytes, showError };
})();
