"""HTML 差异报告生成器"""
from typing import List, Dict, Any


class HTMLReporter:
    """HTML交互式报告生成器"""

    def __init__(self):
        self.template = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>医保对账差异报告</title>
    <style>
        body {{
            font-family: "Microsoft YaHei", Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }}
        .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }}
        h1 {{ color: #333; border-bottom: 2px solid #4472C4; padding-bottom: 10px; }}
        .stats {{ display: flex; flex-wrap: wrap; gap: 15px; margin: 20px 0; }}
        .stat-card {{ background: #4472C4; color: white; padding: 15px 25px; border-radius: 5px; min-width: 150px; }}
        .stat-card.total {{ background: #C94C4C; }}
        .stat-card .label {{ font-size: 14px; }}
        .stat-card .value {{ font-size: 28px; font-weight: bold; }}
        .filter-section {{ margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px; }}
        .filter-section label {{ margin-right: 10px; }}
        .filter-section select {{ padding: 8px; min-width: 200px; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
        th {{ background: #4472C4; color: white; padding: 12px; text-align: left; }}
        td {{ padding: 10px; border-bottom: 1px solid #ddd; }}
        tr:hover {{ background: #f5f5f5; }}
        .type-spec {{ background: #FFF3CD; }}
        .type-quantity {{ background: #D4EDDA; }}
        .type-price {{ background: #CCE5FF; }}
        .type-mapping {{ background: #E2D9F3; }}
        .type-other {{ background: #F8D7DA; }}
        .pagination {{ margin: 20px 0; text-align: center; }}
        .pagination button {{ padding: 8px 15px; margin: 0 5px; cursor: pointer; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>医保对账差异归因报告</h1>
        <div class="stats">
            <div class="stat-card total">
                <div class="label">总差异数</div>
                <div class="value">{total_count}</div>
            </div>
            {stat_cards}
        </div>
        <div class="filter-section">
            <label>筛选归因类型:</label>
            <select id="typeFilter" onchange="filterTable()">
                <option value="">全部</option>
                {filter_options}
            </select>
        </div>
        <table id="diffTable">
            <thead>
                <tr>
                    <th>序号</th>
                    <th>状态</th>
                    <th>归因类型</th>
                    <th>归因原因</th>
                    <th>差异字段</th>
                </tr>
            </thead>
            <tbody>
                {table_rows}
            </tbody>
        </table>
    </div>
    <script>
        function filterTable() {{
            var filter = document.getElementById('typeFilter').value;
            var rows = document.getElementById('diffTable').getElementsByTagName('tbody')[0].getElementsByTagName('tr');
            for (var i = 0; i < rows.length; i++) {{
                var type = rows[i].getAttribute('data-type');
                if (filter === '' || type === filter) {{
                    rows[i].style.display = '';
                }} else {{
                    rows[i].style.display = 'none';
                }}
            }}
        }}
    </script>
</body>
</html>"""

    def generate(self, diff_records: List[Dict[str, Any]], output_path: str) -> None:
        """生成HTML报告

        Args:
            diff_records: 差异记录列表
            output_path: 输出文件路径
        """
        # 统计
        by_type = {}
        for record in diff_records:
            attr_type = record.get('attribution_type', '未知')
            by_type[attr_type] = by_type.get(attr_type, 0) + 1

        # 统计卡片
        stat_cards = ""
        for attr_type, count in by_type.items():
            stat_cards += f"""
            <div class="stat-card">
                <div class="label">{attr_type}</div>
                <div class="value">{count}</div>
            </div>"""

        # 筛选选项
        filter_options = ""
        for attr_type in by_type.keys():
            filter_options += f'<option value="{attr_type}">{attr_type}</option>'

        # 表格行
        table_rows = ""
        for idx, record in enumerate(diff_records, 1):
            attr_type = record.get('attribution_type', '未知')
            diff_class = self._get_type_class(attr_type)
            table_rows += f"""
                <tr data-type="{attr_type}" class="{diff_class}">
                    <td>{idx}</td>
                    <td>{record.get('status', '')}</td>
                    <td>{attr_type}</td>
                    <td>{record.get('attribution_reason', '')}</td>
                    <td>{', '.join(record.get('diff_fields', []))}</td>
                </tr>"""

        html = self.template.format(
            total_count=len(diff_records),
            stat_cards=stat_cards,
            filter_options=filter_options,
            table_rows=table_rows
        )

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)

    def _get_type_class(self, attr_type: str) -> str:
        """获取类型对应的CSS类"""
        mapping = {
            '规格型号差': 'type-spec',
            '数量差': 'type-quantity',
            '单价差': 'type-price',
            '项目对照差': 'type-mapping',
            '其他': 'type-other'
        }
        return mapping.get(attr_type, 'type-other')
