"""Excel导出器单元测试"""
import pytest
from pathlib import Path
import sys
import os

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.reports.excel_exporter import ExcelExporter


class TestExcelExporter:
    """测试ExcelExporter类"""

    def setup_method(self):
        """设置测试环境"""
        self.exporter = ExcelExporter()
        self.test_output_dir = Path(__file__).parent.parent / "reports" / "test_output"
        self.test_output_dir.mkdir(parents=True, exist_ok=True)

    def test_export_empty_results(self):
        """测试导出空结果"""
        output_file = self.test_output_dir / "test_empty.xlsx"
        results = []

        self.exporter.export(results, str(output_file))

        assert output_file.exists()
        # 验证文件不为空
        assert os.path.getsize(str(output_file)) > 0

    def test_export_with_data(self):
        """测试导出有数据的差异结果"""
        output_file = self.test_output_dir / "test_with_data.xlsx"
        results = [
            {
                'his_record': {'item_code': 'H001', 'item_name': '血清总蛋白测定', 'spec_model': '干化学法', 'quantity': 1, 'unit_price': 30.00},
                'insurance_record': {'item_code': 'H001', 'item_name': '血清总蛋白测定', 'spec_model': '酶法', 'quantity': 1, 'unit_price': 30.00},
                'diff_fields': ['spec_model'],
                'attribution_type': '规格型号差'
            },
            {
                'his_record': {'item_code': 'H002', 'item_name': '丙氨酸氨基转移酶测定', 'quantity': 2, 'unit_price': 25.00},
                'insurance_record': {'item_code': 'H002', 'item_name': '丙氨酸氨基转移酶测定', 'quantity': 1, 'unit_price': 25.00},
                'diff_fields': ['quantity'],
                'attribution_type': '数量差'
            }
        ]

        self.exporter.export(results, str(output_file))

        assert output_file.exists()
        assert os.path.getsize(str(output_file)) > 0

    def test_export_correct_columns(self):
        """测试导出列名正确性"""
        output_file = self.test_output_dir / "test_columns.xlsx"
        results = [
            {
                'his_record': {'item_code': 'H001', 'item_name': '血清总蛋白测定'},
                'insurance_record': {'item_code': 'H001', 'item_name': '血清总蛋白测定'},
                'diff_fields': ['spec_model'],
                'attribution_type': '规格型号差'
            }
        ]

        self.exporter.export(results, str(output_file))

        assert output_file.exists()
        # 读取Excel验证列名
        import openpyxl
        wb = openpyxl.load_workbook(str(output_file))
        ws = wb.active

        # 验证至少有标题行
        headers = [cell.value for cell in ws[1]]
        assert len(headers) > 0
        # 检查是否包含必要的列
        assert any('差异' in str(h) or 'HIS' in str(h) or '归因' in str(h) for h in headers)

    def test_export_file_creation(self):
        """测试文件创建"""
        output_file = self.test_output_dir / "test_file_creation.xlsx"
        results = [
            {
                'his_record': {'item_code': 'H001'},
                'insurance_record': {'item_code': 'H001'},
                'diff_fields': [],
                'attribution_type': '无差异'
            }
        ]

        self.exporter.export(results, str(output_file))

        assert output_file.exists()

        # 再次运行应该覆盖文件
        self.exporter.export(results, str(output_file))
        assert output_file.exists()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
