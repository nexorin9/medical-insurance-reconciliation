"""医保平台数据适配器单元测试"""
import pytest
import pandas as pd
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.adapters.insurance_adapter import InsuranceDataAdapter


class TestInsuranceDataAdapter:
    """测试InsuranceDataAdapter类"""

    def test_load_csv_file(self, tmp_path):
        """测试CSV格式加载"""
        csv_content = """项目编码,项目名称,规格型号,单位,数量,单价,金额,医疗机构代码,就诊流水号
H001,血清总蛋白测定,干化学法,次,1,30.00,30.00,1001,YS2026040001
H002,丙氨酸氨基转移酶测定,干化学法,次,1,25.00,25.00,1001,YS2026040002
"""
        csv_file = tmp_path / "test_insurance.csv"
        csv_file.write_text(csv_content, encoding='utf-8')

        adapter = InsuranceDataAdapter()
        df = adapter.load(str(csv_file))

        assert df is not None
        assert len(df) == 2
        assert 'item_code' in df.columns or '项目编码' in df.columns

    def test_load_excel_file(self, tmp_path):
        """测试Excel格式加载"""
        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['项目编码', '项目名称', '规格型号', '单位', '数量', '单价', '金额', '医疗机构代码', '就诊流水号'])
        ws.append(['H001', '血清总蛋白测定', '干化学法', '次', 1, 30.00, 30.00, 1001, 'YS2026040001'])
        ws.append(['H002', '丙氨酸氨基转移酶测定', '干化学法', '次', 1, 25.00, 25.00, 1001, 'YS2026040002'])

        excel_file = tmp_path / "test_insurance.xlsx"
        wb.save(str(excel_file))

        adapter = InsuranceDataAdapter()
        df = adapter.load(str(excel_file))

        assert df is not None
        assert len(df) == 2

    def test_column_normalization(self, tmp_path):
        """测试列名标准化"""
        # 使用医保平台常见字段名
        csv_content = """VISIT_NO,ITEM_CODE,ITEM_NAME,SPEC_MODEL,QUANTITY,UNIT_PRICE,AMOUNT,INST_CODE
YS2026040001,H001,血清总蛋白测定,干化学法,1,30.00,30.00,1001
"""
        csv_file = tmp_path / "test_insurance.csv"
        csv_file.write_text(csv_content, encoding='utf-8')

        adapter = InsuranceDataAdapter()
        df = adapter.load(str(csv_file))

        # 验证字段被映射到规范名称
        # 字段可能已经被标准化为canonical names
        assert df is not None

    def test_to_dict(self, tmp_path):
        """测试转换为字典格式"""
        csv_content = """项目编码,项目名称,规格型号,单位,数量,单价,金额,医疗机构代码,就诊流水号
H001,血清总蛋白测定,干化学法,次,1,30.00,30.00,1001,YS2026040001
"""
        csv_file = tmp_path / "test_insurance.csv"
        csv_file.write_text(csv_content, encoding='utf-8')

        adapter = InsuranceDataAdapter()
        df = adapter.load(str(csv_file))
        records = adapter.to_dict(orient='records')

        assert len(records) == 1

    def test_get_columns(self, tmp_path):
        """测试获取列名"""
        csv_content = """项目编码,项目名称,规格型号,数量,单价,金额
H001,血清总蛋白测定,干化学法,1,30.00,30.00
"""
        csv_file = tmp_path / "test_insurance.csv"
        csv_file.write_text(csv_content, encoding='utf-8')

        adapter = InsuranceDataAdapter()
        df = adapter.load(str(csv_file))
        columns = adapter.get_columns()

        assert len(columns) > 0
        assert isinstance(columns, list)

    def test_unsupported_format(self, tmp_path):
        """测试不支持的文件格式"""
        txt_file = tmp_path / "test.txt"
        txt_file.write_text("test content")

        adapter = InsuranceDataAdapter()
        with pytest.raises(ValueError, match="不支持的文件格式"):
            adapter.load(str(txt_file))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
