"""字段映射配置加载器"""
import yaml
from pathlib import Path
from typing import Dict, Any, Optional


class FieldMapper:
    """字段映射管理器"""

    def __init__(self, config_path: Optional[str] = None):
        """初始化字段映射器

        Args:
            config_path: YAML配置文件路径
        """
        self.config_path = config_path
        self.mappings = {}
        self.aliases = {}
        self.attribution_rules = {}
        if config_path:
            self.load_config(config_path)

    def load_config(self, config_path: str) -> None:
        """从YAML文件加载配置"""
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        field_mappings = config.get('field_mappings', {})
        self.mappings = field_mappings.get('his_to_insurance', {})
        self.aliases = field_mappings.get('field_aliases', {})
        self.attribution_rules = config.get('attribution_rules', {})

    def get_mapping(self, his_field: str) -> str:
        """获取HIS字段对应的医保字段"""
        return self.mappings.get(his_field, his_field)

    def resolve_alias(self, field_name: str) -> str:
        """解析字段别名，返回规范字段名"""
        field_upper = field_name.upper().strip()
        # 检查是否是别名
        for canonical, alias_list in self.aliases.items():
            if field_upper in [a.upper() for a in alias_list]:
                return canonical
        return field_name

    def get_thresholds(self) -> Dict[str, float]:
        """获取差异判断阈值"""
        return self.attribution_rules.get('thresholds', {})

    def get_attribution_priority(self) -> list:
        """获取归因类型优先级"""
        return self.attribution_rules.get('priority', [])
