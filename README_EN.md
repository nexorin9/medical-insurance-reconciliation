# Medical Insurance Reconciliation Difference Attribution and Appeal Draft Generator

## Project Overview

This tool automatically parses HIS billing data and insurance platform returned data, compares field differences line by line, and attributes differences to categories such as "specification/model/quantity/unit price/item mapping". It generates structured difference ledgers (Excel) and appeal letter drafts (Word).

## Background

In the daily work of a hospital's Medical Insurance Office, differences frequently occur between HIS billing data and insurance platform returned data. Manual reconciliation is time-consuming and error-prone. This tool aims to automate this process, helping staff quickly locate differences, perform attribution analysis, and generate appeal materials.

## Core Features

- **Multi-format Support**: Supports CSV, Excel, DBF and other HIS data formats; supports insurance platform standard return formats
- **Field Mapping**: Flexibly define mapping between HIS fields and insurance platform fields via YAML configuration file
- **Difference Comparison**: Compare two records line by line, precisely locate difference fields
- **Attribution Classification**: Categorize differences into 5 types (spec/model difference, quantity difference, unit price difference, item mapping difference, other)
- **Multi-format Export**: Supports Excel ledger, Word appeal letter, HTML report, JSON structured output

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Basic Usage

```bash
python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --output-dir reports/output
```

### Using Configuration File

```bash
python -m src.cli reconcile --config config/default.yaml
```

### Filter by Attribution Type

```bash
python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --filter-type 数量差 --output-dir reports/output
```

### Verbose Logging Mode

```bash
python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --verbose --output-dir reports/output
```

### Export JSON Difference Summary

```bash
python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --export-json --output-dir reports/output
```

## Output Files

- `diffLedger.xlsx` - Difference ledger (Excel)
- `appealLetter.docx` - Appeal letter draft (Word)
- `diffReport.html` - HTML interactive report
- `diffSummary.json` - JSON difference summary (optional)

## Configuration

### Field Mapping Configuration

Define the mapping between HIS fields and insurance platform fields in `config/field_mapping.yaml`.

### Configuration File Example

The project supports passing all parameters via YAML configuration file. See `config/default.yaml` for an example.

## Project Structure

```
medical-insurance-reconciliation/
├── src/
│   ├── adapters/          # Data adapters
│   ├── config/            # Configuration loading
│   ├── engine/            # Comparison engine
│   ├── reports/           # Report generation
│   └── utils/             # Utility functions
├── tests/                 # Unit tests
├── data/                  # Sample data
├── config/                # Configuration files
├── reports/              # Output reports
├── requirements.txt
└── README.md
```

## Applicable Scenarios

- Hospital Medical Insurance Office daily reconciliation work
- Monthly/quarterly medical insurance settlement audit
- Medical insurance difference appeal material preparation
- Quality control department data verification

## Tech Stack

- Python 3.x
- pandas - Data processing
- openpyxl - Excel operations
- python-docx - Word document generation
- fire - CLI argument parsing
- PyYAML - Configuration file parsing

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
