# Medical Insurance Reconciliation Difference Semantic Clustering Analyzer

## Project Overview

This tool analyzes discrepancies between hospital HIS settlement data and medical insurance platform callback data. Through semantic clustering and attribution, it helps medical insurance office staff quickly identify the causes of differences and generate visual difference narrative reports.

**Applicable Scenarios**:
- Monthly reconciliation for medical insurance office, discovering inconsistencies between "HIS settlement amount" and "insurance callback amount"
- Information department troubleshooting interface transmission issues, locating the source of differences (code caliber difference vs. business difference)
- Department performance analysis, statistics on difference distribution and amounts by department
- Audit/inspection preparation, quickly generating difference ledgers and summary reports

## Core Features

- **Data Import**: Supports CSV and Excel format HIS settlement data and insurance callback data
- **Smart Alignment**: Aligns records by "Patient ID + Visit Date + Medical Item Code" as three keys
- **Difference Classification**: Rule-based pre-classification layer, identifying amount differences, quantity differences, system caliber differences, manual reversals, etc.
- **Semantic Clustering**: Calls LLM API for semantic attribution of differences (supports mock mode, no API Key required for体验)
- **Dual Mode Output**: CLI terminal output + HTML visualization report

## Tech Stack

- **Runtime**: Node.js / TypeScript
- **Data Processing**: papaparse (CSV), xlsx (Excel)
- **CLI Framework**: commander.js
- **Charts**: Chart.js

## Installation

### Environment Requirements

- Node.js >= 16.0.0
- npm >= 8.0.0

### Installation Steps

```bash
# 1. Navigate to project directory
cd medical-insurance-reconciliation

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Verify installation
npm start -- --help
```

### Quick Start (Without API Key)

No API Key configuration required, use mock mode to experience the full workflow:

```bash
# Analyze sample data (mock mode)
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --mock --output output/demo_result.json

# Generate HTML report
npm start -- report output/demo_result.json --type detail --format html --output output/demo_report.html
```

## Usage

### analyze Command - Data Analysis

**Command Format**:
```bash
reconcile analyze <hisFile> <insuranceFile> [options]

# Or via npm start
npm start -- analyze <hisFile> <insuranceFile> [options]
```

**Main Options**:
| Option | Description | Default |
|--------|-------------|---------|
| `--format` | Input file format, `csv` or `excel` | Auto-detect |
| `--output, -o` | Result output path | `output/result.json` |
| `--mapping` | Custom field mapping config file path | Built-in default mapping |
| `--mode` | Analysis mode: `full` (full semantic clustering), `semantic` (semantic only), `fast` (rules only) | `full` |
| `--mock` | Use mock LLM mode, no real API calls | false |
| `--progress` | Show detailed progress info | false |

**Usage Examples**:

```bash
# Example 1: Basic analysis (auto-detect file format)
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --output output/result.json

# Example 2: Specify Excel format
npm start -- analyze data/his_sample.xlsx data/insurance_sample.xlsx --format excel --output output/result.json

# Example 3: Use mock mode (no API Key required)
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --mock --output output/result.json

# Example 4: Fast rules-only classification (no LLM calls)
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --mode fast --output output/result.json

# Example 5: Show detailed progress
npm start -- analyze data/his_sample.csv data/insurance_sample.csv --progress --output output/result.json
```

### report Command - Generate Reports

**Command Format**:
```bash
reconcile report <resultFile> [options]

# Or via npm start
npm start -- report <resultFile> [options]
```

**Main Options**:
| Option | Description | Default |
|--------|-------------|---------|
| `--type` | Report type: `summary`, `detail`, `clusters` | `summary` |
| `--format` | Output format: `html` or `json` | `html` |
| `--output, -o` | Report output path | `output/report.html` |

**Usage Examples**:

```bash
# Example 1: Generate summary HTML report
npm start -- report output/result.json --type summary --format html --output output/summary.html

# Example 2: Generate detail HTML report (all difference records)
npm start -- report output/result.json --type detail --format html --output output/detail.html

# Example 3: Generate cluster analysis report
npm start -- report output/result.json --type clusters --format html --output output/clusters.html

# Example 4: Generate JSON format result (for programmatic processing)
npm start -- report output/result.json --type detail --format json --output output/result.json
```

### query Command - Query Differences

**Command Format**:
```bash
reconcile query <resultFile> [options]

# Or via npm start
npm start -- query <resultFile> [options]
```

**Main Options**:
| Option | Description |
|--------|-------------|
| `--patient <id>` | Query by patient ID |
| `--cluster <type>` | Query by semantic cluster category (e.g., drug specification mismatch) |
| `--difference <type>` | Query by difference type (e.g., HIS overcharging, insurance underpayment) |
| `--limit <n>` | Limit number of results |

**Usage Examples**:

```bash
# Example 1: Query all difference records for a specific patient
npm start -- query output/result.json --patient P001

# Example 2: Query all differences in "drug specification mismatch" category
npm start -- query output/result.json --cluster 药品规格不符

# Example 3: Query all differences of "HIS overcharging" type
npm start -- query output/result.json --difference HIS高套

# Example 4: Combined query with result limit
npm start -- query output/result.json --cluster 药品规格不符 --limit 10
```

## Configuration

### Environment Variable Configuration (.env)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

`.env.example` content description:

```bash
# OpenAI API Key (optional, without config uses mock mode)
OPENAI_API_KEY=your_api_key_here

# OpenAI API compatible endpoint (optional, for proxy or compatible endpoints)
OPENAI_BASE_URL=https://api.openai.com/v1
```

**Note**:
- If `OPENAI_API_KEY` is not configured, the tool runs in mock mode and returns preset classification results
- Mock mode is suitable for demo and testing; real scenarios recommend configuring API Key

### Field Mapping Configuration

The tool has built-in default HIS and insurance platform field mappings:

**HIS Field Mapping** (Standard → Input):
| Standard Field | Common HIS Field Names |
|----------------|------------------------|
| patient_id | patient_id, patientid, 病历号, 患者ID |
| visit_date | visit_date, visitdate, 就诊日期, 日期 |
| item_code | item_code, itemcode, 项目编码, 收费编码 |
| item_name | item_name, itemname, 项目名称, 收费名称 |
| quantity | quantity, qty, 数量 |
| amount | amount, amt, 金额, 费用金额 |
| department | department, dept, 科室, 科室名称 |

**Insurance Callback Field Mapping**:
| Standard Field | Common Insurance Field Names |
|----------------|------------------------------|
| patient_id | patient_id, patientid, 病历号 |
| visit_date | visit_date, visitdate, 就诊日期 |
| item_code | item_code, itemcode, 项目编码 |
| amount | amount, amt, 申报金额 |
| pay_amount | pay_amount, 实付金额, 支付金额 |
| reject_reason | reject_reason, 拒付原因, 扣款原因 |

To customize mapping, create `config/field-mapping.json`:

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

## Output Files

### Analysis Result JSON

JSON structure output by `analyze` command:

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

### HTML Report

HTML report generated by `report` command includes:

1. **Executive Summary**: Total difference count, involved amounts, difference type distribution pie chart
2. **Department Distribution**: Difference amount bar chart by department
3. **TOP10 Difference Details**: Records with largest difference amounts (patient info anonymized)
4. **Semantic Clustering Results**: Category counts, amounts, typical cases, attribution explanations
5. **Appendix**: Difference type descriptions

## Difference Type Description

| Type | Description | Possible Causes |
|------|-------------|-----------------|
| `HIS高套` | HIS amount > Insurance amount and not system error | Duplicate billing of large items, billing outside medical insurance payment scope |
| `医保低付` | Insurance amount < HIS amount | Insurance rejection, deduction, price-limited payment |
| `数量差异` | Billing quantity inconsistency | Order split billing difference, refund not synced |
| `系统口径差` | Code mapping cause | HIS code vs. insurance national code mapping inconsistency |
| `手工冲销` | Reversal record | Refund, red-write operation |

## Semantic Clustering Categories

LLM performs semantic attribution on differences, common categories include:

| Category | Description |
|----------|-------------|
| 药品规格不符 | Drug centralized procurement specification replacement, brand difference |
| 检查指征不符 | Large examinations not meeting insurance audit conditions |
| 手术操作编码错误 | Surgery code doesn't match actual surgery |
| 病历记载与计费不符 | Medical record description doesn't match billing item |
| 系统传输丢包 | Interface data transmission loss or delay |
| 其他 | Unclassifiable special cases |

## FAQ

**Q: Error "Cannot find module" when running**
```
Make sure you have executed `npm run build` to compile TypeScript code.
```

**Q: How to handle large files (over 100,000 records)?**
```
Recommend using `--mode fast` for rules classification first, semantic clustering in batches.
```

**Q: API Key configured correctly but still returns mock results?**
```
Check if .env file is in the same directory as project root, or explicitly set environment variable:
export OPENAI_API_KEY=your_key
```

**Q: HTML report charts not displaying?**
```
Ensure Chart.js CDN is accessible, or use `--format json` for manual processing.
```

**Q: How to customize field mapping?**
```
Create config/field-mapping.json, refer to "Field Mapping Configuration" section above.
```

**Q: Which city's medical insurance formats are supported?**
```
This tool is not limited to specific cities; it adapts to any HIS and medical insurance platform format through field mapping.
```

## Project Structure

```
medical-insurance-reconciliation/
├── src/
│   ├── types/           # Type definitions
│   │   └── index.ts
│   ├── services/       # Core services
│   │   ├── csvImporter.ts        # CSV import
│   │   ├── excelImporter.ts      # Excel import
│   │   ├── fieldMapper.ts        # Field mapping
│   │   ├── aligner.ts            # Record alignment
│   │   ├── differenceClassifier.ts # Difference classification
│   │   ├── semanticCluster.ts    # Semantic clustering
│   │   ├── llmClient.ts          # LLM API client
│   │   ├── reconciliationEngine.ts # Main engine
│   │   └── htmlReporter.ts       # HTML report generation
│   ├── commands/       # CLI commands
│   │   ├── analyze.ts
│   │   ├── report.ts
│   │   └── query.ts
│   └── utils/          # Utilities
├── bin/
│   └── reconcile       # CLI entry script
├── config/            # Config files
│   └── field-mapping.json
├── data/              # Sample data
│   ├── his_sample.csv
│   └── insurance_sample.csv
├── output/            # Output directory
├── templates/         # HTML templates
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## License

ISC

---

## Support the Author

If you find this project helpful, feel free to buy me a coffee! ☕

![Buy Me a Coffee](buymeacoffee.png)

**Buy me a coffee (crypto)**

| Chain | Address |
|-------|---------|
| BTC | `bc1qc0f5tv577z7yt59tw8sqaq3tey98xehy32frzd` |
| ETH / USDT | `0x3b7b6c47491e4778157f0756102f134d05070704` |
| SOL | `6Xuk373zc6x6XWcAAuqvbWW92zabJdCmN3CSwpsVM6sd` |
