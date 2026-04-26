"""差异归因分类器 - 将差异归因到5种类型"""
from typing import Dict, Any, List, Optional


class AttributionClassifier:
    """差异归因分类器"""

    # 归因类型常量
    TYPE_SPECIFICATION_DIFF = "规格型号差"
    TYPE_QUANTITY_DIFF = "数量差"
    TYPE_UNIT_PRICE_DIFF = "单价差"
    TYPE_ITEM_MAPPING_DIFF = "项目对照差"
    TYPE_OTHER = "其他"

    def __init__(self, field_mapper=None, thresholds: Optional[Dict[str, float]] = None):
        """初始化归因分类器

        Args:
            field_mapper: FieldMapper实例
            thresholds: 差异判断阈值字典
        """
        self.field_mapper = field_mapper
        self.thresholds = thresholds or {
            'quantity_tolerance': 0.01,
            'unit_price_tolerance': 0.01,
            'amount_tolerance': 0.01
        }

    def classify(self, diff_record: Dict[str, Any]) -> Dict[str, Any]:
        """对单条差异记录进行归因分类

        Args:
            diff_record: 差异记录字典

        Returns:
            包含归因类型的差异记录
        """
        diff_fields = diff_record.get('diff_fields', [])
        diff_values = diff_record.get('diff_values', {})

        if not diff_fields or diff_fields == ['记录缺失']:
            attribution_type = self.TYPE_OTHER
            reason = "记录缺失，无法归因"
        else:
            attribution_type, reason = self._classify_diff_type(diff_fields, diff_values)

        result = diff_record.copy()
        result['attribution_type'] = attribution_type
        result['attribution_reason'] = reason
        return result

    def _classify_diff_type(self, diff_fields: List[str],
                           diff_values: Dict[str, Dict[str, Any]]) -> tuple:
        """根据差异字段判断归因类型

        Args:
            diff_fields: 差异字段列表
            diff_values: 差异值字典

        Returns:
            (归因类型, 归因原因)
        """
        # 按优先级判断
        for field in diff_fields:
            if field in ['规格', 'specification']:
                return (self.TYPE_SPECIFICATION_DIFF, f"规格型号不一致: {diff_values.get(field, {})}")

            if field in ['数量', 'quantity']:
                vals = diff_values.get(field, {})
                his_qty = float(vals.get('his', 0) or 0)
                ins_qty = float(vals.get('ins', 0) or 0)
                diff = abs(his_qty - ins_qty)
                if diff > self.thresholds.get('quantity_tolerance', 0.01):
                    return (self.TYPE_QUANTITY_DIFF, f"数量差异超过容差: {diff_values.get(field, {})}")

            if field in ['单价', 'unit_price']:
                vals = diff_values.get(field, {})
                his_price = float(vals.get('his', 0) or 0)
                ins_price = float(vals.get('ins', 0) or 0)
                diff = abs(his_price - ins_price)
                if diff > self.thresholds.get('unit_price_tolerance', 0.01):
                    return (self.TYPE_UNIT_PRICE_DIFF, f"单价差异超过容差: {diff_values.get(field, {})}")

            if field in ['项目代码', 'item_code']:
                return (self.TYPE_ITEM_MAPPING_DIFF, f"项目对照不一致: {diff_values.get(field, {})}")

        # 默认为其他
        return (self.TYPE_OTHER, f"无法归因到特定类型: {diff_fields}")

    def classify_batch(self, diff_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """批量归因分类

        Args:
            diff_records: 差异记录列表

        Returns:
            归因后的差异记录列表
        """
        return [self.classify(record) for record in diff_records]
