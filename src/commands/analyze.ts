/**
 * CLI analyze 子命令
 * 命令格式: reconcile analyze <hisFile> <insuranceFile> [options]
 *
 * 选项:
 *   --format <type>     文件格式: csv | excel (默认: 自动检测)
 *   --output <path>     输出文件路径 (JSON格式)
 *   --mapping <path>    字段映射配置文件路径
 *   --mode <mode>       对账模式: full | semantic | fast (默认: full)
 *   --mock              使用 Mock LLM 模式
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { ReconciliationEngine } from '../services/reconciliationEngine';
import { ReconciliationMode, ProgressInfo } from '../types';

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
 * 打印进度条
 */
function printProgress(progress: ProgressInfo): void {
  const barLength = 30;
  const filledLength = Math.round(barLength * progress.percent / 100);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  const message = progress.message || '';
  console.log(`\r[${bar}] ${progress.percent}% ${message}`);
}

/**
 * 打印结果摘要
 */
function printResultSummary(result: any): void {
  console.log('\n' + '='.repeat(60));
  console.log('对账分析结果摘要');
  console.log('='.repeat(60));

  console.log('\n📊 数据统计:');
  console.log(`   HIS 记录数: ${result.totalHisRecords}`);
  console.log(`   医保记录数: ${result.totalInsuranceRecords}`);

  console.log('\n✅ 对齐结果:');
  console.log(`   完全匹配: ${result.matchedCount}`);
  console.log(`   金额差异: ${result.amountDiffCount}`);
  console.log(`   HIS 独有: ${result.hisOnlyCount}`);
  console.log(`   医保独有: ${result.insuranceOnlyCount}`);

  console.log('\n💰 金额汇总:');
  console.log(`   总差异金额: ${formatCurrency(result.totalDifferenceAmount)}`);

  if (result.differenceTypeStats) {
    console.log('\n📋 差异类型分布:');
    const stats = result.differenceTypeStats;
    const typeNames: Record<string, string> = {
      'his_overcharge': 'HIS高套',
      'insurance_underpay': '医保低付',
      'quantity_diff': '数量差异',
      'system口径差': '系统口径差',
      'manual_reverse': '手工冲销',
      'matched': '完全匹配',
      'unknown': '未知类型',
    };
    for (const [type, count] of Object.entries(stats)) {
      const name = typeNames[type] || type;
      console.log(`   ${name}: ${count}`);
    }
  }

  if (result.semanticClusters && result.semanticClusters.length > 0) {
    console.log('\n🔍 语义聚类结果:');
    for (const cluster of result.semanticClusters) {
      console.log(`   [${cluster.categoryName}] ${cluster.recordCount}条, 涉及金额: ${formatCurrency(cluster.totalAmount)}`);
    }
  }

  console.log('\n⏱️  执行信息:');
  console.log(`   执行耗时: ${result.executionTimeMs} ms`);
  console.log(`   执行时间: ${new Date(result.executedAt).toLocaleString('zh-CN')}`);
  console.log(`   Mock模式: ${result.isMockMode ? '是' : '否'}`);

  console.log('\n' + '='.repeat(60));
}

/**
 * 创建 analyze 子命令
 */
export function createAnalyzeCommand(): Command {
  const command = new Command('analyze');

  command
    .description('分析 HIS 结算数据和医保回传数据的差异')
    .argument('<hisFile>', 'HIS 结算数据文件路径 (CSV 或 Excel)')
    .argument('<insuranceFile>', '医保回传数据文件路径 (CSV 或 Excel)')
    .option('-f, --format <type>', '文件格式: csv | excel (默认: 自动检测)')
    .option('-o, --output <path>', '输出文件路径 (JSON格式)')
    .option('-m, --mapping <path>', '字段映射配置文件路径')
    .option('--mode <mode>', '对账模式: full | semantic | fast (默认: full)', 'full')
    .option('--mock', '使用 Mock LLM 模式 (不调用真实 API)', false)
    .addHelpText('after', `
\x1b[32m使用示例：\x1b[0m
  $ reconcile analyze his.csv insurance.csv
  $ reconcile analyze his.csv insurance.csv --output result.json
  $ reconcile analyze his.csv insurance.csv --mode semantic --mock
  $ reconcile analyze data/his.xlsx data/insurance.xlsx --format excel

\x1b[32m对账模式说明：\x1b[0m
  full     - 完整模式：数据导入 → 对齐 → 差异分类 → 语义聚类（默认）
  semantic - 语义模式：数据导入 → 对齐 → 差异分类 → 语义聚类（等价于 full）
  fast     - 快速模式：仅做数据导入和对齐，不进行语义聚类

\x1b[32m输出说明：\x1b[0m
  分析结果保存为 JSON 文件，包含所有对齐记录和统计信息
  可使用 reconcile report 命令生成可视化报告`)
    .action(async (hisFile: string, insuranceFile: string, options: any) => {
      try {
        // 检查文件是否存在
        if (!fs.existsSync(hisFile)) {
          console.error(`❌ 错误: HIS 文件不存在: ${hisFile}`);
          process.exit(1);
        }
        if (!fs.existsSync(insuranceFile)) {
          console.error(`❌ 错误: 医保文件不存在: ${insuranceFile}`);
          process.exit(1);
        }

        // 检查映射文件
        let mappingConfigPath = options.mapping;
        if (mappingConfigPath && !fs.existsSync(mappingConfigPath)) {
          console.error(`❌ 错误: 映射配置文件不存在: ${mappingConfigPath}`);
          process.exit(1);
        }

        // 解析对账模式
        let mode: ReconciliationMode;
        switch (options.mode?.toLowerCase()) {
          case 'fast':
            mode = ReconciliationMode.FAST;
            break;
          case 'semantic':
            mode = ReconciliationMode.SEMANTIC;
            break;
          case 'full':
          default:
            mode = ReconciliationMode.FULL;
        }

        // 显示启动信息
        console.log('='.repeat(60));
        console.log('医保对账差异语义聚类分析器');
        console.log('='.repeat(60));
        console.log(`HIS 文件: ${hisFile}`);
        console.log(`  大小: ${formatFileSize(fs.statSync(hisFile).size)}`);
        console.log(`医保文件: ${insuranceFile}`);
        console.log(`  大小: ${formatFileSize(fs.statSync(insuranceFile).size)}`);
        console.log(`对账模式: ${mode}`);
        console.log(`Mock LLM: ${options.mock ? '是' : '否'}`);
        if (mappingConfigPath) {
          console.log(`映射配置: ${mappingConfigPath}`);
        }
        console.log('='.repeat(60));
        console.log('');

        // 创建引擎实例
        const engine = new ReconciliationEngine({
          mappingConfigPath: mappingConfigPath || undefined,
          mockLLM: options.mock || false,
          maxConcurrent: 5,
          onProgress: (progress: ProgressInfo) => {
            // 清除当前行并打印进度
            process.stdout.write('\r\x1b[K');
            const barLength = 30;
            const filledLength = Math.round(barLength * progress.percent / 100);
            const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
            process.stdout.write(`[${bar}] ${progress.percent}% ${progress.message || ''}`);
          },
        });

        // 执行对账分析
        console.log('开始分析...\n');
        const result = await engine.run(hisFile, insuranceFile, { mode });

        // 打印结果摘要
        printResultSummary(result);

        // 保存结果到文件
        if (options.output) {
          const outputPath = path.resolve(options.output);
          const outputDir = path.dirname(outputPath);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
          console.log(`\n✅ 结果已保存到: ${outputPath}`);
        } else {
          // 默认保存到 output 目录
          const defaultOutputDir = path.join(process.cwd(), 'output');
          if (!fs.existsSync(defaultOutputDir)) {
            fs.mkdirSync(defaultOutputDir, { recursive: true });
          }
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const defaultOutputPath = path.join(defaultOutputDir, `reconciliation_${timestamp}.json`);
          fs.writeFileSync(defaultOutputPath, JSON.stringify(result, null, 2), 'utf-8');
          console.log(`\n💾 结果已保存到: ${defaultOutputPath}`);
        }

        console.log('');
        process.exit(0);
      } catch (error: any) {
        console.error('\n❌ 分析失败:', error.message || error);
        if (error.stack) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });

  return command;
}

export default createAnalyzeCommand;