(() => {
  const P = window.PrivateFund || {};
  const catalog = window.__PRIVATE_FUND_CATALOG__;
  const root = document.getElementById("mainContent");
  if (!root || !catalog) return;
  const params = P.params();
  const key = P.clean(params.get("id"));
  const catalogRow = (catalog.rows || []).find((row) => row.key === key);
  if (!catalogRow) {
    root.innerHTML = '<section class="empty-panel">未找到该产品</section>';
    return;
  }

  function text(value, fallback = "未披露") {
    const cleaned = P.clean(value);
    return cleaned || fallback;
  }

  function humanize(value) {
    if (value === null || value === undefined || value === "") return "未披露";
    if (Array.isArray(value)) return value.length ? value.map(humanize).join("；") : "未披露";
    if (typeof value === "object") {
      if (value.note) return text(value.note);
      return window.PrivateFundBusinessText.readable(value)||'未披露';
    }
    const raw = String(value).replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").trim();
    if (!raw) return "未披露";
    if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.note) return text(parsed.note);
        if (Array.isArray(parsed) && !parsed.length) return "未披露";
        return humanize(parsed);
      } catch (_) { /* preserve source text */ }
    }
    return raw;
  }

  function definitions(items) {
    return `<dl class="definition-list">${items.map(([label, value]) => `<div><dt>${P.esc(label)}</dt><dd>${P.esc(humanize(value))}</dd></div>`).join("")}</dl>`;
  }

  function section(title, body, extraClass = "") {
    return `<section class="detail-section ${extraClass}"><h2>${P.esc(title)}</h2><div class="section-body">${body}</div></section>`;
  }

  function strictNumeric(value) {
    if (value === null || value === undefined || value === "") return null;
    const match = String(value).trim().replace(/,/g, "").match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*%?$/);
    return match ? Number(match[1]) : null;
  }

  function latestPerformance(rows) {
    const latest = new Map();
    (rows || []).forEach((row) => {
      const code = text(row.metric_code, "");
      if (!code) return;
      const prior = latest.get(code);
      const stamp = `${row.collected_at || ""}|${row.as_of_date || ""}`;
      const priorStamp = prior ? `${prior.collected_at || ""}|${prior.as_of_date || ""}` : "";
      if (!prior || stamp > priorStamp) latest.set(code, row);
    });
    return [...latest.values()].sort((a, b) => String(a.metric_code).localeCompare(String(b.metric_code), "zh-CN"));
  }

  function linearCurvePath(points, x, y) {
    return points.map((point, index) => `${index ? "L" : "M"}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
  }

  function endpointSlope(h0, h1, d0, d1) {
    let slope = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(slope) !== Math.sign(d0)) slope = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(slope) > Math.abs(3 * d0)) slope = 3 * d0;
    return slope;
  }

  function monotoneCurvePath(points, x, y) {
    if (points.length < 3) return linearCurvePath(points, x, y);
    const coordinates = points.map((point) => ({ x: x(point.time), y: y(point.value) }));
    const widths = [], deltas = [];
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const width = coordinates[index + 1].x - coordinates[index].x;
      if (!(width > 0)) return linearCurvePath(points, x, y);
      widths.push(width);
      deltas.push((coordinates[index + 1].y - coordinates[index].y) / width);
    }
    const slopes = new Array(coordinates.length);
    slopes[0] = endpointSlope(widths[0], widths[1], deltas[0], deltas[1]);
    slopes[slopes.length - 1] = endpointSlope(widths.at(-1), widths.at(-2), deltas.at(-1), deltas.at(-2));
    for (let index = 1; index < coordinates.length - 1; index += 1) {
      if (deltas[index - 1] === 0 || deltas[index] === 0 || deltas[index - 1] * deltas[index] <= 0) {
        slopes[index] = 0;
      } else {
        const w1 = 2 * widths[index] + widths[index - 1];
        const w2 = widths[index] + 2 * widths[index - 1];
        slopes[index] = (w1 + w2) / (w1 / deltas[index - 1] + w2 / deltas[index]);
      }
    }
    let path = `M${coordinates[0].x.toFixed(2)},${coordinates[0].y.toFixed(2)}`;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const width = widths[index];
      path += ` C${(coordinates[index].x + width / 3).toFixed(2)},${(coordinates[index].y + slopes[index] * width / 3).toFixed(2)} ${(coordinates[index + 1].x - width / 3).toFixed(2)},${(coordinates[index + 1].y - slopes[index + 1] * width / 3).toFixed(2)} ${coordinates[index + 1].x.toFixed(2)},${coordinates[index + 1].y.toFixed(2)}`;
    }
    return path;
  }

  function lineChart(rows, { dateField, valueFields, label, color, percent = false, smoothSparse = false, note = "" }) {
    const points = (rows || []).map((row) => {
      const dateText = P.clean(row[dateField]);
      if (!/^\d{4}-\d{2}-\d{2}/.test(dateText)) return null;
      let value = null;
      for (const field of valueFields) {
        value = P.number(row[field]);
        if (value !== null) break;
      }
      if (value === null && valueFields.includes("scale_value_raw")) value = strictNumeric(row.scale_value_raw);
      const time = Date.parse(dateText.slice(0, 10));
      return Number.isFinite(time) && value !== null ? { time, value, date: dateText.slice(0, 10) } : null;
    }).filter(Boolean).sort((a, b) => a.time - b.time);
    const unique = [];
    points.forEach((point) => {
      if (unique.length && unique[unique.length - 1].time === point.time) unique[unique.length - 1] = point;
      else unique.push(point);
    });
    if (unique.length < 2) return `<div class="chart-empty">暂无${P.esc(label)}</div>`;
    const width = 760, height = 260, left = 54, right = 15, top = 18, bottom = 34;
    let min = Math.min(...unique.map((point) => point.value));
    let max = Math.max(...unique.map((point) => point.value));
    if (min === max) { min -= Math.max(1, Math.abs(min) * .05); max += Math.max(1, Math.abs(max) * .05); }
    const minTime = unique[0].time, maxTime = unique[unique.length - 1].time;
    const x = (time) => left + ((time - minTime) / (maxTime - minTime || 1)) * (width - left - right);
    const y = (value) => top + (1 - (value - min) / (max - min || 1)) * (height - top - bottom);
    const gaps = unique.slice(1).map((point, index) => (point.time - unique[index].time) / 86400000).filter((value) => value > 0).sort((a, b) => a - b);
    const middle = Math.floor(gaps.length / 2);
    const cadenceDays = gaps.length ? (gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2) : null;
    const smooth = Boolean(smoothSparse && cadenceDays > 3 && unique.length > 2);
    const path = smooth ? monotoneCurvePath(unique, x, y) : linearCurvePath(unique, x, y);
    const axisValue = (value) => percent ? `${P.formatNumber(value * 100, 1)}%` : P.formatNumber(value, 2);
    const grid = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const yy = top + ratio * (height - top - bottom);
      const value = max - ratio * (max - min);
      return `<line x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}" stroke="#E7E1D8"/><text x="${left - 7}" y="${yy + 3}" text-anchor="end">${P.esc(axisValue(value))}</text>`;
    }).join("");
    return `<div class="line-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${P.esc(label)}，${unique.length}个有效日期点，从${unique[0].date}到${unique[unique.length - 1].date}">
      <g fill="#7A838B" font-size="10" font-family="Segoe UI,Microsoft YaHei,sans-serif">${grid}<text x="${left}" y="${height - 10}">${unique[0].date}</text><text x="${width - right}" y="${height - 10}" text-anchor="end">${unique[unique.length - 1].date}</text></g>
      <path d="${path}" fill="none" stroke="${P.esc(color)}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" data-render-mode="${smooth ? "monotone" : "linear"}"/>
      <circle cx="${x(unique[unique.length - 1].time)}" cy="${y(unique[unique.length - 1].value)}" r="4" fill="${P.esc(color)}"/>
    </svg></div><p class="chart-caption">${unique[0].date} — ${unique[unique.length - 1].date} · ${unique.length}点${cadenceDays ? ` · 典型披露间隔${P.formatNumber(cadenceDays, 0)}天` : ""}${smooth ? " · 保形平滑连线" : ""}</p>${note ? `<p class="analytics-note">${P.esc(note)}</p>` : ""}`;
  }

  function formatDerived(metric) {
    const value = P.number(metric?.value);
    if (value === null) return "--";
    if (metric.unit === "decimal_return" || metric.unit === "decimal_ratio") return `${P.formatNumber(value * 100, 2)}%`;
    return P.formatNumber(value, 3);
  }

  function formatQuality(value) {
    const quality = P.clean(value);
    if (!quality) return "--";
    if (quality === "sufficient") return "输入充足";
    const coverage = quality.match(/^sufficient_monthly_coverage_([0-9.]+)$/);
    if (coverage) return `月度覆盖充足（${P.formatNumber(Number(coverage[1]) * 100, 0)}%）`;
    if (quality.includes("unstable_denominator")) return "分母偏小，谨慎使用";
    return quality;
  }

  function render(detail) {
    const product = detail.product || {};
    const company = detail.company || {};
    const source = P.sourceColors[detail.source?.id] || { color: "#146C94", label: detail.source?.label || "来源" };
    const back = P.clean(params.get("back"));
    const backHref = `./products.html${back ? `?${back}` : ""}`;
    const currentMetrics = catalog.metrics || [];
    const sourceMetricCards = currentMetrics.map((definition) => {
      const metric = catalogRow.metrics?.[definition.code];
      if (!metric) return "";
      return `<div class="metric-card"><span>${P.esc(definition.label)}</span><strong class="${P.metricTone(definition.code,metric.value)}">${P.esc(P.formatNumber(metric.value, 2))}${metric.unit==='percent'?'%':''}</strong><small>${P.esc(P.formatDate(metric.asOf))}</small></div>`;
    }).filter(Boolean).join("") || '<div class="chart-empty">暂无可直接展示的来源数值指标（来源原值见下表）</div>';
    const performance = latestPerformance(detail.performance);
    const metricLabels = new Map((catalog.metrics || []).map((item) => [item.code, item.label]));
    const performanceRows = performance.slice(0, 120).map((row) => `<tr><td>${P.esc(metricLabels.get(row.metric_code) || row.metric_code)}</td><td class="${P.metricTone(row.metric_code,row.value_raw)}">${P.esc(humanize(row.value_raw))}</td><td>${P.esc(P.formatDate(row.as_of_date))}</td></tr>`).join("") || '<tr><td colspan="3">暂无业绩指标</td></tr>';
    const derived = detail.derivedMetrics || [];
    const derivedByCode = new Map(derived.map((metric) => [metric.code, metric]));
    const featuredCodes = [
      "derived_return_1y", "derived_annualized_return_1y", "derived_annualized_volatility_1y",
      "derived_max_drawdown_1y", "derived_sharpe_ratio_1y", "derived_annualized_return_since",
    ];
    const derivedCards = featuredCodes.map((code) => derivedByCode.get(code)).filter(Boolean).map((metric) => `<div class="metric-card"><span>${P.esc(metric.label)}</span><strong class="${P.metricTone(metric.code,metric.value)}">${P.esc(formatDerived(metric))}</strong><small>${P.esc(P.formatDate(metric.asOf))} · ${P.esc(formatQuality(metric.qualityStatus))}</small></div>`).join("") || '<div class="chart-empty">历史序列尚不足以计算衍生指标</div>';
    const derivedRows = derived.map((metric) => `<tr><td>${P.esc(metric.label)}</td><td class="${P.metricTone(metric.code,metric.value)}">${P.esc(formatDerived(metric))}</td><td>${P.esc(P.formatDate(metric.windowStart))} — ${P.esc(P.formatDate(metric.windowEnd))}</td><td>${P.esc(String(metric.inputPointCount || 0))}</td><td>${P.esc(formatQuality(metric.qualityStatus))}</td></tr>`).join("") || '<tr><td colspan="5">暂无衍生指标</td></tr>';
    const managers = (detail.managers || []).map((item) => {
      const relation = item.relation || {};
      const profile = item.profile || {};
      const description = [profile.introduction, profile.background, profile.professional_background, profile.experience].map(P.clean).find(Boolean);
      return `<article class="manager-card"><h3>${P.esc(text(relation.source_manager_name || profile.source_manager_name))}</h3>${description ? `<p>${P.esc(description)}</p>` : ""}<dl><div><dt>任职起点</dt><dd>${P.esc(P.formatDate(relation.management_start_date))}</dd></div><div><dt>当前经理</dt><dd>${relation.is_current ? "是" : "--"}</dd></div></dl></article>`;
    }).join("") || '<div class="chart-empty">暂无基金经理信息</div>';
    const rawTerms=detail.terms||{};
    const terms=Object.fromEntries(Object.entries(rawTerms).map(([key,value])=>[key,window.PrivateFundBusinessText.readable(value,key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),{source:catalogRow.source,openDay:rawTerms.open_day,recentOpenDates:rawTerms.recent_open_dates})]));
    const companyBody = definitions([
      ["机构全称", company.source_company_name || catalogRow.company], ["机构简称", company.company_name_short],
      ["登记编号", company.registration_number], ["登记状态", company.registration_status],
      ["成立日期", P.formatDate(company.inception_date)], ["所在地", company.office_city || company.registered_city || company.province],
      ["管理规模档位", company.company_scale_band], ["管理产品数", company.managed_product_count],
      ["投研团队", company.research_team], ["风控说明", company.risk_control],
      ["投资理念", company.investment_philosophy], ["来源简介", company.introduction],
    ]);
    const termsBody = definitions([
      ["认购起点", terms.subscription_threshold], ["追加起点", terms.minimum_additional_amount],
      ["锁定 / 封闭期", terms.lockup_period || terms.quasi_lockup_period], ["开放日", terms.open_day],
      ["赎回开放规则", terms.redemption_open_day], ["认购费", terms.subscription_fee || terms.purchase_fee],
      ["赎回费", terms.redemption_fee], ["管理费", terms.management_fee],
      ["托管费", terms.custodian_fee], ["业绩报酬", terms.performance_fee || terms.performance_fee_description],
      ["预警线", terms.warning_line], ["止损线", terms.stop_loss_line],
      ["托管人", terms.custodian_name || product.custodian_name], ["投资范围", terms.investment_scope],
      ["投资策略说明", terms.investment_strategy_description], ["投资限制", terms.investment_restriction],
      ["信息披露周期", terms.information_disclosure_period], ["资料可得性", terms.document_availability],
    ]);
    const analysis = detail.analysis || {};
    const analysisChart = lineChart(detail.analysisCurve, {
      dateField: "date", valueFields: ["value"], label: analysis.seriesLabel || "完整业绩走势",
      color: source.color, percent: true, smoothSparse: true,
      note: analysis.seriesNote || "基于数据库内完整可观测业绩序列展示。",
    });
    const navChart = lineChart(detail.nav, {
      dateField: "nav_date", valueFields: ["adjusted_nav_numeric", "unit_nav_numeric", "accumulated_nav_numeric"],
      label: "净值走势", color: source.color,
    });
    const scaleChart = lineChart(detail.scale, {
      dateField: "scale_date", valueFields: ["scale_value_raw"], label: "规模走势", color: "#8B5B18", valueLabel: "规模",
    });
    const documents = (detail.documents || []).slice().sort((a, b) => String(b.document_date || "").localeCompare(String(a.document_date || "")));
    const documentRows = documents.slice(0, 30).map((item) => `<tr><td>${P.esc(P.formatDate(item.document_date))}</td><td>${P.esc(text(item.document_type, "公告"))}</td><td><a class="document-link" href="${P.esc(item.document_url)}" target="_blank" rel="noopener noreferrer">${P.esc(text(item.document_type, "查看"))}</a></td></tr>`).join("") || '<tr><td colspan="3">暂无公开报告</td></tr>';
    const positions = (detail.positions || []).slice().sort((a, b) => String(b.position_date || "").localeCompare(String(a.position_date || "")) || Number(b.position_weight_raw || 0) - Number(a.position_weight_raw || 0));
    const positionRows = positions.slice(0, 50).map((item) => `<tr><td>${P.esc(P.formatDate(item.position_date))}</td><td>${P.esc(text(item.security_name))}<span class="cell-sub">${P.esc(text(item.security_id, ""))}</span></td><td>${P.esc(P.formatNumber(item.position_weight_raw, 2))}%</td></tr>`).join("") || '<tr><td colspan="3">暂无公开持仓</td></tr>';
    const isGffunds = catalogRow.source === "gffunds_highend";
    root.innerHTML = `
      <a class="back-link" href="${P.esc(backHref)}">← 返回产品列表</a>
      <section class="detail-hero ${isGffunds ? "is-gffunds" : ""}" style="--source:${P.esc(source.color)}">
        <div class="detail-title-row"><div><p class="eyebrow">${P.esc(source.label)} / ${P.esc(catalogRow.id)}</p><h1>${P.esc(catalogRow.name || catalogRow.id)}</h1><p class="detail-subtitle">${P.esc(catalogRow.fullName || catalogRow.company || "来源产品详情")}</p></div>${P.sourceBadge(catalogRow.source)}</div>
        <div class="detail-kpis">
          <div class="detail-kpi"><span>管理人</span><strong>${P.esc(text(catalogRow.company))}</strong></div>
          <div class="detail-kpi"><span>主策略</span><strong>${P.esc(text(catalogRow.strategy1))}</strong></div>
          <div class="detail-kpi"><span>成立日期</span><strong>${P.esc(P.formatDate(catalogRow.inceptionDate))}</strong></div>
          <div class="detail-kpi"><span>最新业绩日 / 曲线点数</span><strong>${P.esc(P.formatDate(analysis.latestDate || catalogRow.analysisLatestDate || catalogRow.latestNavDate))} · ${Number(analysis.pointCount || catalogRow.analysisPointCount || 0).toLocaleString("zh-CN")}点</strong></div>
          <div class="detail-kpi"><span>风险等级</span><strong>${P.esc(text(catalogRow.riskLevel))}</strong></div>
        </div>
      </section>
      <div class="detail-grid">
        <div class="detail-column">
          ${section("衍生分析指标", `<div class="metric-cards">${derivedCards}</div><p class="analytics-note">统一公式二次加工；跨来源仅公式对齐，序列类型、费用与估值频率仍可能不同，不用于跨来源排名。</p><div class="table-wrap detail-table-wrap"><table class="detail-table"><thead><tr><th>指标</th><th>数值</th><th>观察窗口</th><th>输入点</th><th>质量状态</th></tr></thead><tbody>${derivedRows}</tbody></table></div>`)}
          ${section(analysis.pointCount >= 2 ? "完整业绩走势" : "净值走势", analysis.pointCount >= 2 ? analysisChart : navChart, "analysis-section")}
          ${performance.length ? section("来源业绩指标", `<div class="metric-cards">${sourceMetricCards}</div><div class="table-wrap detail-table-wrap"><table class="detail-table"><thead><tr><th>指标</th><th>来源原值</th><th>截止日</th></tr></thead><tbody>${performanceRows}</tbody></table></div>`) : ""}
          ${documents.length ? section("公开报告", `<div class="table-wrap"><table class="detail-table"><thead><tr><th>日期</th><th>类型</th><th>文件</th></tr></thead><tbody>${documentRows}</tbody></table></div>`) : ""}
          ${positions.length ? section("公开持仓", `<div class="table-wrap"><table class="detail-table"><thead><tr><th>报告日</th><th>持仓</th><th>占比</th></tr></thead><tbody>${positionRows}</tbody></table></div>`) : ""}
          ${detail.scale?.length ? section("产品规模", scaleChart) : ""}
          ${section("产品条款", termsBody)}
        </div>
        <aside class="detail-column">
          ${section("产品信息", definitions([
            ["产品编码", product.source_product_id], ["备案号", product.registration_number],
            ["产品类型", product.product_type], ["组织 / 合同形式", product.legal_form || product.contract_type],
            ["产品状态", catalogRow.productStatus], ["销售状态", product.sale_status],
            ["风险等级", catalogRow.riskLevel], ["币种", product.currency],
            ["二级策略", product.strategy_l2], ["三级策略", product.strategy_l3],
            ["托管人", product.custodian_name], ["更新日期", P.formatDateTime(product.collected_at)],
          ]))}
          ${section("基金经理", managers)}
          ${section("管理人", companyBody)}
        </aside>
      </div>`;
    document.title = `${catalogRow.name || catalogRow.id}｜天眼私募`;
    document.body.dataset.ready = "true";
  }

  const detailPath = String(catalogRow.detailFile || "").split("/").map(encodeURIComponent).join("/");
  const releaseId = P.clean(window.__PRIVATE_FUND_MANIFEST__?.runId);
  const detailUrl = `./data/details/${detailPath}${releaseId ? `?v=${encodeURIComponent(releaseId)}` : ""}`;
  P.loadScript(detailUrl)
    .then(() => {
      const detail = window.__PRIVATE_FUND_DETAIL__;
      if (!detail || detail.key !== key) throw new Error("详情数据键与页面请求不一致");
      render(detail);
    })
    .catch(() => {
      root.innerHTML = '<section class="empty-panel">数据暂不可用</section>';
    });
})();
