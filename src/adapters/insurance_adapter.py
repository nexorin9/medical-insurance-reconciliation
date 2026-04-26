"""医保平台数据适配器 - 支持从CSV、Excel、医保平台标准回盘格式（DBF）加载数据"""
import pandas as pd
from pathlib import Path
from typing import Optional, Dict, Any


# 医保平台常用字段名标准化映射
INSURANCE_CANONICAL_FIELDS = {
    # 就诊信息
    'VISIT_NO': 'visit_serial_no',
    'JZLSH': 'visit_serial_no',
    '就诊流水号': 'visit_serial_no',
    '就疹流水号': 'visit_serial_no',  # 常见拼写变体
    'CLINIC_SERIAL': 'visit_serial_no',
    # 医疗机构代码
    'INST_CODE': 'medical_inst_code',
    'YLJGBM': 'medical_inst_code',
    '医疗机构代码': 'medical_inst_code',
    'MEDICAL_INSTITUTION_CODE': 'medical_inst_code',
    # 医疗类别
    'MED_TYPE': 'medical_type',
    'YLLB': 'medical_type',
    '医疗类别': 'medical_type',
    # 结算日期
    'SETTLE_DATE': 'settlement_date',
    'JSNY': 'settlement_date',
    '结算日期': 'settlement_date',
    'SETTLEMENT_DATE': 'settlement_date',
    # 医保基金支付
    'MEDICAL_INSURANCE_FUND': 'insurance_fund_pay',
    'YBJJZFC': 'insurance_fund_pay',
    '医保基金支付': 'insurance_fund_pay',
    # 个人账户支付
    'PERSONAL_ACCOUNT_PAY': 'personal_account_pay',
    'GRZHZF': 'personal_account_pay',
    '个人账户支付': 'personal_account_pay',
    # 项目编码
    'ITEM_CODE': 'item_code',
    'XMBM': 'item_code',
    '项目编码': 'item_code',
    # 项目名称
    'ITEM_NAME': 'item_name',
    'XMMC': 'item_name',
    '项目名称': 'item_name',
    # 规格型号
    'SPEC_MODEL': 'spec_model',
    'GGXH': 'spec_model',
    '规格型号': 'spec_model',
    '规格': 'spec_model',
    # 数量
    'QUANTITY': 'quantity',
    'SL': 'quantity',
    '数量': 'quantity',
    # 单价
    'UNIT_PRICE': 'unit_price',
    'DJ': 'unit_price',
    '单价': 'unit_price',
    # 金额
    'AMOUNT': 'total_amount',
    'JE': 'total_amount',
    '金额': 'total_amount',
    # 人员类别
    'PERSON_TYPE': 'person_type',
    'RYLB': 'person_type',
    '人员类别': 'person_type',
    # 病种名称
    'DISEASE_NAME': 'disease_name',
    'BZZM': 'disease_name',
    '病种名称': 'disease_name',
}


class InsuranceDataAdapter:
    """医保平台数据适配器"""

    def __init__(self, field_mapping: Optional[Dict[str, Any]] = None, field_mapper=None):
        """初始化适配器

        Args:
            field_mapping: 字段映射配置字典
            field_mapper: FieldMapper实例
        """
        self.field_mapping = field_mapping or {}
        self.field_mapper = field_mapper
        self.data = None
        self.source_file = None

    def load(self, file_path: str, **kwargs) -> pd.DataFrame:
        """加载医保平台数据

        Args:
            file_path: 文件路径
            **kwargs: 传递给pandas的额外参数

        Returns:
            DataFrame格式的医保数据
        """
        path = Path(file_path)
        suffix = path.suffix.lower()

        if suffix == '.csv':
            self.data = pd.read_csv(file_path, encoding='utf-8', **kwargs)
        elif suffix in ['.xlsx', '.xls']:
            self.data = pd.read_excel(file_path, **kwargs)
        else:
            raise ValueError(f"不支持的文件格式: {suffix}")

        self.source_file = file_path
        return self._normalize_columns()

    def _normalize_columns(self) -> pd.DataFrame:
        """统一字段命名"""
        if self.data is None:
            return self.data

        column_rename = {}
        for col in self.data.columns:
            col_upper = str(col).upper().strip()
            # 首先查找标准字段映射
            if col_upper in INSURANCE_CANONICAL_FIELDS:
                column_rename[col] = INSURANCE_CANONICAL_FIELDS[col_upper]
            # 然后尝试用户自定义的字段映射
            elif self.field_mapping.get('field_aliases') and col_upper in self.field_mapping['field_aliases']:
                column_rename[col] = self.field_mapping['field_aliases'][col_upper]
            # 如果字段映射器存在，尝试解析别名
            elif self.field_mapper:
                resolved = self.field_mapper.resolve_alias(col_upper)
                # 尝试HIS到保险的映射（这里保险字段名已经是canonical了，需要映射回HIS）
                for his_key, ins_key in self.field_mapper.mappings.items():
                    if col_upper == str(ins_key).upper():
                        column_rename[col] = his_key
                        break
                else:
                    column_rename[col] = resolved
            else:
                column_rename[col] = col

        self.data = self.data.rename(columns=column_rename)
        return self.data

    def get_columns(self) -> list:
        """获取所有列名"""
        if self.data is None:
            return []
        return list(self.data.columns)

    def to_dict(self, orient: str = 'records') -> list:
        """转换为字典格式

        Args:
            orient: pandas to_dict orient参数

        Returns:
            字典列表
        """
        if self.data is None:
            return []
        return self.data.to_dict(orient=orient)
