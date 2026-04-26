"""主引擎编排器 - 编排完整的对账流程"""
from pathlib import Path
from typing import List, Dict, Any

from src.adapters.his_adapter import HisDataAdapter
from src.adapters.insurance_adapter import InsuranceDataAdapter
from src.config.field_mapper import FieldMapper
from src.engine.diff_engine import DiffEngine
from src.engine.attribution_classifier import AttributionClassifier


class ReconciliationEngine:
    """医保对账引擎"""

    def __init__(self, config_path: str = None, verbose: bool = False):
        """初始化对账引擎

        Args:
            config_path: 字段映射配置文件路径
            verbose: 是否输出详细日志
        """
        self.verbose = verbose
        self.config_path = config_path or "config/field_mapping.yaml"

        # 初始化字段映射器
        self.field_mapper = FieldMapper(self.config_path)

        # 初始化数据适配器
        self.his_adapter = HisDataAdapter(
            field_mapping={'field_aliases': self.field_mapper.aliases},
            field_mapper=self.field_mapper
        )
        self.insurance_adapter = InsuranceDataAdapter(
            field_mapping={'field_aliases': self.field_mapper.aliases},
            field_mapper=self.field_mapper
        )

        # 初始化比对引擎
        self.diff_engine = DiffEngine(self.field_mapper, verbose=self.verbose)

        # 初始化归因分类器
        thresholds = self.field_mapper.get_thresholds()
        self.attribution_classifier = AttributionClassifier(
            field_mapper=self.field_mapper,
            thresholds=thresholds
        )

        self.diff_results = []

    def reconcile(self, his_file: str, insurance_file: str) -> List[Dict[str, Any]]:
        """执行完整的对账流程

        Args:
            his_file: HIS数据文件路径
            insurance_file: 医保平台数据文件路径

        Returns:
            归因后的差异记录列表
        """
        if self.verbose:
            print("[引擎] 加载HIS数据...")
        his_data = self.his_adapter.load(his_file)

        if self.verbose:
            print("[引擎] 加载医保平台数据...")
        insurance_data = self.insurance_adapter.load(insurance_file)

        if self.verbose:
            print("[引擎] 执行差异比对...")
        diff_records = self.diff_engine.compare(his_data, insurance_data)

        if self.verbose:
            print(f"[引擎] 发现 {len(diff_records)} 条差异记录")
            print("[引擎] 执行归因分类...")

        # 执行归因分类
        attributed_results = self.attribution_classifier.classify_batch(diff_records)

        self.diff_results = attributed_results
        return attributed_results

    def get_statistics(self) -> Dict[str, Any]:
        """获取差异统计信息

        Returns:
            统计信息字典
        """
        if not self.diff_results:
            return {}

        stats = {
            'total_diffs': len(self.diff_results),
            'by_type': {}
        }

        for record in self.diff_results:
            attr_type = record.get('attribution_type', '未知')
            stats['by_type'][attr_type] = stats['by_type'].get(attr_type, 0) + 1

        return stats
