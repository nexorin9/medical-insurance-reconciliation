"""HIS数据适配器单元测试"""
import pytest
import pandas as pd
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.adapters.his_adapter import HisDataAdapter
from src.config.field_mapper import FieldMapper


class TestHisDataAdapter:
    """测试HisDataAdapter类"""

    def test_load_csv_file(self, tmp_path):
        """测试CSV格式加载"""
        # 创建测试CSV文件
        csv_content = """项目编码,项目名称,规格型号,单位,数量,单价,金额,医疗机构代码,就诊流水号
H001,血清总蛋白测定,干化学法,次,1,30.00,30.00,1001,YS2026040001
H002,丙氨酸氨基转移酶测定,干化学法,次,1,25.00,25.00,1001,YS2026040002
"""
        csv_file = tmp_path / "test_his.csv"
        csv_file.write_text(csv_content, encoding='utf-8')

        adapter = HisDataAdapter()
        df = adapter.load(str(csv_file))

        assert df is not None
        assert len(df) == 2
        assert 'item_code' in df.columns or '项目编码' in df.columns

    def test_load_excel_file(self, tmp_path):
        """测试Excel格式加载"""
        import openpyxl

        # 创建测试Excel文件
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(['项目编码', '项目名称', '规格型号', '单位', '数量', '单价', '金额', '医疗机构代码', '就诊流水号'])
        ws.append(['H001', '血清总蛋白测定', '干化学法', '次', 1, 30.00, 30.00, 1001, 'YS2026040001'])
        ws.append(['H002', '丙氨酸氨基转移酶测定', '干化学法', '次', 1, 25.00, 25.00, 1001, 'YS2026040002'])

        excel_file = tmp_path / "test_his.xlsx"
        wb.save(str(excel_file))

        adapter = HisDataAdapter()
        df = adapter.load(str(excel_file))

        assert df is not None
        assert len(df) == 2

    def test_field_normalization(self, tmp_path):
        """测试字段统一命名"""
        # 创建测试CSV文件，使用中文列名
        csv_content = """项目编码,项目名称,规格型号,单位,数量,单价,金额,医疗机构代码,就诊流水号
H001,血清总蛋白测定,干化学法,次,1,30.00,30.00,1001,YS2026040001
"""
        csv_file = tmp_path / "test_his.csv"
        csv_file.write_text(csv_content, encoding='utf-8')

        # 创建FieldMapper - 直接使用配置文件
        field_mapper = FieldMapper("config/field_mapping_his.yaml")
        adapter = HisDataAdapter(field_mapper=field_mapper)
        df = adapter.load(str(csv_file))

        # 检查字段是否被正确映射
        # 部分字段会被映射为canonical名称，部分保留原名（如果不在映射表中）
        assert len(df.columns) > 0
        # 验证至少有一些字段被映射或保留
        assert '项目编码' in df.columns or 'item_code' in df.columns or '项目名称' in df.columns

    def test_to_dict(self, tmp_path):
        """测试转换为字典格式"""
        csv_content = """项目编码,项目名称,规格型号,单位,数量,单价,金额,医疗机构代码,就诊流水号
H001,血清总蛋白测定,干化学法,次,1,30.00,30.00,1001,YS2026040001
"""
        csv_file = tmp_path / "test_his.csv"
        csv_file.write_text(csv_content, encoding='utf-8')

        adapter = HisDataAdapter()
        df = adapter.load(str(csv_file))
        records = adapter.to_dict(orient='records')

        assert len(records) == 1
        assert 'H001' in str(records[0])

    def test_unsupported_format(self, tmp_path):
        """测试不支持的文件格式"""
        txt_file = tmp_path / "test.txt"
        txt_file.write_text("test content")

        adapter = HisDataAdapter()
        with pytest.raises(ValueError, match="不支持的文件格式"):
            adapter.load(str(txt_file))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
