/**
 * CLI query 子命令
 * 命令格式: reconcile query <resultFile> [options]
 *
 * 选项:
 *   --patient <patientId>  按患者ID查询
 *   --cluster <clusterType> 按语义聚类类别查询
 *   --type <differenceType> 按差异类型查询
 */

import { Command } from 'commander';
import * as fs from 'fs';
import chalk from 'chalk';
import { ReconciliationResult, DifferenceType, AlignedRecord, SemanticCluster } from '../types';

/**
 * 格式化金额
 */
function formatCurrency(amount: number): string {
  return amount.toFixed(2) + ' 元';
}

/**
 * 脱敏患者ID (只显示后4位)
 */
function maskPatientId(patientId: string): string {
  if (!patientId) return '****';
  if (patientId.length <= 4) return '****';
  return '****' + patientId.slice(-4);
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
 * 打印单条差异记录的详细信息
 */
function printAlignedRecordDetail(record: AlignedRecord, index: number, showColor: boolean = true): void {
  const alignStatusNames: Record<string, string> = {
    'matched': '完全匹配',
    'amount_diff': '金额差异',
    'his_only': 'HIS独有',
    'insurance_only': '医保独有',
  };

  const statusName = alignStatusNames[record.alignStatus] || record.alignStatus;
  const typeName = record.preliminaryType ? getDifferenceTypeName(record.preliminaryType) : '-';

  const c = showColor ? chalk : {
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    magenta: (s: string) => s,
    bold: (s: string) => s,
    dim: (s: string) => s,
    gray: (s: string) => s,
  };

  console.log('');
  console.log(c.cyan('┌') + '─'.repeat(56) + c.cyan('┐'));
  console.log(c.cyan('│') + c.bold(` 差异记录 #${index + 1}`).padEnd(57) + c.cyan('│'));
  console.log(c.cyan('├') + '─'.repeat(56) + c.cyan('┤'));

  // 对齐键
  console.log(c.cyan('│') + ` 对齐键: ${record.alignKey}`.padEnd(57) + c.cyan('│'));

  // 对齐状态
  let statusColor = c.green;
  if (record.alignStatus === 'amount_diff') statusColor = c.yellow;
  if (record.alignStatus === 'his_only' || record.alignStatus === 'insurance_only') statusColor = c.red;
  console.log(c.cyan('│') + ` 状态: ${statusColor(statusName)}`.padEnd(57) + c.cyan('│'));
  console.log(c.cyan('│') + ` 初步分类: ${c.magenta(typeName)}`.padEnd(57) + c.cyan('│'));

  // 差异金额
  if (record.differenceAmount !== 0) {
    const diffColor = record.differenceAmount > 0 ? c.red : c.yellow;
    console.log(c.cyan('│') + ` 差异金额: ${diffColor(formatCurrency(record.differenceAmount))}`.padEnd(57) + c.cyan('│'));
  }
  if (record.differenceQuantity !== 0) {
    console.log(c.cyan('│') + ` 差异数量: ${c.yellow(record.differenceQuantity.toString())}`.padEnd(57) + c.cyan('│'));
  }

  // HIS 记录信息
  if (record.hisRecord) {
    console.log(c.cyan('├') + '─'.repeat(56) + c.cyan('┤'));
    console.log(c.cyan('│') + c.bold('  HIS 记录:').padEnd(57) + c.cyan('│'));
    console.log(c.cyan('│') + `   患者ID: ${c.dim(maskPatientId(record.hisRecord.patientId))}`.padEnd(57) + c.cyan('│'));
    console.log(c.cyan('│') + `   就诊日期: ${c.dim(record.hisRecord.visitDate)}`.padEnd(57) + c.cyan('│'));
    console.log(c.cyan('│') + `   项目: ${c.dim(record.hisRecord.itemName || record.hisRecord.itemCode)}`.padEnd(57) + c.cyan('│'));
    console.log(c.cyan('│') + `   金额: ${c.yellow(formatCurrency(record.hisRecord.amount))}`.padEnd(57) + c.cyan('│'));
    if (record.hisRecord.departmentName) {
      console.log(c.cyan('│') + `   科室: ${c.dim(record.hisRecord.departmentName)}`.padEnd(57) + c.cyan('│'));
    }
  }

  // 医保记录信息
  if (record.insuranceRecord) {
    console.log(c.cyan('├') + '─'.repeat(56) + c.cyan('┤'));
    console.log(c.cyan('│') + c.bold('  医保记录:').padEnd(57) + c.cyan('│'));
    console.log(c.cyan('│') + `   患者ID: ${c.dim(maskPatientId(record.insuranceRecord.patientId))}`.padEnd(57) + c.cyan('│'));
    console.log(c.cyan('│') + `   就诊日期: ${c.dim(record.insuranceRecord.visitDate)}`.padEnd(57) + c.cyan('│'));
    console.log(c.cyan('│') + `   项目编码: ${c.dim(record.insuranceRecord.itemCode)}`.padEnd(57) + c.cyan('│'));
    console.log(c.cyan('│') + `   认定金额: ${c.dim(formatCurrency(record.insuranceRecord.amount))}`.padEnd(57) + c.cyan('│'));
    console.log(c.cyan('│') + `   实付金额: ${c.green(formatCurrency(record.insuranceRecord.payAmount))}`.padEnd(57) + c.cyan('│'));
    if (record.insuranceRecord.rejectReason) {
      console.log(c.cyan('│') + `   扣款原因: ${c.red(record.insuranceRecord.rejectReason)}`.padEnd(57) + c.cyan('│'));
    }
  }

  console.log(c.cyan('└') + '─'.repeat(56) + c.cyan('┘'));
}

/**
 * 打印语义聚类详情
 */
function printClusterDetail(cluster: SemanticCluster, index: number, showColor: boolean = true): void {
  const c = showColor ? chalk : {
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    magenta: (s: string) => s,
    bold: (s: string) => s,
    dim: (s: string) => s,
  };

  console.log('');
  console.log(c.cyan('┌') + '─'.repeat(56) + c.cyan('┐'));
  console.log(c.cyan('│') + c.bold(` 语义聚类 #${index + 1}: ${cluster.categoryName}`).padEnd(57) + c.cyan('│'));
  console.log(c.cyan('├') + '─'.repeat(56) + c.cyan('┤'));
  console.log(c.cyan('│') + ` 聚类ID: ${c.dim(cluster.clusterId)}`.padEnd(57) + c.cyan('│'));
  console.log(c.cyan('│') + ` 涉及记录: ${c.yellow(cluster.recordCount.toString())} 条`.padEnd(57) + c.cyan('│'));
  console.log(c.cyan('│') + ` 涉及金额: ${c.red(formatCurrency(cluster.totalAmount))}`.padEnd(57) + c.cyan('│'));

  if (cluster.attribution) {
    const attrLines = cluster.attribution.split('\n').filter(l => l.trim());
    console.log(c.cyan('├') + '─'.repeat(56) + c.cyan('┤'));
    console.log(c.cyan('│') + c.bold(' 归因说明:').padEnd(57) + c.cyan('│'));
    for (const line of attrLines.slice(0, 4)) {
      console.log(c.cyan('│') + `   ${line.substring(0, 52)}`.padEnd(57) + c.cyan('│'));
    }
  }

  if (cluster.suggestedAction) {
    console.log(c.cyan('├') + '─'.repeat(56) + c.cyan('┤'));
    console.log(c.cyan('│') + c.bold(' 建议处理:').padEnd(57) + c.cyan('│'));
    const actionLines = cluster.suggestedAction.split('\n').filter(l => l.trim());
    for (const line of actionLines.slice(0, 3)) {
      console.log(c.cyan('│') + `   ${line.substring(0, 52)}`.padEnd(57) + c.cyan('│'));
    }
  }

  if (cluster.typicalCases && cluster.typicalCases.length > 0) {
    console.log(c.cyan('├') + '─'.repeat(56) + c.cyan('┤'));
    console.log(c.cyan('│') + c.bold(' 典型案例 (脱敏):').padEnd(57) + c.cyan('│'));
    for (const tc of cluster.typicalCases.slice(0, 3)) {
      const caseLine = `${tc.patientIdMasked} | ${tc.itemName} | 差异: ${formatCurrency(tc.differenceAmount)}`;
      console.log(c.cyan('│') + `   ${caseLine.substring(0, 52)}`.padEnd(57) + c.cyan('│'));
    }
  }

  console.log(c.cyan('└') + '─'.repeat(56) + c.cyan('┘'));
}

/**
 * 按患者ID查询差异记录
 */
function queryByPatientId(result: ReconciliationResult, patientId: string): AlignedRecord[] {
  return result.alignedRecords.filter(r => {
    if (r.hisRecord && r.hisRecord.patientId === patientId) return true;
    if (r.insuranceRecord && r.insuranceRecord.patientId === patientId) return true;
    return false;
  });
}

/**
 * 按差异类型查询
 */
function queryByDifferenceType(result: ReconciliationResult, diffType: string): AlignedRecord[] {
  return result.alignedRecords.filter(r => {
    if (r.preliminaryType === diffType) return true;
    if (diffType === 'all' || diffType === '差异') {
      return r.alignStatus !== 'matched';
    }
    return false;
  });
}

/**
 * 按语义聚类类别查询
 */
function queryByClusterType(result: ReconciliationResult, clusterType: string): AlignedRecord[] {
  // 首先找到对应的聚类
  const matchedCluster = result.semanticClusters?.find(
    c => c.categoryName.toLowerCase().includes(clusterType.toLowerCase()) ||
         c.clusterId.toLowerCase().includes(clusterType.toLowerCase())
  );

  if (!matchedCluster) {
    return [];
  }

  // 从聚类的典型案例中提取相关的对齐记录
  // 由于对齐记录不直接关联聚类ID，我们返回空列表并提示用户
  // 实际实现中需要在对账结果中建立聚类ID和对齐记录的映射
  console.log(chalk.yellow(`\n⚠️ 提示: 语义聚类 "${matchedCluster.categoryName}" 包含 ${matchedCluster.recordCount} 条记录`));
  console.log(chalk.dim('   完整差异明细请使用 --type all 查看所有差异记录\n'));

  return [];
}

/**
 * 创建 query 子命令
 */
export function createQueryCommand(): Command {
  const command = new Command('query');

  command
    .description('查询对账结果中的差异记录')
    .argument('<resultFile>', '上次分析的结果文件路径 (JSON格式)')
    .option('-p, --patient <patientId>', '按患者ID查询')
    .option('-c, --cluster <clusterType>', '按语义聚类类别查询')
    .option('-t, --type <differenceType>', '按差异类型查询 (all|his_overcharge|insurance_underpay|quantity_diff|system口径差|manual_reverse)')
    .addHelpText('after', `
\x1b[32m使用示例：\x1b[0m
  $ reconcile query result.json --patient P001
  $ reconcile query result.json --type his_overcharge
  $ reconcile query result.json --cluster 药品规格不符
  $ reconcile query result.json --type all

\x1b[32m查询参数说明：\x1b[0m
  --patient <patientId>  按患者ID精确查询（区分大小写）
  --cluster <clusterType> 按语义聚类类别模糊查询
  --type <differenceType> 按差异类型查询，可用值：
    all              - 所有差异记录（排除完全匹配）
    his_overcharge   - HIS高套（HIS金额 > 医保金额）
    insurance_underpay - 医保低付（医保克扣/拒付）
    quantity_diff    - 数量差异（计费数量不一致）
    system口径差     - 系统口径差（编码映射导致）
    manual_reverse   - 手工冲销（冲正记录）

\x1b[32m输出说明：\x1b[0m
  查询结果默认显示前20条，按差异金额降序排列
  患者ID已脱敏处理，仅显示后4位`)
    .action(async (resultFile: string, options: any) => {
      try {
        // 检查文件是否存在
        if (!fs.existsSync(resultFile)) {
          console.error(chalk.red(`❌ 错误: 结果文件不存在: ${resultFile}`));
          process.exit(1);
        }

        // 读取结果文件
        const fileContent = fs.readFileSync(resultFile, 'utf-8');
        let result: ReconciliationResult;

        try {
          result = JSON.parse(fileContent);
        } catch (parseError) {
          console.error(chalk.red(`❌ 错误: 结果文件格式无效，无法解析为 JSON`));
          process.exit(1);
        }

        // 验证结果文件格式
        if (!result.alignedRecords || result.totalHisRecords === undefined) {
          console.error(chalk.red(`❌ 错误: 结果文件格式不正确，缺少必要字段`));
          process.exit(1);
        }

        // 检查查询参数
        const hasPatientQuery = options.patient;
        const hasClusterQuery = options.cluster;
        const hasTypeQuery = options.type;

        // 如果没有任何查询参数，显示帮助信息
        if (!hasPatientQuery && !hasClusterQuery && !hasTypeQuery) {
          console.log(chalk.yellow('\n⚠️ 请指定查询条件:'));
          console.log(chalk.cyan('   --patient <patientId>  按患者ID查询'));
          console.log(chalk.cyan('   --cluster <clusterType> 按语义聚类类别查询'));
          console.log(chalk.cyan('   --type <differenceType> 按差异类型查询\n'));
          console.log(chalk.dim('   示例:'));
          console.log(chalk.dim('     reconcile query result.json --patient P001'));
          console.log(chalk.dim('     reconcile query result.json --type his_overcharge'));
          console.log(chalk.dim('     reconcile query result.json --cluster 药品规格不符\n'));
          process.exit(1);
        }

        // 显示查询信息
        console.log(chalk.cyan('='.repeat(60)));
        console.log(chalk.bold('医保对账结果查询'));
        console.log(chalk.cyan('='.repeat(60)));
        console.log(chalk.dim(`结果文件: ${resultFile}`));
        console.log(chalk.dim(`查询时间: ${new Date().toLocaleString('zh-CN')}`));
        console.log(chalk.cyan('='.repeat(60)));

        let queryResults: AlignedRecord[] = [];
        let resultType = '';

        // 执行查询
        if (hasPatientQuery) {
          console.log(chalk.yellow(`\n📋 按患者ID查询: ${options.patient}`));
          queryResults = queryByPatientId(result, options.patient);
          resultType = `患者 ${options.patient} 的差异记录`;
        } else if (hasTypeQuery) {
          console.log(chalk.yellow(`\n📋 按差异类型查询: ${options.type}`));
          queryResults = queryByDifferenceType(result, options.type);
          resultType = `类型 ${options.type} 的差异记录`;
        } else if (hasClusterQuery) {
          console.log(chalk.yellow(`\n📋 按语义聚类查询: ${options.cluster}`));
          const clusterResults = queryByClusterType(result, options.cluster);

          if (clusterResults.length > 0) {
            queryResults = clusterResults;
            resultType = `聚类 ${options.cluster} 的差异记录`;
          } else {
            // 显示聚类列表
            if (result.semanticClusters && result.semanticClusters.length > 0) {
              console.log(chalk.cyan('\n可用语义聚类类别:'));
              for (const cluster of result.semanticClusters) {
                console.log(chalk.cyan(`   - ${cluster.categoryName} (${cluster.recordCount}条)`));
              }
            } else {
              console.log(chalk.yellow('\n⚠️ 未找到匹配的语义聚类类别'));
            }
            console.log('');
            process.exit(0);
          }
        }

        // 输出查询结果
        console.log(chalk.cyan(`\n共找到 ${queryResults.length} 条${resultType}\n`));

        if (queryResults.length === 0) {
          console.log(chalk.green('✅ 未发现匹配的差异记录'));
          console.log('');
          process.exit(0);
        }

        // 按差异金额排序
        const sortedResults = [...queryResults].sort((a, b) =>
          Math.abs(b.differenceAmount) - Math.abs(a.differenceAmount)
        );

        // 显示前20条结果
        const displayResults = sortedResults.slice(0, 20);

        console.log(chalk.cyan('─'.repeat(60)));
        displayResults.forEach((record, idx) => {
          if (record) {
            printAlignedRecordDetail(record, idx);
          }
        });

        if (sortedResults.length > 20) {
          console.log(chalk.yellow(`\n... 还有 ${sortedResults.length - 20} 条记录未显示`));
          console.log(chalk.dim(`   使用 --output 选项导出完整结果\n`));
        }

        // 显示语义聚类详情（如果查询了聚类）
        if (hasClusterQuery && result.semanticClusters) {
          const matchedCluster = result.semanticClusters.find(
            c => c.categoryName.toLowerCase().includes(hasClusterQuery.toLowerCase()) ||
                 c.clusterId.toLowerCase().includes(hasClusterQuery.toLowerCase())
          );
          if (matchedCluster) {
            console.log(chalk.cyan('\n' + '='.repeat(60)));
            console.log(chalk.bold('语义聚类详情:'));
            printClusterDetail(matchedCluster, 0);
          }
        }

        console.log(chalk.cyan('='.repeat(60)));
        console.log('');
        process.exit(0);
      } catch (error: any) {
        console.error(chalk.red('\n❌ 查询失败:'), error.message || error);
        if (error.stack) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });

  return command;
}

export default createQueryCommand;