/**
 * HTML 报告生成器
 * 生成可视化的医保对账差异分析报告（HTML格式）
 *
 * 功能说明：
 * - 读取 ReconciliationResult 数据
 * - 加载 HTML 模板
 * - 注入数据生成最终报告
 * - 支持三种报告类型：summary、detail、clusters
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ReconciliationResult,
  AlignedRecord,
  SemanticCluster,
  DifferenceType,
} from '../types';

/**
 * HTML 报告生成器选项
 */
export interface HtmlReporterOptions {
  /** 模板文件路径 */
  templatePath?: string;
  /** 输出目录 */
  outputDir?: string;
}

/**
 * 报告类型
 */
export type HtmlReportType = 'summary' | 'detail' | 'clusters' | 'full';

/**
 * HTML 报告生成器类
 */
export class HtmlReporter {
  private templatePath: string;
  private outputDir: string;
  private templateContent: string;

  constructor(options?: HtmlReporterOptions) {
    // 默认模板路径
    this.templatePath = options?.templatePath ||
      path.join(__dirname, '../../templates/report.html');

    // 默认输出目录
    this.outputDir = options?.outputDir || path.join(process.cwd(), 'output');

    // 预加载模板
    this.templateContent = '';
  }

  /**
   * 加载 HTML 模板
   */
  private loadTemplate(): string {
    if (this.templateContent) {
      return this.templateContent;
    }

    try {
      if (fs.existsSync(this.templatePath)) {
        this.templateContent = fs.readFileSync(this.templatePath, 'utf-8');
      } else {
        throw new Error(`模板文件不存在: ${this.templatePath}`);
      }
      return this.templateContent;
    } catch (error: any) {
      throw new Error(`加载 HTML 模板失败: ${error.message}`);
    }
  }

  /**
   * 准备差异记录数据（过滤、排序）
   */
  private prepareDiffRecords(result: ReconciliationResult): AlignedRecord[] {
    if (!result.alignedRecords) {
      return [];
    }

    return result.alignedRecords
      .filter(r => r.alignStatus !== 'matched')
      .sort((a, b) => Math.abs(b.differenceAmount) - Math.abs(a.differenceAmount));
  }

  /**
   * 生成报告内容
   */
  private generateReportContent(result: ReconciliationResult): string {
    const template = this.loadTemplate();

    // 将数据注入到模板的 JavaScript 中
    // 方法：在模板末尾注入数据初始化脚本
    const dataInjection = `
    <script>
      // 注入对账结果数据
      const reconciliationResult = ${JSON.stringify(this.sanitizeForJson(result))};

      // 页面加载完成后注入数据
      document.addEventListener('DOMContentLoaded', function() {
        injectData(reconciliationResult);
      });
    </script>
    `;

    // 在 </body> 之前插入数据注入脚本
    return template.replace('</body>', `${dataInjection}\n</body>`);
  }

  /**
   * 清理数据用于 JSON 序列化
   * 处理循环引用和特殊值
   */
  private sanitizeForJson(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'function') {
      return undefined;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    // 处理数组
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeForJson(item));
    }

    // 处理普通对象
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) {
        continue;
      }
      sanitized[key] = this.sanitizeForJson(value);
    }
    return sanitized;
  }

  /**
   * 生成报告文件路径
   */
  private getOutputPath(result: ReconciliationResult, reportType: HtmlReportType): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `reconciliation_report_${reportType}_${timestamp}.html`;
    return path.join(this.outputDir, filename);
  }

  /**
   * 确保输出目录存在
   */
  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * 生成 HTML 报告
   * @param result 对账结果
   * @param reportType 报告类型：summary(摘要)、detail(明细)、clusters(聚类)、full(完整)
   * @param outputPath 输出路径（可选）
   * @returns 生成的报告文件路径
   */
  generateReport(
    result: ReconciliationResult,
    reportType: HtmlReportType = 'full',
    outputPath?: string
  ): string {
    // 确保输出目录
    this.ensureOutputDir();

    // 确定输出路径
    const finalOutputPath = outputPath || this.getOutputPath(result, reportType);

    // 生成报告内容
    const reportContent = this.generateReportContent(result);

    // 写入文件
    fs.writeFileSync(finalOutputPath, reportContent, 'utf-8');

    return finalOutputPath;
  }

  /**
   * 生成摘要报告（仅包含关键统计信息）
   */
  generateSummaryReport(result: ReconciliationResult, outputPath?: string): string {
    return this.generateReport(result, 'summary', outputPath);
  }

  /**
   * 生成明细报告（包含完整差异列表）
   */
  generateDetailReport(result: ReconciliationResult, outputPath?: string): string {
    return this.generateReport(result, 'detail', outputPath);
  }

  /**
   * 生成聚类报告（仅包含语义聚类结果）
   */
  generateClusterReport(result: ReconciliationResult, outputPath?: string): string {
    return this.generateReport(result, 'clusters', outputPath);
  }

  /**
   * 生成完整报告
   */
  generateFullReport(result: ReconciliationResult, outputPath?: string): string {
    return this.generateReport(result, 'full', outputPath);
  }

  /**
   * 获取报告统计摘要
   */
  getReportSummary(result: ReconciliationResult): {
    totalRecords: number;
    matchedCount: number;
    amountDiffCount: number;
    hisOnlyCount: number;
    insuranceOnlyCount: number;
    totalDifferenceAmount: number;
    diffTypeDistribution: Record<string, number>;
    topDepartments: Array<{ name: string; amount: number }>;
  } {
    const diffRecords = this.prepareDiffRecords(result);

    // 科室分布
    const deptMap = new Map<string, number>();
    for (const record of diffRecords) {
      if (record.hisRecord) {
        const dept = record.hisRecord.departmentName || '未知科室';
        const amount = Math.abs(record.differenceAmount);
        deptMap.set(dept, (deptMap.get(dept) || 0) + amount);
      }
    }

    const topDepartments = Array.from(deptMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, amount]) => ({ name, amount }));

    return {
      totalRecords: result.totalHisRecords,
      matchedCount: result.matchedCount,
      amountDiffCount: result.amountDiffCount,
      hisOnlyCount: result.hisOnlyCount,
      insuranceOnlyCount: result.insuranceOnlyCount,
      totalDifferenceAmount: result.totalDifferenceAmount,
      diffTypeDistribution: result.differenceTypeStats || {},
      topDepartments,
    };
  }
}

export default HtmlReporter;
