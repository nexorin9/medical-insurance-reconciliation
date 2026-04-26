"""JSON 差异摘要导出器"""
import json
from typing import List, Dict, Any
from datetime import datetime


class JSONExporter:
    """JSON格式差异摘要导出器"""

    def export(self, diff_records: List[Dict[str, Any]], output_path: str) -> None:
        """导出差异摘要到JSON

        Args:
            diff_records: 差异记录列表
            output_path: 输出文件路径
        """
        # 收集统计信息
        by_type = {}
        for record in diff_records:
            attr_type = record.get('attribution_type', '未知')
            by_type[attr_type] = by_type.get(attr_type, 0) + 1

        output = {
            'generated_at': datetime.now().isoformat(),
            'summary': {
                'total_count': len(diff_records),
                'by_type': by_type
            },
            'differences': diff_records
        }

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
