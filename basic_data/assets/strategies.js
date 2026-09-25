(async () => {
  const B = window.BasicData;
  const summary = B.state.summary;
  const root = B.byId("strategyListPage");
  const allStrategies = summary.strategies || [];
  const benchmarkBucket = (row) => row?.基准风险资产权重 || "未分档";
  const isUnbucketed = (row) => benchmarkBucket(row) === "未分档";
  const state = {
    page: 1,
    pageSize: 10,
    rows: [],
    sortField: "近一月",
    sortDir: "desc",
    hiddenStrategyScope: "",
    incomingGlobalFiltersActive: Boolean(B.hasExplicitGlobalStrategyFilters),
    selectedIds: new Set(),
    selectionNotice: "",
    scatterX: "近1年",
    scatterY: "最大回撤",
    scatterFocus: true,
    scatterSelectedId: "",
  };
  const compareMaxCount = 5;
  const returnHeaders = B.strategyListFieldGroups.returns;
  const riskHeaders = B.strategyListFieldGroups.risks;
  const weightHeaders = B.strategyListFieldGroups.weights;
  const trailingHeaders = B.strategyListFieldGroups.trailing;
  const numericHeaders = new Set([...returnHeaders, ...riskHeaders, "夏普比率", ...weightHeaders, "调仓次数"]);
  const dateHeaders = B.strategyListFieldGroups.dates;
  const dateHeaderSet = new Set(dateHeaders);
  const riskOrder = ["R0 现金/超低波", "R1 低波", "R2 稳健收益", "R3 均衡稳健", "R4 均衡成长", "R5 权益/进取"];
  const reportTypeOrder = ["纯债型", "固收+型", "股债混合型", "股票型", "多元配置型"];
  const benchmarkBucketOrder = Array.from({ length: 11 }, (_, index) => `L${index}`);
  let scatterObserver = null;

  function formatDataSyncTime(value) {
    const text = String(value || "").trim();
    if (!text) return "未披露";
    const chinese = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})[:时](\d{1,2})/);
    if (chinese) {
      const [, year, month, day, hour, minute] = chinese;
      return `${year}年${month.padStart(2, "0")}月${day.padStart(2, "0")}日${hour.padStart(2, "0")}时${minute.padStart(2, "0")}分`;
    }
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{1,2})/);
    if (iso) {
      const [, year, month, day, hour, minute] = iso;
      return `${year}年${month.padStart(2, "0")}月${day.padStart(2, "0")}日${hour.padStart(2, "0")}时${minute.padStart(2, "0")}分`;
    }
    return text;
  }

  const dataSyncTime = formatDataSyncTime(summary?.overview?.数据刷新时间 || summary?.overview?.生成时间);

  function unique(field) {
    return [...new Set(allStrategies.map((row) => row[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function orderedUnique(field, order) {
    const values = [...new Set(allStrategies.map((row) => row[field]).filter(Boolean))];
    return values.sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b, "zh-CN");
    });
  }

  function options(values) {
    return values.map((value) => `<option value="${B.esc(value)}">${B.esc(value)}</option>`).join("");
  }

  function orderedBenchmarkBuckets() {
    return [...new Set(allStrategies.map((row) => benchmarkBucket(row)))].sort((a, b) => {
      const ai = benchmarkBucketOrder.indexOf(a);
      const bi = benchmarkBucketOrder.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b, "zh-CN");
    });
  }

  function filterControl(label, html, hint) {
    const tag = html.startsWith("<details") ? "div" : "label";
    return `<${tag} class="strategy-filter-field">
      <span>${B.esc(label)}</span>
      ${html}
      <em>${B.esc(hint)}</em>
    </${tag}>`;
  }

  function multiSelect(id, label, values) {
    return `<details id="${id}" class="strategy-multi" data-multi-filter data-label="${B.esc(label)}">
      <summary class="control" aria-label="${B.esc(label)}多选"><span>全部${B.esc(label)}</span><b aria-hidden="true">⌄</b></summary>
      <div class="strategy-multi-menu"><input class="control strategy-multi-search" type="search" placeholder="搜索${B.esc(label)}" aria-label="搜索${B.esc(label)}选项">
        <button type="button" class="strategy-multi-clear">清空选择 / 全部</button>
        <div class="strategy-multi-options">${values.map(value => `<label><input type="checkbox" value="${B.esc(value)}"><span>${B.esc(value)}</span></label>`).join("")}</div>
        <small>同一字段满足任一已选值即可</small></div></details>`;
  }

  function multiValues(id) {
    return [...B.byId(id).querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
  }

  function updateMultiLabel(id) {
    const control = B.byId(id), values = multiValues(id);
    const label = values.length ? `${values.slice(0, 2).join("、")}${values.length > 2 ? ` 等 ${values.length} 项` : ""}` : `全部${control.dataset.label}`;
    control.querySelector("summary span").textContent = label;
    control.querySelector("summary").title = values.join("、") || label;
  }

  function setMultiValues(id, values) {
    B.byId(id).querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = values.includes(input.value); });
    updateMultiLabel(id);
  }

  function bindMultiSelects() {
    root.querySelectorAll("[data-multi-filter]").forEach(control => {
      control.addEventListener("change", event => {
        if (event.target.type !== "checkbox") return;
        updateMultiLabel(control.id);
        resetPageAndRender();
      });
      control.querySelector(".strategy-multi-clear").addEventListener("click", () => {
        setMultiValues(control.id, []);
        resetPageAndRender();
      });
      const search = control.querySelector(".strategy-multi-search");
      const filterOptions = () => {
        const term = search.value.trim().toLocaleLowerCase();
        control.querySelectorAll(".strategy-multi-options label").forEach(label => { label.hidden = !label.textContent.toLocaleLowerCase().includes(term); });
      };
      search.addEventListener("input", event => { if (!event.isComposing) filterOptions(); });
      search.addEventListener("compositionend", filterOptions);
      control.addEventListener("keydown", event => {
        if (event.key === "Escape" && !event.isComposing) { control.open = false; control.querySelector("summary").focus(); }
      });
    });
    document.addEventListener("click", event => root.querySelectorAll("[data-multi-filter][open]").forEach(control => {
      if (!control.contains(event.target)) control.open = false;
    }));
  }

  function isGfStrategy(row) {
    return row?.是否广发 === "是" || row?.是否广发策略 === "是" || /广发基金|广发投顾|广发银行|广发证券/.test(`${row?.投顾机构 || ""} ${row?.渠道 || ""}`);
  }

  function isClientFacing(row) {
    const current = String(row?.天天当前对客展示 || "");
    const status = String(row?.天天展示状态 || "");
    return current !== "否" && !/非对客|不对客|隐藏|未展示|不展示/.test(status);
  }

  function isStoppedStrategy(row) {
    if (Number(row?.是否历史接口留档 || 0) === 1) return true;
    if (Number(row?.是否已停止 || 0) === 1) return true;
    const status = [row?.策略治理状态, row?.运作状态, row?.天天展示状态].filter(Boolean).join(" ");
    return /已停止|已终止|已下架|已清盘|期满|已止盈|非对客或已结束|stopped/i.test(status);
  }

  function lifecycleLabel(row) {
    return Number(row?.是否历史接口留档 || 0) === 1 ? "历史接口留档" : "已下架";
  }

  const productScopeLabels = {
    recommended: "默认优选",
    active: "当前运作",
    stopped: "已终止/历史留档",
    all: "全部产品",
  };

  function matchesProductScope(row, scope) {
    const stopped = isStoppedStrategy(row);
    if (scope === "all") return true;
    if (scope === "stopped") return stopped;
    if (scope === "active") return !stopped;
    const facts = B.strategyFilterFacts(row);
    return facts.benchmark && facts.performance && facts.history && facts.active;
  }

  function incomingGlobalFilterLabels() {
    return Object.entries(B.globalStrategyFilterDefinitions || {})
      .filter(([key]) => B.globalStrategyFilters?.[key])
      .map(([, config]) => config.label);
  }

  function incomingScopeHtml() {
    if (!state.incomingGlobalFiltersActive) return "";
    const labels = incomingGlobalFilterLabels();
    const description = labels.length
      ? labels.map((label) => `<span>${B.esc(label)}</span>`).join("")
      : "<span>未启用数据完整性条件</span>";
    return `<div class="mixed-incoming-scope strategy-incoming-scope"><b>从机构总览带入</b>${description}<small>仅本次链接访问生效，可随时清除后查询全量。</small><button id="clearIncomingScope" type="button">清除带入条件</button></div>`;
  }

  function numberValue(row, field) {
    if (row[field] === null || row[field] === undefined || String(row[field]).trim() === "" || typeof row[field] === "boolean") return null;
    const value = Number(row[field]);
    return Number.isFinite(value) ? value : null;
  }

  function compareField(a, b, field) {
    if (numericHeaders.has(field)) {
      const av = numberValue(a, field);
      const bv = numberValue(b, field);
      if (av === null && bv === null) return 0;
      if (av === null) return -1;
      if (bv === null) return 1;
      return av - bv;
    }
    if (field === B.strategyListInstitutionField) return B.strategyInstitutionText(a).localeCompare(B.strategyInstitutionText(b), "zh-CN");
    return String(a[field] || "").localeCompare(String(b[field] || ""), "zh-CN");
  }

  function applySortPreset(value) {
    const preset = {
      name: ["策略名称", "asc"],
      return: ["累计收益率", "desc"],
      week: ["近一周", "desc"],
      month: ["近一月", "desc"],
      quarter: ["近三月", "desc"],
      year: ["近1年", "desc"],
      drawdown: ["最大回撤", "asc"],
      volatility: ["波动率", "asc"],
      sharpe: ["夏普比率", "desc"],
      holdingDate: ["最新持仓日", "desc"],
      rebalance: ["最近调仓日", "desc"]
    }[value] || ["近一月", "desc"];
    state.sortField = preset[0];
    state.sortDir = preset[1];
  }

  function keywordText(row) {
    return [
      row.searchText,
      row.策略名称,
      row.策略代码,
      row.投顾机构,
      row.渠道,
      row.风险等级,
      row.研报产品类型,
      row.研报股票子类型,
      row.业务分类,
      benchmarkBucket(row),
      row.市场地域,
      row.主动被动,
      row.披露策略类型,
      row.天天当前对客展示,
      row.天天展示状态,
      row.策略治理状态,
      row.运作状态,
      isStoppedStrategy(row) ? lifecycleLabel(row) : "当前在架"
    ].join(" ").toLowerCase();
  }

  function sortHeader(field, cls = "") {
    const active = state.sortField === field;
    const arrow = active ? (state.sortDir === "asc" ? "▲" : "▼") : "↕";
    const label = B.strategyListHeaderLabel(field);
    return `<th class="${cls}"><span class="sort-head ${active ? "is-active" : ""}" role="button" tabindex="0" data-sort-field="${B.esc(field)}">${label}<span class="sort-arrow">${arrow}</span></span></th>`;
  }

  function formatCell(row, field) {
    if (field === "策略名称") {
      const stoppedBadge = isStoppedStrategy(row) ? `<span class="strategy-lifecycle-badge is-stopped">${B.esc(lifecycleLabel(row))}</span>` : "";
      const rankNote = isStoppedStrategy(row) ? '<div class="strategy-rank-note">不参与当前常规排名</div>' : "";
      return `<div class="strategy-name-line"><a class="link" href="./strategy.html?id=${encodeURIComponent(row.统一策略ID)}">${B.esc(row.策略名称 || "未命名策略")}</a>${stoppedBadge}</div><div class="small">策略代码 ${B.esc(row.策略代码 || "未披露")}</div>${rankNote}`;
    }
    if (field === B.strategyListInstitutionField) return `<span class="strategy-institution-value">${B.esc(B.strategyInstitutionText(row))}</span>`;
    if (returnHeaders.includes(field) || riskHeaders.includes(field)) return B.pctSigned(row[field]);
    if (weightHeaders.includes(field)) return B.pct(row[field]);
    if (field === "夏普比率") return B.fmt(row[field]);
    if (field === "最近调仓日" && !row[field]) return '<span class="value-muted">无历史调仓事件</span>';
    if (field === "业绩基准说明") return row[field] ? `<span class="small">${B.esc(row[field])}</span>` : '<span class="value-muted">未披露</span>';
    if (field === "基准风险资产权重") return B.esc(benchmarkBucket(row));
    return B.fmt(row[field]);
  }

  function syncScrollbars() {
    const wrap = B.byId("strategyTableWrap");
    const top = B.byId("topScrollbar");
    if (!wrap || !top) return;
    const inner = top.querySelector(".strategy-scrollbar-inner");
    inner.style.width = `${wrap.scrollWidth}px`;
    top.onscroll = () => { wrap.scrollLeft = top.scrollLeft; };
    wrap.onscroll = () => { top.scrollLeft = wrap.scrollLeft; };
  }

  function updateSelectionControls(pageRows = []) {
    const selectedCount = state.selectedIds.size;
    const count = B.byId("selectedStrategyCount");
    const compareButton = B.byId("strategyCompareButton");
    const clearButton = B.byId("clearStrategySelection");
    const hint = B.byId("strategySelectionHint");
    if (count) count.textContent = selectedCount.toLocaleString("zh-CN");
    if (compareButton) {
      compareButton.disabled = selectedCount < 2;
      compareButton.textContent = selectedCount >= 2 ? `策略对比（${selectedCount}）` : "策略对比";
    }
    if (clearButton) clearButton.disabled = selectedCount === 0;
    if (hint) {
      hint.textContent = state.selectionNotice || (selectedCount
        ? `已选择 ${selectedCount} 只，最多可对比 ${compareMaxCount} 只。`
        : `请勾选 2—${compareMaxCount} 只策略后进行对比。`);
    }
    const pageIds = pageRows.map((row) => String(row?.统一策略ID || "")).filter(Boolean);
    const pageSelectedCount = pageIds.filter((id) => state.selectedIds.has(id)).length;
    const selectPage = B.byId("selectPageStrategies");
    if (selectPage) {
      selectPage.checked = pageIds.length > 0 && pageSelectedCount === pageIds.length;
      selectPage.indeterminate = pageSelectedCount > 0 && pageSelectedCount < pageIds.length;
      selectPage.disabled = pageIds.length === 0;
    }
    const maxReached = selectedCount >= compareMaxCount;
    B.byId("strategyTableWrap")?.querySelectorAll("[data-strategy-select]").forEach((checkbox) => {
      const selected = state.selectedIds.has(checkbox.dataset.strategySelect || "");
      checkbox.checked = selected;
      checkbox.disabled = maxReached && !selected;
      checkbox.closest("tr")?.classList.toggle("is-selected-strategy", selected);
    });
  }

  function setStrategySelected(strategyId, selected) {
    if (!strategyId) return false;
    if (selected && !state.selectedIds.has(strategyId) && state.selectedIds.size >= compareMaxCount) {
      state.selectionNotice = `一次最多对比 ${compareMaxCount} 只策略，请先取消已选策略。`;
      return false;
    }
    if (selected) state.selectedIds.add(strategyId);
    else state.selectedIds.delete(strategyId);
    state.selectionNotice = "";
    return true;
  }

  function renderTable(rows) {
    const headers = B.strategyListHeaders;
    const wideFields = new Set([B.strategyListInstitutionField, "研报产品类型", "研报股票子类型", "风险等级", "业务分类", "主动被动", "披露策略类型", "天天当前对客展示", "天天展示状态", "基准风险资产权重", "基准可用状态", "业绩基准说明"]);
    const head = headers.map((field, index) => {
      const cls = index === 0 ? "sticky-name" : index === 1 ? "sticky-institution" : returnHeaders.includes(field) || riskHeaders.includes(field) || weightHeaders.includes(field) ? "narrow" : wideFields.has(field) ? "wide" : "";
      return sortHeader(field, cls);
    }).join("");
    const selectionHead = '<th class="sticky-select strategy-select-cell"><input id="selectPageStrategies" type="checkbox" aria-label="选择当前页策略"></th>';
    const body = rows.length ? rows.map((row) => {
      const strategyId = String(row?.统一策略ID || "");
      const rowClasses = [isStoppedStrategy(row) ? "is-stopped-strategy" : "", state.selectedIds.has(strategyId) ? "is-selected-strategy" : ""].filter(Boolean).join(" ");
      return `<tr class="${rowClasses}"><td class="sticky-select strategy-select-cell"><input type="checkbox" data-strategy-select="${B.esc(strategyId)}" aria-label="选择 ${B.esc(row.策略名称 || strategyId)}" ${state.selectedIds.has(strategyId) ? "checked" : ""}></td>${headers.map((field, index) => {
      const cls = index === 0 ? "sticky-name strategy-name-cell" : index === 1 ? "sticky-institution strategy-institution-cell" : returnHeaders.includes(field) || riskHeaders.includes(field) || weightHeaders.includes(field) ? "narrow" : wideFields.has(field) ? "wide" : "";
      return `<td class="${cls}">${formatCell(row, field)}</td>`;
      }).join("")}</tr>`;
    }).join("") : `<tr><td colspan="${headers.length + 1}"><div class="empty">暂无数据</div></td></tr>`;
    B.byId("strategyTableWrap").innerHTML = `<table class="strategy-table"><thead><tr>${selectionHead}${head}</tr></thead><tbody>${body}</tbody></table>`;
    B.byId("strategyTableWrap").querySelectorAll("[data-sort-field]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = button.dataset.sortField;
        if (state.sortField === field) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else {
          state.sortField = field;
          state.sortDir = field === "最大回撤" || field === "波动率" ? "asc" : numericHeaders.has(field) || dateHeaderSet.has(field) ? "desc" : "asc";
        }
        state.page = 1;
        render();
      });
    });
    B.byId("strategyTableWrap").querySelectorAll("[data-strategy-select]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const strategyId = checkbox.dataset.strategySelect || "";
        if (!setStrategySelected(strategyId, checkbox.checked)) checkbox.checked = false;
        updateSelectionControls(rows);
      });
    });
    B.byId("selectPageStrategies")?.addEventListener("change", (event) => {
      if (event.currentTarget.checked) {
        for (const row of rows) {
          if (state.selectedIds.size >= compareMaxCount) break;
          setStrategySelected(String(row?.统一策略ID || ""), true);
        }
        if (rows.some((row) => !state.selectedIds.has(String(row?.统一策略ID || "")))) {
          state.selectionNotice = `已达到 ${compareMaxCount} 只上限，当前页其余策略未勾选。`;
        }
      } else {
        rows.forEach((row) => setStrategySelected(String(row?.统一策略ID || ""), false));
      }
      updateSelectionControls(rows);
    });
    updateSelectionControls(rows);
    requestAnimationFrame(syncScrollbars);
  }

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><div><h2>策略产品业绩点阵</h2><p class="desc">一只策略一个点；筛选条件同时作用于点阵和列表。</p></div><span id="strategyScatterCount" class="pill"></span></div>
      <div id="strategyIncomingScope">${incomingScopeHtml()}</div>
      <details id="strategyFilterDisclosure" class="strategy-filter-disclosure" ${window.matchMedia("(max-width: 680px)").matches ? "" : "open"}><summary>筛选策略 <small id="strategyActiveFilters">全部分类</small></summary>
      <div class="filters strategy-filter-grid">
        ${filterControl("关键词", '<input id="searchInput" class="control" type="search" placeholder="策略、机构、代码、渠道、分类">', "模糊匹配：策略名称、代码、机构、渠道和分类字段")}
        ${filterControl("产品范围", `<select id="productStatusSelect" class="control">
          <option value="recommended" selected>默认优选（基准、业绩、仓位完整且未终止）</option>
          <option value="active">当前运作（含数据不完整）</option>
          <option value="stopped">已终止/已下架/历史留档</option>
          <option value="all">全部产品</option>
        </select>`, "这是可切换的初始预设；改选后直接从全库重新筛选")}
        ${filterControl("对客状态", `<select id="clientScopeSelect" class="control">
          <option value="">全部对客状态</option>
          <option value="client">对客展示</option>
          <option value="nonClient">非对客/隐藏</option>
        </select>`, "排除明确非对客、隐藏或不展示状态")}
        ${filterControl("基准风险资产权重", multiSelect("benchmarkBucketSelect", "基准风险资产权重", orderedBenchmarkBuckets()), "支持多选，按基准风险资产合计权重 L0—L10 分档")}
        ${filterControl("投顾机构", multiSelect("institutionSelect", "投顾机构", unique("投顾机构")), "支持多选，精确匹配已选机构")}
        ${filterControl("渠道", `<select id="channelSelect" class="control"><option value="">全部渠道</option>${options(unique("渠道"))}</select>`, "精确匹配数据来源渠道")}
        ${filterControl("研报产品类型", multiSelect("reportTypeSelect", "研报产品类型", orderedUnique("研报产品类型", reportTypeOrder)), "支持多选，按投研可比类型查询")}
        ${filterControl("业务分类", multiSelect("businessSelect", "业务分类", unique("业务分类")), "支持多选，按运营货架分类查询")}
        ${filterControl("排序", `<select id="sortSelect" class="control">
          <option value="name">按策略名称</option>
          <option value="return">按累计收益率</option>
          <option value="week">按近一周收益</option>
          <option value="month" selected>按近一月收益</option>
          <option value="quarter">按近三月收益</option>
          <option value="year">按近1年收益</option>
          <option value="drawdown">按最大回撤</option>
          <option value="volatility">按波动率</option>
          <option value="sharpe">按夏普比率</option>
          <option value="holdingDate">按最新持仓日</option>
          <option value="rebalance">按最近调仓日</option>
        </select>`, "只影响列表顺序，不改变筛选结果")}
        <button id="resetButton" class="control" type="button">重置</button>
      </div>
      <details class="filter-help-details">
        <summary>查看筛选字段说明</summary>
        <div class="filter-help-grid">
          <span><b>基准风险资产权重</b> 按业绩基准中的权益、商品和另类风险资产合计权重做 L0—L10 分档，是策略分类和同类比较的首层口径；基准缺失或无法可靠计算时标为未分档。</span>
          <span><b>研报产品类型</b> 投研可比池，适合同类业绩和风险比较。</span>
          <span><b>业务分类</b> 运营货架口径，适合产品线和销售场景管理。</span>
          <span><b>对客状态</b> 用于区分可对客展示产品和仅保留核验样本。</span>
          <span><b>产品范围</b> 初始为“默认优选”，即基准、业绩走势、历史仓位完整且未终止；切换为当前运作、已终止或全部产品时，直接从全库重新筛选，不再叠加默认优选条件。</span>
          <span><b>广发证券渠道</b> “财富管家”是当前产品目录，投顾机构列显示实际提供服务的基金投顾机构；“贝塔牛理财”是历史接口留档，不等同于当前财富管家产品。</span>
        </div>
      </details>
      </details>
      <div id="strategyScatterMount"></div>
      <div class="pager">
        <p id="resultCount" class="desc"></p>
        <div class="pager-controls">
          <label class="small">每页
            <select id="pageSizeSelect" class="control" style="width:84px"><option>10</option><option>20</option><option>50</option><option>100</option></select>
          </label>
          <button id="prevPage" type="button">上一页</button>
          <span id="pageInfo" class="small"></span>
          <button id="nextPage" type="button">下一页</button>
        </div>
      </div>
      <div class="strategy-compare-toolbar" aria-live="polite">
        <div>
          <strong>已选 <span id="selectedStrategyCount">0</span> 只策略</strong>
          <span id="strategySelectionHint">请勾选 2—${compareMaxCount} 只策略后进行对比。</span>
        </div>
        <div class="strategy-compare-actions">
          <button id="clearStrategySelection" class="ghost-button" type="button" disabled>清空选择</button>
          <button id="strategyCompareButton" class="strategy-compare-button" type="button" disabled>策略对比</button>
        </div>
      </div>
      <div class="strategy-table-shell">
        <div id="topScrollbar" class="strategy-scrollbar"><div class="strategy-scrollbar-inner"></div></div>
        <div id="strategyTableWrap" class="strategy-table-wrap"></div>
      </div>
    </section>
  `;

  const businessQuery = await window.BusinessQuery.create(allStrategies, row => String(row.统一策略ID), root);

  function scatterQuantile(values, fraction) {
    const sorted = values.slice().sort((a, b) => a - b);
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * fraction, index = Math.floor(position);
    return sorted[index] + (sorted[Math.min(index + 1, sorted.length - 1)] - sorted[index]) * (position - index);
  }

  function renderStrategyScatter(rows) {
    scatterObserver?.disconnect();
    const mount = B.byId("strategyScatterMount");
    const xFields = [...returnHeaders, "近6月", "年化收益"].filter((field, i, list) => list.indexOf(field) === i && allStrategies.some(row => numberValue(row, field) !== null));
    const yFields = ["最大回撤", "当前回撤", "波动率"];
    if (!xFields.includes(state.scatterX)) state.scatterX = xFields[0] || "近1年";
    const points = rows.map(row => {
      const y = numberValue(row, state.scatterY);
      return { row, id: String(row.统一策略ID), x: numberValue(row, state.scatterX), y: y === null ? null : Math.abs(y), gf: isGfStrategy(row) };
    }).filter(point => point.x !== null && point.y !== null);
    if (!points.some(point => point.id === state.scatterSelectedId)) state.scatterSelectedId = "";
    const missing = rows.length - points.length;
    B.byId("strategyScatterCount").textContent = `可绘制 ${points.length.toLocaleString("zh-CN")} · 指标暂缺 ${missing.toLocaleString("zh-CN")}`;
    const selectOptions = (fields, selected) => fields.map(field => `<option value="${B.esc(field)}" ${field === selected ? "selected" : ""}>${B.esc(field)}${field === "最大回撤" ? "幅度（全历史）" : field === "波动率" ? "（全历史）" : ""}</option>`).join("");
    mount.innerHTML = `<div class="strategy-scatter-controls">
      <label>X 轴 · 区间收益<select id="strategyScatterX" class="control">${selectOptions(xFields, state.scatterX)}</select></label>
      <label>Y 轴 · 风险指标<select id="strategyScatterY" class="control">${selectOptions(yFields, state.scatterY)}</select></label>
      <div class="strategy-scatter-view"><button id="strategyScatterFocus" type="button" aria-pressed="${state.scatterFocus}">聚焦主分布</button><button id="strategyScatterAll" type="button" aria-pressed="${!state.scatterFocus}">全样本</button></div>
    </div>
    <div class="strategy-scatter-legend"><span><i class="is-gf"></i>广发策略 ${points.filter(point => point.gf).length}</span><span><i></i>其他策略 ${points.filter(point => !point.gf).length}</span><span><i class="is-picked"></i>当前选中</span><small id="strategyScatterViewport"></small></div>
    <p class="strategy-scatter-note" id="strategyScatterMedian"></p>
    <div class="strategy-scatter-canvas-wrap"><canvas id="strategyScatterCanvas" tabindex="0" role="img" aria-label="策略收益风险点阵。用左右方向键或下方按钮选择产品，详情卡提供数值及详情链接。" data-point-count="${points.length}" data-missing-count="${missing}"></canvas><div id="strategyScatterTooltip" class="strategy-scatter-tooltip" hidden></div>${points.length ? "" : '<div class="strategy-scatter-empty">当前筛选下没有同时具备两个指标的策略；缺失产品仍保留在下方列表。</div>'}</div>
    <div class="strategy-scatter-bottom"><p class="small">缺指标 ${missing} 只，保留在列表中。虚线为全部可绘制样本中位数；右下方为相对高收益、低风险区域。聚焦只调整视窗，不改变列表或统计样本。</p><div><button id="strategyScatterPrev" type="button" ${points.length ? "" : "disabled"}>上一只</button><button id="strategyScatterNext" type="button" ${points.length ? "" : "disabled"}>下一只</button></div></div>
    <div id="strategyScatterDetail" class="strategy-scatter-detail" aria-live="polite"></div>
    <details class="strategy-scatter-method"><summary>日期与统计口径</summary><p class="small">点阵直接使用当前策略列表数据，不联网重算。最大回撤和波动率沿用全历史统计口径，并非 X 轴所选区间的风险指标；切换收益区间不会改变该风险口径。各策略最新业绩日见详情卡。空值不按 0 处理，指标齐全不代表产品适合投资。</p></details>`;
    const canvas = B.byId("strategyScatterCanvas"), ctx = canvas.getContext("2d");
    const tooltip = B.byId("strategyScatterTooltip");
    if (businessQuery.highlightColor) mount.querySelector('.strategy-scatter-legend').innerHTML = `<span><i style="background:${businessQuery.highlightColor}"></i>筛选命中产品 ${points.length}</span><span><i class="is-picked"></i>当前选中</span><small id="strategyScatterViewport"></small>`;
    mount.querySelector('canvas').dataset.queryHighlight = businessQuery.highlightColor || '';
    const medianX = scatterQuantile(points.map(point => point.x), .5), medianY = scatterQuantile(points.map(point => point.y), .5);
    const format = value => value === null ? "--" : `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%`;
    B.byId("strategyScatterMedian").textContent = points.length ? `样本中位数：${state.scatterX} ${format(medianX)} / ${state.scatterY}幅度 ${format(medianY)}` : "当前无有效坐标";
    let hitPoints = [], width = 0, height = 0;
    const detail = () => {
      const point = points.find(item => item.id === state.scatterSelectedId);
      B.byId("strategyScatterDetail").innerHTML = point
        ? `<div><strong>${B.esc(point.row.策略名称)}</strong><span>${B.esc(B.strategyInstitutionText(point.row))} · ${B.esc(benchmarkBucket(point.row))}</span></div><dl><div><dt>${B.esc(state.scatterX)}</dt><dd>${format(point.x)}</dd></div><div><dt>${B.esc(state.scatterY)}幅度</dt><dd>${format(point.y)}</dd></div><div><dt>最新业绩日</dt><dd>${B.esc(point.row.最新业绩日期 || point.row.最新业绩日 || "未披露")}</dd></div></dl><a class="link" href="./strategy.html?id=${encodeURIComponent(point.id)}">查看策略详情 ↗</a>`
        : '<span class="small">点击点阵中的策略，或用上一只 / 下一只查看指标与详情。也可通过下方列表查看缺指标产品。</span>';
    };
    const draw = () => {
      if (!ctx || !canvas.isConnected) return;
      width = Math.max(260, canvas.parentElement.getBoundingClientRect().width);
      height = width < 600 ? 330 : 420;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const pad = { left: 58, right: 18, top: 34, bottom: 42 }, pw = width - pad.left - pad.right, ph = height - pad.top - pad.bottom;
      const domain = (values, positive) => {
        if (!values.length) return [0, 1];
        const trim = state.scatterFocus && values.length >= 20;
        let lo = scatterQuantile(values, trim ? .02 : 0), hi = scatterQuantile(values, trim ? .98 : 1);
        const margin = (hi - lo || Math.max(Math.abs(hi) * .2, 1)) * .09;
        lo -= margin; hi += margin;
        return [positive ? Math.max(0, lo) : lo, hi];
      };
      const [xmin, xmax] = domain(points.map(point => point.x), false), [ymin, ymax] = domain(points.map(point => point.y), true);
      const sx = value => pad.left + (value - xmin) / (xmax - xmin) * pw;
      const sy = value => pad.top + ph - (value - ymin) / (ymax - ymin) * ph;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(pad.left, pad.top, pw, ph);
      if (medianX !== null && medianY !== null) {
        ctx.fillStyle = "rgba(179,63,70,.045)";
        ctx.fillRect(sx(medianX), sy(medianY), pad.left + pw - sx(medianX), pad.top + ph - sy(medianY));
      }
      ctx.font = '11px "Microsoft YaHei",sans-serif'; ctx.lineWidth = 1;
      const ticks = width < 500 ? 3 : 4;
      for (let i = 0; i <= ticks; i++) {
        const x = pad.left + pw * i / ticks, y = pad.top + ph * i / ticks;
        ctx.strokeStyle = "#e8ecef"; ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + ph); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
        ctx.fillStyle = "#657583"; ctx.textAlign = "center"; ctx.fillText(format(xmin + (xmax - xmin) * i / ticks), x, height - 24);
        ctx.textAlign = "right"; ctx.fillText(format(ymax - (ymax - ymin) * i / ticks), pad.left - 7, y + 4);
      }
      if (points.length) {
        ctx.strokeStyle = "#6c7e8a"; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(sx(medianX), pad.top); ctx.lineTo(sx(medianX), pad.top + ph); ctx.moveTo(pad.left, sy(medianY)); ctx.lineTo(pad.left + pw, sy(medianY)); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.textAlign = "left"; ctx.fillStyle = "#334c5e"; ctx.fillText(`${state.scatterY}幅度 (%)`, pad.left, 17);
      ctx.textAlign = "center"; ctx.fillText(`${state.scatterX} (%)`, pad.left + pw / 2, height - 5);
      hitPoints = points.filter(point => point.x >= xmin && point.x <= xmax && point.y >= ymin && point.y <= ymax).map(point => ({ ...point, px: sx(point.x), py: sy(point.y) }));
      // Selected and highlighted products are painted last, without changing the sample.
      hitPoints.slice().sort((a, b) => Number(a.gf) - Number(b.gf)).forEach(point => {
        ctx.fillStyle = businessQuery.highlightColor || (point.gf ? "#b33f46" : "rgba(117,137,149,.40)");
        ctx.beginPath(); ctx.arc(point.px, point.py, businessQuery.highlightColor || point.gf ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
      });
      const selected = hitPoints.find(point => point.id === state.scatterSelectedId);
      if (selected) { ctx.strokeStyle = "#173344"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(selected.px, selected.py, 7, 0, Math.PI * 2); ctx.stroke(); }
      canvas.dataset.visibleCount = String(hitPoints.length);
      B.byId("strategyScatterViewport").textContent = `${state.scatterFocus ? "主分布" : "全样本"}视图 · 视窗内 ${hitPoints.length} / 视窗外 ${points.length - hitPoints.length}`;
    };
    const pick = id => { state.scatterSelectedId = id; detail(); draw(); };
    const step = direction => {
      if (!points.length) return;
      const index = points.findIndex(point => point.id === state.scatterSelectedId);
      pick(points[(index + direction + points.length) % points.length].id);
    };
    const nearest = event => {
      const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) * width / rect.width, y = (event.clientY - rect.top) * height / rect.height;
      let nearestPoint = null, distance = event.pointerType === "touch" ? 24 ** 2 : 13 ** 2;
      for (const point of hitPoints) { const d = (point.px - x) ** 2 + (point.py - y) ** 2; if (d <= distance) { distance = d; nearestPoint = point; } }
      return nearestPoint;
    };
    canvas.addEventListener("pointermove", event => {
      const point = nearest(event); tooltip.hidden = !point;
      if (!point) return;
      tooltip.textContent = `${point.row.策略名称} · ${state.scatterX} ${format(point.x)} · ${state.scatterY} ${format(point.y)}`;
      tooltip.style.left = `${Math.min(point.px + 10, Math.max(0, width - 270))}px`; tooltip.style.top = `${Math.max(0, point.py - 50)}px`;
    });
    canvas.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    canvas.addEventListener("click", event => { const point = nearest(event); if (point) pick(point.id); });
    canvas.addEventListener("keydown", event => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); step(event.key === "ArrowRight" ? 1 : -1); } });
    B.byId("strategyScatterPrev").onclick = () => step(-1);
    B.byId("strategyScatterNext").onclick = () => step(1);
    B.byId("strategyScatterX").onchange = event => { state.scatterX = event.target.value; renderStrategyScatter(state.rows); };
    B.byId("strategyScatterY").onchange = event => { state.scatterY = event.target.value; renderStrategyScatter(state.rows); };
    B.byId("strategyScatterFocus").onclick = () => { state.scatterFocus = true; renderStrategyScatter(state.rows); };
    B.byId("strategyScatterAll").onclick = () => { state.scatterFocus = false; renderStrategyScatter(state.rows); };
    detail(); draw();
    if (window.ResizeObserver) { scatterObserver = new ResizeObserver(draw); scatterObserver.observe(canvas.parentElement); }
  }

  function filterRows() {
    const keyword = B.byId("searchInput").value.trim().toLowerCase();
    const productStatus = B.byId("productStatusSelect").value;
    const clientScope = B.byId("clientScopeSelect").value;
    const benchmarkBucketValues = multiValues("benchmarkBucketSelect");
    const institutions = multiValues("institutionSelect");
    const channel = B.byId("channelSelect").value;
    const reportTypes = multiValues("reportTypeSelect");
    const businesses = multiValues("businessSelect");
    return businessQuery.apply(allStrategies).filter((row) => {
      if (!matchesProductScope(row, productStatus)) return false;
      if (state.incomingGlobalFiltersActive && !B.matchesGlobalStrategyFilters(row)) return false;
      if (state.hiddenStrategyScope === "gf" && !isGfStrategy(row)) return false;
      if (state.hiddenStrategyScope === "nonGf" && isGfStrategy(row)) return false;
      if (clientScope === "client" && !isClientFacing(row)) return false;
      if (clientScope === "nonClient" && isClientFacing(row)) return false;
      if (benchmarkBucketValues.length && !benchmarkBucketValues.includes(benchmarkBucket(row))) return false;
      if (institutions.length && !institutions.includes(row.投顾机构)) return false;
      if (channel && row.渠道 !== channel) return false;
      if (reportTypes.length && !reportTypes.includes(row.研报产品类型)) return false;
      if (businesses.length && !businesses.includes(row.业务分类)) return false;
      if (keyword && !keywordText(row).includes(keyword)) return false;
      return true;
    });
  }

  function render() {
    const rows = filterRows().sort((a, b) => {
      const compared = compareField(a, b, state.sortField);
      return state.sortDir === "asc" ? compared : -compared;
    });
    state.rows = rows;
    businessQuery.describe(rows.length);
    renderStrategyScatter(rows);
    const activeLabels = [...root.querySelectorAll("[data-multi-filter]")].filter(control => multiValues(control.id).length).map(control => control.querySelector("summary span").textContent);
    B.byId("strategyActiveFilters").textContent = `${rows.length.toLocaleString("zh-CN")} 只 · ${activeLabels.join(" / ") || "全部分类"}`;
    const maxPage = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.min(state.page, maxPage);
    const pageRows = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    const gfCount = rows.filter(isGfStrategy).length;
    const clientCount = rows.filter(isClientFacing).length;
    const stoppedCount = rows.filter((row) => isStoppedStrategy(row) && Number(row?.是否历史接口留档 || 0) !== 1).length;
    const legacyCount = rows.filter((row) => Number(row?.是否历史接口留档 || 0) === 1).length;
    const scopeText = state.hiddenStrategyScope === "gf" ? "｜证据范围 广发策略" : (state.hiddenStrategyScope === "nonGf" ? "｜证据范围 非广发策略" : "");
    const unbucketedCount = rows.filter(isUnbucketed).length;
    const productScope = B.byId("productStatusSelect").value || "recommended";
    const productScopeCount = allStrategies.filter((row) => matchesProductScope(row, productScope)).length;
    const effectiveScopeCount = allStrategies.filter((row) => matchesProductScope(row, productScope)
      && (!state.incomingGlobalFiltersActive || B.matchesGlobalStrategyFilters(row))).length;
    const incomingScopeText = state.incomingGlobalFiltersActive ? `｜带入条件后 ${effectiveScopeCount.toLocaleString("zh-CN")} 条` : "";
    const resultCount = B.byId("resultCount");
    resultCount.textContent = `当前筛选 ${rows.length.toLocaleString("zh-CN")} 条策略｜全库 ${allStrategies.length.toLocaleString("zh-CN")} 条｜产品范围“${productScopeLabels[productScope] || productScopeLabels.recommended}” ${productScopeCount.toLocaleString("zh-CN")} 条${incomingScopeText}｜已下架/已结束 ${stoppedCount.toLocaleString("zh-CN")} 条，历史接口留档 ${legacyCount.toLocaleString("zh-CN")} 条，未分档 ${unbucketedCount.toLocaleString("zh-CN")} 条，广发 ${gfCount.toLocaleString("zh-CN")} 条，对客 ${clientCount.toLocaleString("zh-CN")} 条${scopeText}`;
    const syncTime = document.createElement("span");
    syncTime.className = "strategy-data-sync-time";
    syncTime.style.cssText = "color:var(--pos);font-weight:800;margin-left:10px;white-space:nowrap";
    syncTime.textContent = `最近一次数据同步：${dataSyncTime}`;
    resultCount.appendChild(syncTime);
    B.byId("pageInfo").textContent = `${state.page} / ${maxPage}`;
    B.byId("prevPage").disabled = state.page <= 1;
    B.byId("nextPage").disabled = state.page >= maxPage;
    renderTable(pageRows);
  }

  function resetPageAndRender() {
    state.page = 1;
    render();
  }

  function setControlFromParam(controlId, paramName = controlId) {
    const value = B.params().get(paramName);
    if (!value) return;
    const el = B.byId(controlId);
    if (!el) return;
    if (el.matches("[data-multi-filter]")) {
      setMultiValues(controlId, B.params().getAll(paramName).flatMap(item => item.split(",")).filter(Boolean));
      return;
    }
    const found = [...el.options || []].some((option) => option.value === value || option.textContent === value);
    if (found) el.value = value;
  }

  function applyInitialParams() {
    const params = B.params();
    if (params.get("q")) B.byId("searchInput").value = params.get("q");
    state.hiddenStrategyScope = params.get("strategyScope") || state.hiddenStrategyScope;
    if (state.incomingGlobalFiltersActive && !params.has("productStatus")) {
      B.byId("productStatusSelect").value = "all";
    }
    setControlFromParam("productStatusSelect", "productStatus");
    setControlFromParam("clientScopeSelect", "clientScope");
    setControlFromParam("benchmarkBucketSelect", "riskWeight");
    if (!multiValues("benchmarkBucketSelect").length) setControlFromParam("benchmarkBucketSelect", "benchmarkBucket");
    setControlFromParam("institutionSelect", "institution");
    setControlFromParam("channelSelect", "channel");
    setControlFromParam("reportTypeSelect", "reportType");
    setControlFromParam("businessSelect", "business");
    if (params.get("sort")) {
      B.byId("sortSelect").value = params.get("sort");
      applySortPreset(params.get("sort"));
    }
    const pageSize = Number(params.get("pageSize"));
    if ([10, 20, 50, 100].includes(pageSize)) {
      B.byId("pageSizeSelect").value = String(pageSize);
      state.pageSize = pageSize;
    }
  }

  function clearIncomingGlobalFilters() {
    if (!state.incomingGlobalFiltersActive) return;
    state.incomingGlobalFiltersActive = false;
    Object.keys(B.globalStrategyFilters || {}).forEach((key) => { B.globalStrategyFilters[key] = false; });
    const target = new URL(window.location.href);
    Object.values(B.globalStrategyFilterDefinitions || {}).forEach((config) => target.searchParams.delete(config.param));
    window.history.replaceState({}, "", `${target.pathname}${target.search}${target.hash}`);
    const container = B.byId("strategyIncomingScope");
    if (container) container.innerHTML = "";
  }

  applyInitialParams();
  bindMultiSelects();
  B.byId("clearIncomingScope")?.addEventListener("click", () => {
    clearIncomingGlobalFilters();
    resetPageAndRender();
  });
  ["searchInput", "productStatusSelect", "clientScopeSelect", "channelSelect"].forEach((id) => {
    B.byId(id).addEventListener("input", event => { if (!event.isComposing) resetPageAndRender(); });
  });
  B.byId("searchInput").addEventListener("compositionend", resetPageAndRender);
  B.byId("sortSelect").addEventListener("input", () => {
    applySortPreset(B.byId("sortSelect").value);
    resetPageAndRender();
  });
  B.byId("pageSizeSelect").addEventListener("change", () => {
    state.pageSize = Number(B.byId("pageSizeSelect").value);
    resetPageAndRender();
  });
  B.byId("prevPage").addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    render();
  });
  B.byId("nextPage").addEventListener("click", () => {
    state.page += 1;
    render();
  });
  B.byId("clearStrategySelection").addEventListener("click", () => {
    state.selectedIds.clear();
    state.selectionNotice = "";
    updateSelectionControls(state.rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize));
  });
  B.byId("strategyCompareButton").addEventListener("click", () => {
    if (state.selectedIds.size < 2) return;
    const params = new URLSearchParams();
    params.set("compare", [...state.selectedIds].join(","));
    window.location.href = `./compare.html?${params.toString()}`;
  });
  B.byId("resetButton").addEventListener("click", () => {
    businessQuery.clear();
    B.byId("searchInput").value = "";
    B.byId("productStatusSelect").value = "recommended";
    B.byId("clientScopeSelect").value = "";
    setMultiValues("benchmarkBucketSelect", []);
    setMultiValues("institutionSelect", []);
    B.byId("channelSelect").value = "";
    setMultiValues("reportTypeSelect", []);
    setMultiValues("businessSelect", []);
    B.byId("sortSelect").value = "month";
    B.byId("pageSizeSelect").value = "10";
    state.hiddenStrategyScope = "";
    clearIncomingGlobalFilters();
    applySortPreset("month");
    state.pageSize = 10;
    resetPageAndRender();
  });
  render();
})();
