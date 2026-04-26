"""医保对账差异归因与申诉草稿生成器 - CLI入口

Version: 1.0.0
License: MIT

用法:
    # 基本用法
    python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --output-dir reports/output

    # 使用配置文件
    python -m src.cli reconcile --config config/default.yaml

    # 按归因类型筛选
    python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --filter-type 数量差 --output-dir reports/output

    # 详细日志模式
    python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --verbose --output-dir reports/output

    # 导出JSON摘要
    python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --export-json --output-dir reports/output

参数说明:
    --his-file          HIS结算数据文件路径（支持CSV/Excel格式）
    --insurance-file    医保平台回传文件路径（支持CSV/Excel格式）
    --output-dir        输出目录路径（默认: reports/output）
    --config            配置文件路径（YAML格式），可一次性传入所有参数
    --filter-type       按归因类型筛选差异记录
                        可选值: 规格型号差, 数量差, 单价差, 项目对照差, 其他
    --verbose           详细日志模式，显示每个处理步骤的详细信息
    --export-json       导出JSON格式的差异摘要，供其他系统对接

输出文件:
    diffLedger.xlsx     结构化差异台账（Excel格式）
    appealLetter.docx   申诉函件草稿（Word格式）
    diffReport.html     交互式HTML报告
    diffSummary.json    结构化JSON摘要（需加 --export-json）

归因类型说明:
    规格型号差    同一项目但规格/型号不一致
    数量差        同一项目但数量不一致
    单价差        同一项目但单价不一致
    项目对照差    项目代码在两边系统中对照关系不同
    其他          无法归因到以上类型的差异

示例:
    # 完整对账流程
    python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --output-dir reports/test_run

    # 只查看数量差异
    python -m src.cli reconcile --his-file data/sample_his.csv --insurance-file data/sample_insurance.csv --filter-type 数量差 --output-dir reports/output
"""
import sys
import os
from pathlib import Path

import fire
import yaml

from src.engine.reconciliation_engine import ReconciliationEngine
from src.reports.excel_exporter import ExcelExporter
from src.reports.appeal_letter_generator import AppealLetterGenerator
from src.reports.html_reporter import HTMLReporter
from src.reports.json_exporter import JSONExporter

__version__ = "1.0.0"


class CLI:
    """医保对账差异归因CLI工具"""

    def __init__(self):
        self.his_file = None
        self.insurance_file = None
        self.output_dir = None
        self.config_file = None
        self.filter_type = None
        self.verbose = False
        self.export_json = False

    def reconcile(self,
                  his_file: str = None,
                  insurance_file: str = None,
                  output_dir: str = "reports/output",
                  config: str = None,
                  filter_type: str = None,
                  verbose: bool = False,
                  export_json: bool = False):
        """执行医保对账差异比对并生成报告

        Args:
            his_file: HIS结算数据文件路径（CSV/Excel）
            insurance_file: 医保平台回传文件路径（CSV/Excel）
            output_dir: 输出目录路径
            config: 配置文件路径（YAML）
            filter_type: 按归因类型筛选（可选）
            verbose: 详细日志模式
            export_json: 导出JSON格式差异摘要
        """
        # 初始化默认值
        self.his_file = his_file
        self.insurance_file = insurance_file
        self.output_dir = output_dir or "reports/output"
        self.filter_type = filter_type
        self.verbose = verbose
        self.export_json = export_json

        if config:
            self._load_config(config)

        if not self.his_file or not self.insurance_file:
            print("错误: 必须指定 --his-file 和 --insurance-file 参数")
            print("使用 --help 查看更多用法")
            sys.exit(1)

        if self.verbose:
            print(f"[VERBOSE] HIS文件: {self.his_file}")
            print(f"[VERBOSE] 医保文件: {self.insurance_file}")
            print(f"[VERBOSE] 输出目录: {self.output_dir}")

        self._run()

    def _load_config(self, config_file: str):
        """从配置文件加载参数"""
        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)
        # 配置参数可扩展
        if 'his_file' in config:
            self.his_file = config['his_file']
        if 'insurance_file' in config:
            self.insurance_file = config['insurance_file']
        if 'output_dir' in config:
            self.output_dir = config['output_dir']
        if 'filter_type' in config:
            self.filter_type = config['filter_type']
        if 'verbose' in config:
            self.verbose = config['verbose']
        if 'export_json' in config:
            self.export_json = config['export_json']

    def _run(self):
        """执行对账流程"""
        # 创建输出目录
        output_path = Path(self.output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # 初始化引擎
        engine = ReconciliationEngine(verbose=self.verbose)

        if self.verbose:
            print("[VERBOSE] 开始加载数据...")

        # 执行对账
        diff_results = engine.reconcile(self.his_file, self.insurance_file)

        if self.verbose:
            print(f"[VERBOSE] 发现 {len(diff_results)} 条差异记录")

        # 按类型筛选
        if self.filter_type:
            diff_results = [r for r in diff_results if r.get('attribution_type') == self.filter_type]
            if self.verbose:
                print(f"[VERBOSE] 筛选后 {len(diff_results)} 条差异记录")

        # 生成Excel台账
        if self.verbose:
            print("[VERBOSE] 生成Excel台账...")
        excel_exporter = ExcelExporter()
        excel_path = output_path / "diffLedger.xlsx"
        excel_exporter.export(diff_results, str(excel_path))
        print(f"差异台账已生成: {excel_path}")

        # 生成Word申诉函
        if self.verbose:
            print("[VERBOSE] 生成Word申诉函...")
        letter_generator = AppealLetterGenerator()
        letter_path = output_path / "appealLetter.docx"
        letter_generator.generate(diff_results, str(letter_path))
        print(f"申诉函件草稿已生成: {letter_path}")

        # 生成HTML报告
        if self.verbose:
            print("[VERBOSE] 生成HTML报告...")
        html_reporter = HTMLReporter()
        html_path = output_path / "diffReport.html"
        html_reporter.generate(diff_results, str(html_path))
        print(f"HTML报告已生成: {html_path}")

        # 可选：生成JSON摘要
        if self.export_json:
            if self.verbose:
                print("[VERBOSE] 生成JSON摘要...")
            json_exporter = JSONExporter()
            json_path = output_path / "diffSummary.json"
            json_exporter.export(diff_results, str(json_path))
            print(f"JSON差异摘要已生成: {json_path}")

        print("\n对账完成!")
        print(f"共发现 {len(diff_results)} 条差异记录")


def main():
    """CLI主入口"""
    fire.Fire(CLI)


if __name__ == "__main__":
    main()
