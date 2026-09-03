(() => {
  const sourceColors = {
    gffunds_highend: { label: "广发高端理财", color: "#B86B3E", pale: "#FAF0E8", shape: "circle" },
    geshang: { label: "格上", color: "#146C94", pale: "#E8F4F8", shape: "circle" },
    simuwang: { label: "私募排排网", color: "#A14E28", pale: "#F8EEE8", shape: "square" },
    howbuy: { label: "好买", color: "#5B6F3A", pale: "#EEF2E6", shape: "diamond" },
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[char]));
  }

  function clean(value) {
    const text = String(value ?? "").trim();
    return text && !["null", "None", "undefined"].includes(text) ? text : "";
  }

  function number(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatNumber(value, digits = 2) {
    const parsed = number(value);
    return parsed === null ? "--" : parsed.toLocaleString("zh-CN", { maximumFractionDigits: digits });
  }

  function metricTone(code, value) {
    const displayValue=typeof value==='string'&&/^[+-]?\d+(?:\.\d+)?\s*%$/.test(value.trim()) ? value.trim().replace('%','').trim() : value;
    const v = number(displayValue);
    if (v === null || v === 0) return 'pf-neutral';
    if (/drawdown|volatility|annualVol|maxDrawdown|回撤|波动/i.test(code)) return 'pf-negative';
    return v < 0 ? 'pf-negative' : 'pf-positive';
  }

  function missingReason(row, code) {
    return row.metricMissing?.[code] || {code:'calculation_unavailable',label:'计算条件不足',message:'当前快照未提供该指标或其缺失原因；不以0替代。'};
  }

  function quantile(values, q) {
    const a = values.filter(v=>number(v)!==null).map(Number).sort((x,y)=>x-y);
    if (!a.length) return null;
    const i=(a.length-1)*q, low=Math.floor(i), t=i-low;
    return a[low]*(1-t)+a[Math.ceil(i)]*t;
  }

  function scatterModel(rows, xCode, yCode, focus = true, selectedKey = '') {
    const valid = rows.filter(r=>number(r.metrics?.[xCode]?.value)!==null && number(r.metrics?.[yCode]?.value)!==null);
    const x = r=>Number(r.metrics[xCode].value), y=r=>Number(r.metrics[yCode].value);
    const xMedian=quantile(valid.map(x),.5), yMedian=quantile(valid.map(y),.5);
    const higherYBetter=!/drawdown|volatility/i.test(yCode);
    function extent(values, selected, risk) {
      if (!values.length) return [0,1];
      const trim=focus && values.length>40;
      let min=quantile(values,trim ? .025 : 0), max=quantile(values,trim ? .975 : 1);
      if(selected!==null){min=Math.min(min,selected);max=Math.max(max,selected);}
      const pad=(max-min || Math.max(1,Math.abs(max)*.1))*.05;
      return [risk?Math.max(0,min-pad):min-pad,max+pad];
    }
    const selected=valid.find(r=>r.key===selectedKey);
    const xDomain=extent(valid.map(x),selected?x(selected):null,false);
    const yDomain=extent(valid.map(y),selected?y(selected):null,!higherYBetter);
    const visible=valid.filter(r=>x(r)>=xDomain[0]&&x(r)<=xDomain[1]&&y(r)>=yDomain[0]&&y(r)<=yDomain[1]);
    const quadrant = r => `${x(r)>=xMedian?'high':'low'}_${(higherYBetter?y(r)>=yMedian:y(r)<=yMedian)?'good':'bad'}`;
    const counts={high_good:0,high_bad:0,low_good:0,low_bad:0};
    valid.forEach(r=>counts[quadrant(r)]++);
    const visibleKeys=new Set(visible.map(r=>r.key));
    return {valid,visible,outside:valid.filter(r=>!visibleKeys.has(r.key)),xDomain,yDomain,xMedian,yMedian,higherYBetter,counts,quadrant};
  }

  function formatDate(value) {
    const text = clean(value);
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : "--";
  }

  function formatDateTime(value) {
    const text = clean(value);
    if (!text) return "--";
    return text.replace("T", " ").slice(0, 19);
  }

  function sourceBadge(sourceId) {
    const source = sourceColors[sourceId] || { label: sourceId || "未知来源", color: "#667085", pale: "#F2F4F7" };
    return `<span class="source-badge ${sourceId === "gffunds_highend" ? "is-gffunds" : ""}" style="--source:${source.color};--source-pale:${source.pale}"><i aria-hidden="true"></i>${esc(source.label)}</span>`;
  }

  function loadScript(src) {
    if (/\.gz(?:$|[?#])/.test(src) && window.PrivateFundStaticLoader?.loadGzipScript) {
      return window.PrivateFundStaticLoader.loadGzipScript(src, {
        start: 72,
        end: 98,
        label: "正在加载产品详情",
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`数据包加载失败：${src}`));
      document.head.appendChild(script);
    });
  }

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function detailHref(key, backQuery = "") {
    const query = new URLSearchParams();
    query.set("id", key);
    if (backQuery) query.set("back", backQuery);
    return `./detail.html?${query.toString()}`;
  }

  function announce(message) {
    let node = document.getElementById("privateFundAnnouncer");
    if (!node) {
      node = document.createElement("div");
      node.id = "privateFundAnnouncer";
      node.className = "sr-only";
      node.setAttribute("aria-live", "polite");
      document.body.appendChild(node);
    }
    node.textContent = "";
    window.setTimeout(() => { node.textContent = message; }, 20);
  }

  window.PrivateFund = {
    sourceColors, esc, clean, number, formatNumber, formatDate, formatDateTime,
    sourceBadge, loadScript, params, detailHref, announce,
    metricTone, missingReason, quantile, scatterModel,
  };
})();
