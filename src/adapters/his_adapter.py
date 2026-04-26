"""HIS数据适配器 - 支持从CSV、Excel、DBF格式加载HIS结算数据"""
import pandas as pd
from pathlib import Path
from typing import Optional, Dict, Any


class HisDataAdapter:
    """HIS数据适配器"""

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
        """加载HIS数据

        Args:
            file_path: 文件路径
            **kwargs: 传递给pandas的额外参数

        Returns:
            DataFrame格式的HIS数据
        """
        path = Path(file_path)
        suffix = path.suffix.lower()

        if suffix == '.csv':
            self.data = pd.read_csv(file_path, encoding='utf-8', **kwargs)
        elif suffix in ['.xlsx', '.xls']:
            self.data = pd.read_excel(file_path, **kwargs)
        elif suffix == '.dbf':
            self.data = pd.read_csv(file_path, encoding='utf-8', **kwargs)
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
            col_upper = col.upper().strip()
            # 先检查是否是别名
            resolved = self.field_mapper.resolve_alias(col_upper) if self.field_mapper else col_upper
            # 再检查是否是HIScanonical字段，需要映射到insurance字段
            if self.field_mapper and self.field_mapper.mappings:
                canonical = self.field_mapper.mappings.get(resolved, resolved)
            else:
                canonical = resolved
            column_rename[col] = canonical

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
