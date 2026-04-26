# 医保对账差异归因与申诉草稿生成器

## 项目简介

本工具用于自动解析 HIS 结算数据与医保平台回传数据，逐条比对字段差异，并将差异归因到「规格型号/数量/单价/项目对照」等类别，生成结构化差异台账（Excel）和申诉函件草稿（Word）。

## 背景

在医院医保办日常工作中，HIS 结算数据与医保平台回传数据经常出现差异。手工对账费时费力，且容易出错。本工具旨在自动化这一流程，帮助医保办工作人员快速定位差异、归因分析、生成申诉材料。

## 核心功能

- **多格式支持**：支持 CSV、Excel、DBF 等 HIS 数据格式；支持医保平台标准回盘格式
- **字段映射**：通过 YAML 配置文件灵活定义 HIS 字段与医保平台字段的映射关系
- **差异比对**：逐条比对两条记录，精准定位差异字段
- **归因分类**：将差异归因到 5 种类型（规格型号差、数量差、单价差、项目对照差、其他）
- **多格式导出**：支持 Excel 台账、Word 申诉函、HTML 报告、JSON 结构化输出

## 安装

```bash
pip install -r requirements.txt
```

## 使用方法

### 基本用法

```bash
python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --output-dir reports/output
```

### 使用配置文件

```bash
python -m src.cli reconcile --config config/default.yaml
```

### 按归因类型筛选

```bash
python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --filter-type 数量差 --output-dir reports/output
```

### 详细日志模式

```bash
python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --verbose --output-dir reports/output
```

### 导出 JSON 差异摘要

```bash
python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --export-json --output-dir reports/output
```

## 输出文件

- `diffLedger.xlsx` - 差异台账（Excel）
- `appealLetter.docx` - 申诉函件草稿（Word）
- `diffReport.html` - HTML 交互式报告
- `diffSummary.json` - JSON 差异摘要（可选）

## 配置说明

### 字段映射配置

在 `config/field_mapping.yaml` 中定义 HIS 字段与医保平台字段的映射关系。

### 配置文件示例

项目支持通过 YAML 配置文件传入所有参数，示例见 `config/default.yaml`。

## 项目结构

```
medical-insurance-reconciliation/
├── src/
│   ├── adapters/          # 数据适配器
│   ├── config/            # 配置加载
│   ├── engine/            # 比对引擎
│   ├── reports/           # 报告生成
│   └── utils/             # 工具函数
├── tests/                 # 单元测试
├── data/                  # 示例数据
├── config/                # 配置文件
├── reports/              # 输出报告
├── requirements.txt
└── README.md
```

## 适用场景

- 医院医保办日常对账工作
- 月度/季度医保结算审核
- 医保差异申诉材料准备
- 质控部门数据核查

## 技术栈

- Python 3.x
- pandas - 数据处理
- openpyxl - Excel 操作
- python-docx - Word 文档生成
- fire - CLI 参数解析
- PyYAML - 配置文件解析

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
