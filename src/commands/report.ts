/**
 * CLI report 子命令
 * 命令格式: reconcile report <resultFile> [options]
 *
 * 选项:
 *   --type <type>     报告类型: summary | detail | clusters (默认: summary)
 *   --format <format> 输出格式: html | json (默认: json)
 *   --output <path>   输出文件路径
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { ReconciliationResult, DifferenceType, SemanticCluster } from '../types';
import { HtmlReporter, HtmlReportType } from '../services/htmlReporter';

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * 格式化金额
 */
function formatCurrency(amount: number): string {
  return amount.toFixed(2) + ' 元';
}

/**
 * 获取差异类型中文名称
 */
function getDifferenceTypeName(type: string): string {
  const typeNames: Record<string, string> = {
    'his_overcharge': 'HIS高套',
    'insurance_underpay': '医保低付',
    'quantity_diff': '数量差异',
    'system口径差': '系统口径差',
    'manual_reverse': '手工冲销',
    'matched': '完全匹配',
    'unknown': '未知类型',
  };
  return typeNames[type] || type;
}

/**
 * 生成 summary 类型报告 (控制台输出)
 */
function generateSummaryReport(result: ReconciliationResult): string {
  const lines: string[] = [];

  lines.push('\n' + '='.repeat(60));
  lines.push('医保对账分析报告 - 执行摘要');
  lines.push('='.repeat(60));

  lines.push('\n📁 数据文件:');
  lines.push(`   HIS数据: ${result.hisFilePath}`);
  lines.push(`   医保数据: ${result.insuranceFilePath}`);
  lines.push(`   对账模式: ${result.mode}`);
  lines.push(`   执行时间: ${new Date(result.executedAt).toLocaleString('zh-CN')}`);

  lines.push('\n📊 数据统计:');
  lines.push(`   HIS 记录数: ${result.totalHisRecords}`);
  lines.push(`   医保记录数: ${result.totalInsuranceRecords}`);

  lines.push('\n✅ 对齐结果:');
  lines.push(`   完全匹配: ${result.matchedCount} 条`);
  lines.push(`   金额差异: ${result.amountDiffCount} 条`);
  lines.push(`   HIS 独有: ${result.hisOnlyCount} 条`);
  lines.push(`   医保独有: ${result.insuranceOnlyCount} 条`);

  lines.push('\n💰 金额汇总:');
  lines.push(`   总差异金额: ${formatCurrency(result.totalDifferenceAmount)}`);

  if (result.differenceTypeStats) {
    lines.push('\n📋 差异类型分布:');
    for (const [type, count] of Object.entries(result.differenceTypeStats)) {
      const name = getDifferenceTypeName(type);
      lines.push(`   ${name}: ${count} 条`);
    }
  }

  if (result.semanticClusters && result.semanticClusters.length > 0) {
    lines.push('\n🔍 语义聚类结果:');
    lines.push(`   共 ${result.semanticClusters.length} 个类别`);
    for (const cluster of result.semanticClusters) {
      lines.push(`   - ${cluster.categoryName}: ${cluster.recordCount}条, 金额: ${formatCurrency(cluster.totalAmount)}`);
    }
  }

  lines.push('\n⏱️  执行信息:');
  lines.push(`   执行耗时: ${result.executionTimeMs} ms`);
  lines.push(`   Mock模式: ${result.isMockMode ? '是' : '否'}`);

  lines.push('\n' + '='.repeat(60));

  return lines.join('\n');
}

/**
 * 生成 detail 类型报告 (控制台输出)
 */
function generateDetailReport(result: ReconciliationResult): string {
  const lines: string[] = [];

  lines.push('\n' + '='.repeat(60));
  lines.push('医保对账分析报告 - 差异明细');
  lines.push('='.repeat(60));

  // 筛选出有差异的记录
  const diffRecords = result.alignedRecords.filter(r =>
    r.alignStatus !== 'matched' || r.preliminaryType !== undefined
  );

  if (diffRecords.length === 0) {
    lines.push('\n✅ 未发现差异记录');
    lines.push('='.repeat(60));
    return lines.join('\n');
  }

  lines.push(`\n共发现 ${diffRecords.length} 条差异记录\n`);

  // 按差异金额排序
  const sortedRecords = [...diffRecords].sort((a, b) =>
    Math.abs(b.differenceAmount) - Math.abs(a.differenceAmount)
  );

  // 显示前50条明细
  const displayRecords = sortedRecords.slice(0, 50);

  lines.push('┌' + '─'.repeat(8) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(10) + '┐');
  lines.push('│ 序号  │ 患者ID      │ HIS金额    │ 医保金额  │ 差异金额     │ 类型      │');
  lines.push('├' + '─'.repeat(8) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(10) + '┤');

  for (let i = 0; i < displayRecords.length; i++) {
    const record = displayRecords[i];
    if (!record) continue;
    const hisAmt = record.hisRecord ? record.hisRecord.amount : 0;
    const insAmt = record.insuranceRecord ? record.insuranceRecord.amount : 0;
    const type = record.preliminaryType ? getDifferenceTypeName(record.preliminaryType) : record.alignStatus;

    lines.push(
      `│ ${String(i + 1).padEnd(6)} │ ${(record.alignKey.split('_')[0] || '').substring(0, 10).padEnd(12)} │ ${formatCurrency(hisAmt).padEnd(10)} │ ${formatCurrency(insAmt).padEnd(8)} │ ${formatCurrency(record.differenceAmount).padEnd(10)} │ ${type.substring(0, 8).padEnd(8)} │`
    );
  }

  if (sortedRecords.length > 50) {
    lines.push('└' + '─'.repeat(8) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(10) + '┘');
    lines.push(`\n... 还有 ${sortedRecords.length - 50} 条记录未显示`);
  } else {
    lines.push('└' + '─'.repeat(8) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(10) + '┘');
  }

  lines.push('\n💡 提示: 完整差异明细请使用 JSON 格式导出查看');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * 生成 clusters 类型报告 (控制台输出)
 */
function generateClustersReport(result: ReconciliationResult): string {
  const lines: string[] = [];

  lines.push('\n' + '='.repeat(60));
  lines.push('医保对账分析报告 - 语义聚类结果');
  lines.push('='.repeat(60));

  if (!result.semanticClusters || result.semanticClusters.length === 0) {
    lines.push('\n⚠️ 未启用语义聚类或无聚类结果');
    lines.push('   请使用 full 模式重新分析以获取语义聚类结果');
    lines.push('='.repeat(60));
    return lines.join('\n');
  }

  lines.push(`\n共 ${result.semanticClusters.length} 个语义聚类类别\n`);

  for (const cluster of result.semanticClusters) {
    lines.push('┌' + '─'.repeat(50) + '┐');
    lines.push(`│ ${cluster.categoryName.padEnd(48)} │`);
    lines.push('├' + '─'.repeat(50) + '┤');
    lines.push(`│ 涉及记录: ${String(cluster.recordCount).padEnd(36)} │`);
    lines.push(`│ 涉及金额: ${formatCurrency(cluster.totalAmount).padEnd(37)} │`);

    if (cluster.attribution) {
      const attrLines = cluster.attribution.split('\n').filter(l => l.trim());
      for (const attrLine of attrLines.slice(0, 3)) {
        lines.push(`│ 归因: ${attrLine.substring(0, 42).padEnd(44)} │`);
      }
    }

    if (cluster.suggestedAction) {
      lines.push(`│ 建议: ${cluster.suggestedAction.substring(0, 41).padEnd(43)} │`);
    }

    if (cluster.typicalCases && cluster.typicalCases.length > 0) {
      lines.push('├' + '─'.repeat(50) + '┤');
      lines.push('│ 典型案例:');
      for (const c of cluster.typicalCases.slice(0, 3)) {
        const caseDesc = `${c.patientIdMasked} | ${c.itemName} | 差异: ${formatCurrency(c.differenceAmount)}`;
        lines.push(`│   ${caseDesc.substring(0, 46).padEnd(48)} │`);
      }
    }

    lines.push('└' + '─'.repeat(50) + '┘');
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * 生成 JSON 格式报告
 */
function generateJsonReport(result: ReconciliationResult, reportType: string): string {
  let output: any;

  switch (reportType) {
    case 'summary':
      output = {
        reportType: 'summary',
        generatedAt: new Date().toISOString(),
        summary: {
          dataFiles: {
            his: result.hisFilePath,
            insurance: result.insuranceFilePath,
          },
          mode: result.mode,
          executedAt: result.executedAt,
          stats: {
            totalHisRecords: result.totalHisRecords,
            totalInsuranceRecords: result.totalInsuranceRecords,
            matchedCount: result.matchedCount,
            amountDiffCount: result.amountDiffCount,
            hisOnlyCount: result.hisOnlyCount,
            insuranceOnlyCount: result.insuranceOnlyCount,
            totalDifferenceAmount: result.totalDifferenceAmount,
          },
          differenceTypeStats: result.differenceTypeStats,
          semanticClusterCount: result.semanticClusters?.length || 0,
          executionTimeMs: result.executionTimeMs,
          isMockMode: result.isMockMode,
        },
      };
      break;

    case 'detail':
      output = {
        reportType: 'detail',
        generatedAt: new Date().toISOString(),
        summary: {
          totalHisRecords: result.totalHisRecords,
          totalInsuranceRecords: result.totalInsuranceRecords,
          matchedCount: result.matchedCount,
          amountDiffCount: result.amountDiffCount,
          hisOnlyCount: result.hisOnlyCount,
          insuranceOnlyCount: result.insuranceOnlyCount,
          totalDifferenceAmount: result.totalDifferenceAmount,
        },
        alignedRecords: result.alignedRecords.map(r => ({
          alignKey: r.alignKey,
          alignStatus: r.alignStatus,
          differenceAmount: r.differenceAmount,
          differenceQuantity: r.differenceQuantity,
          preliminaryType: r.preliminaryType,
          hisRecord: r.hisRecord ? {
            patientId: r.hisRecord.patientId,
            visitDate: r.hisRecord.visitDate,
            itemCode: r.hisRecord.itemCode,
            itemName: r.hisRecord.itemName,
            amount: r.hisRecord.amount,
            departmentName: r.hisRecord.departmentName,
          } : null,
          insuranceRecord: r.insuranceRecord ? {
            patientId: r.insuranceRecord.patientId,
            visitDate: r.insuranceRecord.visitDate,
            itemCode: r.insuranceRecord.itemCode,
            amount: r.insuranceRecord.amount,
            payAmount: r.insuranceRecord.payAmount,
            rejectReason: r.insuranceRecord.rejectReason,
          } : null,
        })),
      };
      break;

    case 'clusters':
      output = {
        reportType: 'clusters',
        generatedAt: new Date().toISOString(),
        clusters: result.semanticClusters?.map(c => ({
          clusterId: c.clusterId,
          categoryName: c.categoryName,
          recordCount: c.recordCount,
          totalAmount: c.totalAmount,
          attribution: c.attribution,
          suggestedAction: c.suggestedAction,
          typicalCases: c.typicalCases.map(t => ({
            patientIdMasked: t.patientIdMasked,
            visitDate: t.visitDate,
            itemName: t.itemName,
            differenceAmount: t.differenceAmount,
            briefDescription: t.briefDescription,
          })),
        })) || [],
      };
      break;

    default:
      output = result;
  }

  return JSON.stringify(output, null, 2);
}

/**
 * 创建 report 子命令
 */
export function createReportCommand(): Command {
  const command = new Command('report');

  command
    .description('生成对账分析报告')
    .argument('<resultFile>', '上次分析的结果文件路径 (JSON格式)')
    .option('-t, --type <type>', '报告类型: summary | detail | clusters (默认: summary)', 'summary')
    .option('-f, --format <format>', '输出格式: html | json (默认: json)', 'json')
    .option('-o, --output <path>', '输出文件路径 (默认: output/ 目录)')
    .addHelpText('after', `
\x1b[32m使用示例：\x1b[0m
  $ reconcile report result.json
  $ reconcile report result.json --type summary
  $ reconcile report result.json --type detail --format html
  $ reconcile report result.json --type clusters --output clusters.html

\x1b[32m报告类型说明：\x1b[0m
  summary  - 执行摘要：总览数据统计、对齐结果、差异类型分布
  detail   - 差异明细：列出所有差异记录的详细信息
  clusters - 语义聚类：按语义聚类类别分组显示结果

\x1b[32m输出格式说明：\x1b[0m
  html     - 生成可交互的 HTML 报告（含图表）
  json     - 输出结构化 JSON 格式报告`)
    .action(async (resultFile: string, options: any) => {
      try {
        // 检查文件是否存在
        if (!fs.existsSync(resultFile)) {
          console.error(`❌ 错误: 结果文件不存在: ${resultFile}`);
          process.exit(1);
        }

        // 读取结果文件
        const fileContent = fs.readFileSync(resultFile, 'utf-8');
        let result: ReconciliationResult;

        try {
          result = JSON.parse(fileContent);
        } catch (parseError) {
          console.error(`❌ 错误: 结果文件格式无效，无法解析为 JSON`);
          process.exit(1);
        }

        // 验证结果文件格式
        if (!result.alignedRecords || !result.totalHisRecords) {
          console.error(`❌ 错误: 结果文件格式不正确，缺少必要字段`);
          process.exit(1);
        }

        const reportType = options.type || 'summary';
        const outputFormat = options.format || 'json';

        // 显示生成信息
        console.log('='.repeat(60));
        console.log('医保对账报告生成器');
        console.log('='.repeat(60));
        console.log(`结果文件: ${resultFile}`);
        console.log(`文件大小: ${formatFileSize(fs.statSync(resultFile).size)}`);
        console.log(`报告类型: ${reportType}`);
        console.log(`输出格式: ${outputFormat}`);
        console.log('='.repeat(60));

        let outputContent: string;
        let outputExtension: string;

        if (outputFormat === 'html') {
          // 使用 HtmlReporter 生成 HTML 报告
          const htmlReporter = new HtmlReporter();
          const htmlReportType = reportType as HtmlReportType;
          let outputPath = options.output;

          if (!outputPath) {
            outputPath = path.join(process.cwd(), 'output', `report_${reportType}_${Date.now()}.html`);
          }

          const htmlPath = htmlReporter.generateReport(result, htmlReportType, outputPath);
          console.log(`\n✅ HTML 报告已保存到: ${htmlPath}`);
          console.log('');
          process.exit(0);
        } else {
          outputExtension = outputFormat === 'json' ? 'json' : 'txt';
        }

        if (outputFormat === 'json') {
          outputContent = generateJsonReport(result, reportType);
        } else {
          // 控制台输出
          switch (reportType) {
            case 'detail':
              outputContent = generateDetailReport(result);
              break;
            case 'clusters':
              outputContent = generateClustersReport(result);
              break;
            case 'summary':
            default:
              outputContent = generateSummaryReport(result);
              break;
          }
          console.log(outputContent);
        }

        // 保存到文件
        if (outputFormat === 'json' && outputContent) {
          const outputPath = options.output
            ? path.resolve(options.output)
            : path.join(process.cwd(), 'output', `report_${reportType}_${Date.now()}.json`);

          const outputDir = path.dirname(outputPath);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          fs.writeFileSync(outputPath, outputContent, 'utf-8');
          console.log(`\n✅ 报告已保存到: ${outputPath}`);
        }

        console.log('');
        process.exit(0);
      } catch (error: any) {
        console.error('\n❌ 报告生成失败:', error.message || error);
        if (error.stack) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });

  return command;
}

export default createReportCommand;
