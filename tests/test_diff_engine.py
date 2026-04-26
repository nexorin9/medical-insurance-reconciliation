"""差异比对引擎单元测试"""
import pytest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.engine.diff_engine import DiffEngine
from src.config.field_mapper import FieldMapper


class TestDiffEngine:
    """测试DiffEngine类"""

    def setup_method(self):
        """设置测试环境"""
        self.field_mapper = FieldMapper("config/field_mapping_his.yaml")
        self.engine = DiffEngine(self.field_mapper)

    def test_compare_identical_records(self):
        """测试相同记录（无差异）的比对"""
        his_record = {
            'item_code': 'H001',
            'item_name': '血清总蛋白测定',
            'spec_model': '干化学法',
            'quantity': 1,
            'unit_price': 30.00,
            'total_amount': 30.00
        }

        insurance_record = {
            'item_code': 'H001',
            'item_name': '血清总蛋白测定',
            'spec_model': '干化学法',
            'quantity': 1,
            'unit_price': 30.00,
            'total_amount': 30.00
        }

        diff = self.engine.compare_record(his_record, insurance_record)
        assert diff is None or (not diff.get('has_diff', True))

    def test_compare_quantity_diff(self):
        """测试数量差异比对"""
        his_record = {
            'item_code': 'H001',
            'item_name': '血清总蛋白测定',
            'spec_model': '干化学法',
            'quantity': 2,
            'unit_price': 30.00,
            'total_amount': 60.00
        }

        insurance_record = {
            'item_code': 'H001',
            'item_name': '血清总蛋白测定',
            'spec_model': '干化学法',
            'quantity': 1,
            'unit_price': 30.00,
            'total_amount': 30.00
        }

        diff = self.engine.compare_record(his_record, insurance_record)
        assert diff is not None
        assert diff.get('has_diff', False)

    def test_compare_spec_diff(self):
        """测试规格型号差异比对"""
        his_record = {
            'item_code': 'H001',
            'item_name': '血清总蛋白测定',
            'spec_model': '干化学法',
            'quantity': 1,
            'unit_price': 30.00,
            'total_amount': 30.00
        }

        insurance_record = {
            'item_code': 'H001',
            'item_name': '血清总蛋白测定',
            'spec_model': '酶法',
            'quantity': 1,
            'unit_price': 30.00,
            'total_amount': 30.00
        }

        diff = self.engine.compare_record(his_record, insurance_record)
        assert diff is not None
        assert diff.get('has_diff', False)

    def test_compare_unit_price_diff(self):
        """测试单价差异比对"""
        his_record = {
            'item_code': 'H001',
            'item_name': '血清总蛋白测定',
            'spec_model': '干化学法',
            'quantity': 1,
            'unit_price': 30.00,
            'total_amount': 30.00
        }

        insurance_record = {
            'item_code': 'H001',
            'item_name': '血清总蛋白测定',
            'spec_model': '干化学法',
            'quantity': 1,
            'unit_price': 25.00,
            'total_amount': 25.00
        }

        diff = self.engine.compare_record(his_record, insurance_record)
        assert diff is not None
        assert diff.get('has_diff', False)

    def test_compare_item_code_diff(self):
        """测试项目代码差异（项目对照差）"""
        his_record = {
            'item_code': 'H001',
            'item_name': '血清总蛋白测定',
            'spec_model': '干化学法',
            'quantity': 1,
            'unit_price': 30.00,
            'total_amount': 30.00
        }

        insurance_record = {
            'item_code': 'H002',  # 不同项目代码
            'item_name': '血清总蛋白测定',
            'spec_model': '干化学法',
            'quantity': 1,
            'unit_price': 30.00,
            'total_amount': 30.00
        }

        diff = self.engine.compare_record(his_record, insurance_record)
        assert diff is not None

    def test_compare_empty_records(self):
        """测试空记录比对"""
        his_record = {}
        insurance_record = {}

        diff = self.engine.compare_record(his_record, insurance_record)
        # 空记录比对应返回无差异或空结果
        assert diff is None or not diff.get('has_diff', True)

    def test_batch_compare(self):
        """测试批量比对"""
        his_records = [
            {'item_code': 'H001', 'spec_model': '干化学法', 'quantity': 1, 'unit_price': 30.00},
            {'item_code': 'H002', 'spec_model': '酶法', 'quantity': 2, 'unit_price': 25.00},
        ]

        insurance_records = [
            {'item_code': 'H001', 'spec_model': '干化学法', 'quantity': 1, 'unit_price': 30.00},
            {'item_code': 'H002', 'spec_model': '干化学法', 'quantity': 1, 'unit_price': 25.00},
        ]

        results = []
        for h, i in zip(his_records, insurance_records):
            diff = self.engine.compare_record(h, i)
            results.append(diff)

        assert len(results) == 2
        # 第一个应该无差异，第二个有差异
        assert results[0] is None or not results[0].get('has_diff', True)
        assert results[1] is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
