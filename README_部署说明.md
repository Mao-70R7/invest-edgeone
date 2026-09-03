# 最小发布集

本目录包含机构总览、策略列表、全市场产品排名、AI选策略，以及策略/基金详情下钻。策略对比保留为策略列表和 AI 选策略的下钻功能，不在一级菜单单独展示。

## 访问方式

GitHub Pages 会由 `.github/workflows/pages.yml` 自动部署。也可双击根目录 `启动最小发布集.cmd` 在本机启动静态站点：

```text
http://127.0.0.1:7676/basic_data/institutions.html
```

停止本机服务：双击根目录 `停止最小发布集.cmd`。

不要用 `file://` 直接打开页面。策略详情使用 gzip 按需加载，必须通过 HTTP 服务访问；GitHub Pages、Nginx、IIS 和本目录启动脚本都满足要求。

## AI 模型

AI 选策略默认调用内网 OpenAI 兼容服务 `inner-deepseek`，模型为 `qwen35-397b-a17b`。配置已随发布集写入 `basic_data/config`，不依赖本机 Codex 桥接。

GitHub Pages 是 HTTPS 页面，而当前内网模型地址是 HTTP。浏览器是否允许调用取决于内网服务的 HTTPS、CORS 和 Private Network Access 配置；不满足时页面仍可使用本地规则筛选，但模型解读会提示连接失败。生产稳定使用建议为该内网接口增加 HTTPS 反向代理并放行发布站点 Origin。

## 本机服务器

```powershell
python -X utf8 scripts/serve_basic_data_site.py --host 0.0.0.0 --port 7676 --directory .
```

## 数据范围

- 策略详情：1972 个。
- 策略源数据完整标记：1760 个；源数据不完整：212 个，页面保留真实缺失状态，不做推测补齐。
- 基金详情：最小发布集不发布基金详情页或单基金详情文件，避免文件数量超过托管上限；基金名称及策略持仓业务字段仍保留展示。
- 策略对比仓位快照：只保留每只策略最新有效快照，原始 522186 行，发布 136731 行；不影响当前配置对比和 AI 持仓筛选。
- 机构总览：按销售渠道和投顾管理人查看策略规模、调仓走势、基准风险资产权重及数据完整性。
- 详情文件采用确定性 gzip；必须通过 HTTP 服务访问，不能用 `file://` 直接打开。
- 发布清单及 SHA256：`deployment_manifest.json`。
- 功能与数据覆盖验收：`package_validation.json`。
