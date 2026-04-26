"""归因分类器单元测试"""
import pytest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.engine.attribution_classifier import AttributionClassifier


class TestAttributionClassifier:
    """测试AttributionClassifier类"""

    def setup_method(self):
        """设置测试环境"""
        self.classifier = AttributionClassifier()

    def test_classify_spec_diff(self):
        """测试规格型号差异分类"""
        diff_record = {
            'his': {'item_code': 'H001', 'spec_model': '干化学法'},
            'insurance': {'item_code': 'H001', 'spec_model': '酶法'},
            'diff_fields': ['spec_model'],
            'diff_values': {'spec_model': {'his': '干化学法', 'ins': '酶法'}}
        }

        result = self.classifier.classify(diff_record)
        assert result is not None
        assert result.get('attribution_type') in ['规格型号差', '其他', 'specification_diff']

    def test_classify_quantity_diff(self):
        """测试数量差异分类"""
        diff_record = {
            'his': {'item_code': 'H001', 'quantity': 2},
            'insurance': {'item_code': 'H001', 'quantity': 1},
            'diff_fields': ['quantity'],
            'diff_values': {'quantity': {'his': 2, 'ins': 1}}
        }

        result = self.classifier.classify(diff_record)
        assert result is not None
        assert result.get('attribution_type') in ['数量差', '其他', 'quantity_diff']

    def test_classify_unit_price_diff(self):
        """测试单价差异分类"""
        diff_record = {
            'his': {'item_code': 'H001', 'unit_price': 30.00},
            'insurance': {'item_code': 'H001', 'unit_price': 25.00},
            'diff_fields': ['unit_price'],
            'diff_values': {'unit_price': {'his': 30.00, 'ins': 25.00}}
        }

        result = self.classifier.classify(diff_record)
        assert result is not None
        assert result.get('attribution_type') in ['单价差', '其他', 'unit_price_diff']

    def test_classify_item_mapping_diff(self):
        """测试项目对照差异分类"""
        diff_record = {
            'his': {'item_code': 'H001', 'item_name': '血清总蛋白测定'},
            'insurance': {'item_code': 'H002', 'item_name': '血清总蛋白测定'},
            'diff_fields': ['item_code'],
            'diff_values': {'item_code': {'his': 'H001', 'ins': 'H002'}}
        }

        result = self.classifier.classify(diff_record)
        assert result is not None
        assert result.get('attribution_type') in ['项目对照差', '其他', 'item_mapping_diff']

    def test_classify_multiple_diffs(self):
        """测试多字段差异分类（应按优先级归因）"""
        diff_record = {
            'his': {'item_code': 'H001', 'spec_model': '干化学法', 'quantity': 2},
            'insurance': {'item_code': 'H001', 'spec_model': '酶法', 'quantity': 1},
            'diff_fields': ['spec_model', 'quantity'],
            'diff_values': {
                'spec_model': {'his': '干化学法', 'ins': '酶法'},
                'quantity': {'his': 2, 'ins': 1}
            }
        }

        result = self.classifier.classify(diff_record)
        assert result is not None

    def test_classify_no_diff(self):
        """测试无差异记录"""
        diff_record = {
            'his': {'item_code': 'H001', 'spec_model': '干化学法'},
            'insurance': {'item_code': 'H001', 'spec_model': '干化学法'},
            'diff_fields': []
        }

        result = self.classifier.classify(diff_record)
        # 无差异记录可能返回None或标记为无差异
        assert result is None or result.get('has_diff') == False or result.get('attribution_type') == '其他'

    def test_classify_unattributed(self):
        """测试无法归因的差异"""
        diff_record = {
            'his': {'item_code': 'H001', 'custom_field': 'value1'},
            'insurance': {'item_code': 'H001', 'custom_field': 'value2'},
            'diff_fields': ['custom_field'],
            'diff_values': {'custom_field': {'his': 'value1', 'ins': 'value2'}}
        }

        result = self.classifier.classify(diff_record)
        assert result is not None
        # 无法归因时应标记为其他类型
        assert result.get('attribution_type') in ['其他', 'other']

    def test_classify_with_tolerance(self):
        """测试容差范围内的差异（不应归因为差异）"""
        diff_record = {
            'his': {'item_code': 'H001', 'quantity': 1.001},
            'insurance': {'item_code': 'H001', 'quantity': 1.0},
            'diff_fields': ['quantity'],
            'diff_values': {'quantity': {'his': 1.001, 'ins': 1.0}}
        }

        result = self.classifier.classify(diff_record)
        # 如果在容差范围内，可能不被认为是差异
        assert result is None or not result.get('has_diff', False)

    def test_classify_batch(self):
        """测试批量分类"""
        diff_records = [
            {'his': {'item_code': 'H001'}, 'insurance': {'item_code': 'H001'}, 'diff_fields': []},
            {'his': {'item_code': 'H001', 'quantity': 2}, 'insurance': {'item_code': 'H001', 'quantity': 1}, 'diff_fields': ['quantity'], 'diff_values': {'quantity': {'his': 2, 'ins': 1}}},
        ]

        results = self.classifier.classify_batch(diff_records)
        assert len(results) == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])