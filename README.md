# 医保对账差异语义聚类分析器

## 项目简介

本工具用于分析医院 HIS 结算数据与医保平台回传数据之间的差异，通过语义聚类归因，帮助医保办人员快速定位差异原因，生成可视化的差异叙事报告。

**适用场景**：
- 医保办月度对账，发现「HIS 结算金额」与「医保回传金额」不一致
- 信息科排查接口传输问题，定位差异来源（是编码口径差还是业务差异）
- 科室绩效分析，统计各科室差异分布和金额
- 审计/迎检准备，快速生成差异台账和汇总报告

## 核心功能

- **数据导入**：支持 CSV 和 Excel 格式的 HIS 结算数据和医保回传数据
- **智能对齐**：按「患者ID + 就诊日期 + 医疗项目编码」三键对齐记录
- **差异分类**：基于规则的预分类层，识别金额差异、数量差异、系统口径差、手工冲销等
- **语义聚类**：调用 LLM API 对差异进行语义归因（支持 mock 模式，无需 API Key 即可体验）
- **双模式输出**：CLI 终端输出 + HTML 可视化报告

## 技术栈

- **运行时**：Node.js / TypeScript
- **数据处理**：papaparse (CSV)、xlsx (Excel)
- **CLI 框架**：commander.js
- **图表**：Chart.js

## 安装

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0

### 安装步骤

```bash
# 1. 进入项目目录
cd medical-insurance-reconciliation

# 2. 安装依赖
npm install

# 3. 编译 TypeScript
npm run build

# 4. 验证安装
npm start -- --help
```

### 快速体验（不配置 API Key）

无需配置任何 API Key，直接使用 mock 模式体验完整流程：

```bash
# 分析示例数据（mock 模式）
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --mock --output output/demo_result.json

# 生成 HTML 报告
npm start -- report output/demo_result.json --type detail --format html --output output/demo_report.html
```

## 使用方法

### analyze 命令 - 分析数据

**命令格式**：
```bash
reconcile analyze <hisFile> <insuranceFile> [options]

# 或通过 npm start
npm start -- analyze <hisFile> <insuranceFile> [options]
```

**主要选项**：
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--format` | 输入文件格式，可选 `csv` 或 `excel` | 自动检测 |
| `--output, -o` | 结果输出路径 | `output/result.json` |
| `--mapping` | 自定义字段映射配置文件路径 | 内置默认映射 |
| `--mode` | 分析模式：`full`（完整语义聚类）、`semantic`（仅语义聚类）、`fast`（仅规则分类） | `full` |
| `--mock` | 使用 mock LLM 模式，不调用真实 API | false |
| `--progress` | 显示详细进度信息 | false |

**使用示例**：

```bash
# 示例 1：基本分析（自动检测文件格式）
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --output output/result.json

# 示例 2：指定 Excel 格式
npm start -- analyze data/his_sample.xlsx data/insurance_sample.xlsx --format excel --output output/result.json

# 示例 3：使用 mock 模式（无需 API Key）
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --mock --output output/result.json

# 示例 4：仅快速规则分类（不调用 LLM）
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --mode fast --output output/result.json

# 示例 5：显示详细进度
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --progress --output output/result.json
```

### report 命令 - 生成报告

**命令格式**：
```bash
reconcile report <resultFile> [options]

# 或通过 npm start
npm start -- report <resultFile> [options]
```

**主要选项**：
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--type` | 报告类型：`summary`（摘要）、`detail`（明细）、`clusters`（聚类） | `summary` |
| `--format` | 输出格式：`html` 或 `json` | `html` |
| `--output, -o` | 报告输出路径 | `output/report.html` |

**使用示例**：

```bash
# 示例 1：生成摘要 HTML 报告
npm start -- report output/result.json --type summary --format html --output output/summary.html

# 示例 2：生成明细 HTML 报告（含所有差异记录）
npm start -- report output/result.json --type detail --format html --output output/detail.html

# 示例 3：生成聚类分析报告
npm start -- report output/result.json --type clusters --format html --output output/clusters.html

# 示例 4：生成 JSON 格式结果（便于程序二次处理）
npm start -- report output/result.json --type detail --format json --output output/result.json
```

### query 命令 - 查询差异

**命令格式**：
```bash
reconcile query <resultFile> [options]

# 或通过 npm start
npm start -- query <resultFile> [options]
```

**主要选项**：
| 选项 | 说明 |
|------|------|
| `--patient <id>` | 按患者ID查询 |
| `--cluster <type>` | 按语义聚类类别查询（如：药品规格不符、检查指征不符） |
| `--difference <type>` | 按差异类型查询（如：HIS高套、医保低付） |
| `--limit <n>` | 限制返回条数 |

**使用示例**：

```bash
# 示例 1：查询特定患者的所有差异记录
npm start -- query output/result.json --patient P001

# 示例 2：查询所有「药品规格不符」类别的差异
npm start -- query output/result.json --cluster 药品规格不符

# 示例 3：查询所有「HIS高套」类型的差异
npm start -- query output/result.json --difference HIS高套

# 示例 4：组合查询，限制返回条数
npm start -- query output/result.json --cluster 药品规格不符 --limit 10
```

## 配置说明

### 环境变量配置（.env）

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

`.env.example` 内容说明：

```bash
# OpenAI API Key（可选，不配置则使用 mock 模式）
OPENAI_API_KEY=your_api_key_here

# OpenAI API 兼容接口地址（可选，用于代理或兼容接口）
OPENAI_BASE_URL=https://api.openai.com/v1
```

**注意**：
- 若不配置 `OPENAI_API_KEY`，工具将以 mock 模式运行，返回预设分类结果
- mock 模式适合演示和测试，真实场景建议配置 API Key

### 字段映射配置

工具内置默认 HIS 和医保平台字段映射：

**HIS 字段映射**（标准 → 输入）：
| 标准字段 | 常见 HIS 字段名 |
|----------|----------------|
| patient_id | patient_id, patientid, 病历号, 患者ID |
| visit_date | visit_date, visitdate, 就诊日期, 日期 |
| item_code | item_code, itemcode, 项目编码, 收费编码 |
| item_name | item_name, itemname, 项目名称, 收费名称 |
| quantity | quantity, qty, 数量 |
| amount | amount, amt, 金额, 费用金额 |
| department | department, dept, 科室, 科室名称 |

**医保回传字段映射**：
| 标准字段 | 常见医保字段名 |
|----------|----------------|
| patient_id | patient_id, patientid, 病历号 |
| visit_date | visit_date, visitdate, 就诊日期 |
| item_code | item_code, itemcode, 项目编码 |
| amount | amount, amt, 申报金额 |
| pay_amount | pay_amount, 实付金额, 支付金额 |
| reject_reason | reject_reason, 拒付原因, 扣款原因 |

如需自定义映射，可创建 `config/field-mapping.json`：

```json
{
  "his": {
    "patient_id": "病历号",
    "visit_date": "结算日期",
    "item_code": "收费项目编码",
    "item_name": "收费项目名称",
    "quantity": "收费数量",
    "amount": "结算金额",
    "department": "开单科室"
  },
  "insurance": {
    "patient_id": "患者编号",
    "visit_date": "就医日期",
    "item_code": "医保项目编码",
    "amount": "医疗费总额",
    "pay_amount": "基金支付",
    "reject_reason": "扣除原因"
  }
}
```

## 输出文件

### 分析结果 JSON

`analyze` 命令输出的 JSON 文件结构：

```json
{
  "summary": {
    "totalRecords": 20,
    "matchedRecords": 12,
    "differenceRecords": 6,
    "missingHisRecords": 2,
    "missingInsuranceRecords": 1,
    "totalDifferenceAmount": 15230.50,
    "executionTime": "3.2s"
  },
  "differences": [
    {
      "id": "D001",
      "patientId": "P001",
      "visitDate": "2024-01-15",
      "itemCode": "A001",
      "itemName": "血常规检查",
      "hisAmount": 45.00,
      "insuranceAmount": 38.50,
      "differenceType": "金额差异",
      "differenceAmount": 6.50,
      "clusterResult": {
        "category": "药品规格不符",
        "reason": "可能涉及药品集中采购规格替换",
        "confidence": 0.85
      }
    }
  ],
  "clusters": [
    {
      "category": "药品规格不符",
      "count": 3,
      "totalAmount": 1250.00,
      "typicalCases": ["D001", "D003", "D005"]
    }
  ]
}
```

### HTML 报告

`report` 命令生成的 HTML 报告包含：

1. **执行摘要**：总差异条数、涉及金额、差异类型分布饼图
2. **科室分布**：各科室差异金额柱状图
3. **TOP10 差异明细**：金额最大的差异记录（患者信息脱敏）
4. **语义聚类结果**：各类别数量、金额、典型案例、归因说明
5. **附录**：差异类型说明

## 差异类型说明

| 类型 | 说明 | 可能原因 |
|------|------|----------|
| `HIS高套` | HIS金额 > 医保金额且非系统误差 | 大项目重复计费、超医保支付范围计费 |
| `医保低付` | 医保金额 < HIS金额 | 医保拒付、扣款、限价支付 |
| `数量差异` | 计费数量不一致 | 医嘱拆分计费差异、退费未同步 |
| `系统口径差` | 编码映射导致 | HIS编码与医保国家编码映射不一致 |
| `手工冲销` | 冲正记录 | 退费、红冲操作 |

## 语义聚类类别

LLM 会对差异进行语义归因，常见类别包括：

| 类别 | 说明 |
|------|------|
| 药品规格不符 | 药品集中采购规格替换、品牌差异 |
| 检查指征不符 | 大型检查未达医保审核条件 |
| 手术操作编码错误 | 手术编码与实际手术不符 |
| 病历记载与计费不符 | 病历描述与收费项目不匹配 |
| 系统传输丢包 | 接口数据传输丢失或延迟 |
| 其他 | 无法归类的特殊情况 |

## 常见问题（FAQ）

**Q: 运行时报错 "Cannot find module"**
```
确保已执行 `npm run build` 编译 TypeScript 代码。
```

**Q: 如何处理大文件（超过 10 万条记录）？**
```
建议使用 `--mode fast` 先做规则分类，语义聚类分批处理。
```

**Q: API Key 配置正确但仍返回 mock 结果？**
```
检查 .env 文件是否与项目根目录在同一位置，或显式设置环境变量：
export OPENAI_API_KEY=your_key
```

**Q: HTML 报告图表不显示？**
```
确保 Chart.js CDN 可访问，或使用 `--format json` 输出手动处理。
```

**Q: 如何自定义字段映射？**
```
创建 config/field-mapping.json，参考上文「字段映射配置」章节。
```

**Q: 支持哪些城市的医保格式？**
```
本工具不限定城市，通过字段映射适配任意 HIS 和医保平台格式。
```

## 项目结构

```
medical-insurance-reconciliation/
├── src/
│   ├── types/           # 类型定义
│   │   └── index.ts
│   ├── services/       # 核心服务
│   │   ├── csvImporter.ts        # CSV 导入
│   │   ├── excelImporter.ts      # Excel 导入
│   │   ├── fieldMapper.ts        # 字段映射
│   │   ├── aligner.ts            # 记录对齐
│   │   ├── differenceClassifier.ts # 差异分类
│   │   ├── semanticCluster.ts    # 语义聚类
│   │   ├── llmClient.ts          # LLM API 客户端
│   │   ├── reconciliationEngine.ts # 主引擎
│   │   └── htmlReporter.ts       # HTML 报告生成
│   ├── commands/       # CLI 命令
│   │   ├── analyze.ts
│   │   ├── report.ts
│   │   └── query.ts
│   └── utils/          # 工具函数
├── bin/
│   └── reconcile       # CLI 入口脚本
├── config/            # 配置文件
│   └── field-mapping.json
├── data/              # 示例数据
│   ├── his_sample.csv
│   └── insurance_sample.csv
├── output/            # 输出目录
├── templates/         # HTML 模板
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## License

ISC

---

## 支持作者

如果您觉得这个项目对您有帮助，欢迎打赏支持！
Wechat:gdgdmp
![Buy Me a Coffee](buymeacoffee.png)

**Buy me a coffee (crypto)**

| 币种 | 地址 |
|------|------|
| BTC | `bc1qc0f5tv577z7yt59tw8sqaq3tey98xehy32frzd` |
| ETH / USDT | `0x3b7b6c47491e4778157f0756102f134d05070704` |
| SOL | `6Xuk373zc6x6XWcAAuqvbWW92zabJdCmN3CSwpsVM6sd` |
