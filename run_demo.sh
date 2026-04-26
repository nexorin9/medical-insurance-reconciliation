#!/bin/bash
# 医保对账差异归因系统 - 一键运行演示脚本 (Linux/macOS)
# 用法: bash run_demo.sh 或 ./run_demo.sh

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "  医保对账差异归因系统 - 演示程序"
echo "========================================="
echo ""

# 检查依赖
echo "[1/4] 检查依赖..."
if ! command -v python &> /dev/null; then
    echo "错误: 未找到 Python，请先安装 Python 3.x"
    exit 1
fi

# 安装依赖
echo "[2/4] 安装依赖..."
pip install -q -r requirements.txt

# 创建输出目录
echo "[3/4] 创建输出目录..."
mkdir -p reports/demo_output

# 运行演示
echo "[4/4] 运行对账演示..."
echo ""
python -m src.cli reconcile \
    --his-file data/sample_his.csv \
    --insurance-file data/sample_insurance.csv \
    --output-dir reports/demo_output \
    --verbose

echo ""
echo "========================================="
echo "  演示完成！"
echo "  输出目录: reports/demo_output/"
echo "  生成文件:"
echo "    - diffLedger.xlsx   (差异台账)"
echo "    - appealLetter.docx (申诉函件草稿)"
echo "    - diffReport.html    (HTML报告)"
echo "    - diffSummary.json  (JSON摘要)"
echo "========================================="
