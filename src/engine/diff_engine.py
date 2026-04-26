"""差异比对引擎核心 - 逐条比对HIS和医保平台记录"""
import pandas as pd
from typing import List, Dict, Any, Optional


class DiffEngine:
    """差异比对引擎"""

    def __init__(self, field_mapper, verbose: bool = False):
        """初始化比对引擎

        Args:
            field_mapper: FieldMapper实例
            verbose: 是否输出详细日志
        """
        self.field_mapper = field_mapper
        self.verbose = verbose
        self.diff_records = []

    def compare(self, his_data: pd.DataFrame, insurance_data: pd.DataFrame,
                his_key_field: str = '就诊流水号',
                insurance_key_field: str = 'serial_no') -> List[Dict[str, Any]]:
        """比对两条记录的差异

        Args:
            his_data: HIS数据DataFrame
            insurance_data: 医保平台数据DataFrame
            his_key_field: HIS关键字段名
            insurance_key_field: 医保关键字段名

        Returns:
            差异记录列表
        """
        # 获取映射后的关键字段
        his_key = self.field_mapper.get_mapping(his_key_field)
        ins_key = his_key  # 映射后两边字段名相同

        # 确保关键字段存在
        his_key_col = his_key if his_key in his_data.columns else his_key_field
        ins_key_col = ins_key if ins_key in insurance_data.columns else insurance_key_field

        # 按关键字段合并数据
        merged = pd.merge(
            his_data,
            insurance_data,
            left_on=his_key_col,
            right_on=ins_key_col,
            how='outer',
            suffixes=('_his', '_ins')
        )

        diff_results = []
        diff_fields = ['item_code', 'item_name', 'spec_model', 'quantity', 'unit_price', 'total_amount']

        for idx, row in merged.iterrows():
            # 检查是否是一对一匹配
            his_has = his_key_col in row and pd.notna(row.get(f'{his_key_col}_his', None) if f'{his_key_col}_his' in row else row.get(his_key_col, None))
            ins_has = ins_key_col in row and pd.notna(row.get(f'{ins_key_col}_ins', None) if f'{ins_key_col}_ins' in row else row.get(ins_key_col, None))

            if not (his_has and ins_has):
                # 记录在一边存在但另一边不存在的情况
                diff_results.append({
                    'record_id': idx,
                    'status': 'missing_in_his' if not his_has else 'missing_in_insurance',
                    'his_record': row.to_dict(),
                    'insurance_record': row.to_dict(),
                    'diff_fields': ['记录缺失'],
                    'diff_values': {}
                })
                continue

            # 逐字段比对差异
            his_row = {}
            ins_row = {}

            for field in diff_fields:
                his_val = row.get(f'{field}_his', row.get(field, None))
                ins_val = row.get(f'{field}_ins', row.get(field, None))
                his_row[field] = his_val
                ins_row[field] = ins_val

                if his_val != ins_val and pd.notna(his_val) and pd.notna(ins_val):
                    diff_results.append({
                        'record_id': idx,
                        'status': 'value_mismatch',
                        'his_record': his_row,
                        'insurance_record': ins_row,
                        'diff_fields': [field],
                        'diff_values': {field: {'his': his_val, 'ins': ins_val}}
                    })

        self.diff_records = diff_results
        return diff_results

    def compare_record(self, his_record: Dict[str, Any],
                      insurance_record: Dict[str, Any]) -> Dict[str, Any]:
        """比对单条记录

        Args:
            his_record: HIS记录字典
            insurance_record: 医保记录字典

        Returns:
            差异结果字典
        """
        diff_fields = []
        diff_values = {}

        common_fields = set(his_record.keys()) & set(insurance_record.keys())
        for field in common_fields:
            his_val = his_record.get(field)
            ins_val = insurance_record.get(field)
            if his_val != ins_val:
                diff_fields.append(field)
                diff_values[field] = {'his': his_val, 'ins': ins_val}

        return {
            'diff_fields': diff_fields,
            'diff_values': diff_values,
            'has_diff': len(diff_fields) > 0
        }
