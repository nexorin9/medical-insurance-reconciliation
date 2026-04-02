/**
 * 医保对账差异语义聚类分析器 - CLI 入口
 *
 * 命令:
 *   reconcile analyze <hisFile> <insuranceFile> [options]  分析对账差异
 *   reconcile report <resultFile> [options]              生成报告
 *   reconcile query <resultFile> [options]                查询差异记录
 */

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { createAnalyzeCommand } from './commands/analyze';
import { createReportCommand } from './commands/report';
import { createQueryCommand } from './commands/query';

// 加载 .env 配置
dotenv.config();

/**
 * 打印LOGO和欢迎信息
 */
function printBanner(): void {
  console.log('');
  console.log('\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║      医保对账差异语义聚类分析器  v1.0.0                    ║\x1b[0m');
  console.log('\x1b[36m║      Medical Insurance Reconciliation Analyzer             ║\x1b[0m');
  console.log('\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
  console.log('');
}

/**
 * 获取Banner字符串
 */
function getBannerText(): string {
  return `
\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m
\x1b[36m║      医保对账差异语义聚类分析器  v1.0.0                    ║\x1b[0m
\x1b[36m║      Medical Insurance Reconciliation Analyzer             ║\x1b[0m
\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m`;
}

/**
 * 打印错误信息（友好中文提示）
 */
function printError(error: any): void {
  const errorMessage = error?.message || String(error);
  const errorCode = error?.code || '';

  console.error('\n\x1b[31m✖ 操作失败\x1b[0m');

  // 根据错误类型提供友好提示
  if (errorCode === 'ENOENT' || errorMessage.includes('不存在')) {
    console.error('\x1b[33m原因：\x1b[0m 指定的文件路径不存在');
    console.error('\x1b[33m建议：\x1b[0m 请检查文件路径是否正确，或确认文件已被删除');
  } else if (errorMessage.includes('OPENAI_API_KEY') || errorMessage.includes('API')) {
    console.error('\x1b[33m原因：\x1b[0m LLM API 配置异常');
    console.error('\x1b[33m建议：\x1b[0m 请检查 .env 文件中的 OPENAI_API_KEY 配置，或使用 --mock 参数');
  } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
    console.error('\x1b[33m原因：\x1b[0m JSON 格式解析失败');
    console.error('\x1b[33m建议：\x1b[0m 请确认结果文件格式正确，未被手动修改');
  } else if (errorMessage.includes('timeout') || errorMessage.includes('超时')) {
    console.error('\x1b[33m原因：\x1b[0m 网络请求超时');
    console.error('\x1b[33m建议：\x1b[0m 请检查网络连接，或使用 --mock 参数跳过 LLM 调用');
  }

  console.error('\x1b[33m详细信息：\x1b[0m', errorMessage);

  // 仅在开发模式显示堆栈
  if (process.env.DEBUG === 'true' && error?.stack) {
    console.error('\n--- 调试信息 (stack trace) ---');
    console.error(error.stack);
  }
}

/**
 * 创建主程序
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name('reconcile')
    .description(`\n医保对账差异语义聚类分析器 - 输入 HIS 结算 CSV 与医保平台回传 CSV，对差异进行语义聚类归因，生成可视化的差异叙事报告

\x1b[32m使用示例：\x1b[0m
  $ reconcile analyze his.csv insurance.csv --output result.json
  $ reconcile report result.json --type detail --format html
  $ reconcile query result.json --patient P001`)
    .version('1.0.0')
    .addHelpText('before', () => getBannerText())
    .addHelpText('after', `
\x1b[32m获取帮助：\x1b[0m
  reconcile --help                 显示完整帮助信息
  reconcile analyze --help         查看 analyze 子命令帮助
  reconcile report --help         查看 report 子命令帮助
  reconcile query --help          查看 query 子命令帮助

\x1b[32m配置文件：\x1b[0m
  在项目根目录创建 .env 文件配置以下环境变量：
  OPENAI_API_KEY      OpenAI API 密钥（可选，不配置则使用 Mock 模式）
  OPENAI_BASE_URL     API 地址（可选，默认为 OpenAI 官方地址）

\x1b[32m更多信息：\x1b[0m
  详细使用说明请参阅项目 README.md`)
    .showSuggestionAfterError();

  // 注册子命令
  program.addCommand(createAnalyzeCommand());
  program.addCommand(createReportCommand());
  program.addCommand(createQueryCommand());

  return program;
}

/**
 * 全局错误处理：未捕获的异常
 */
process.on('uncaughtException', (error: Error) => {
  console.error('\n\x1b[31m╔════════════════════════════════════════════════════════╗\x1b[0m');
  console.error('\x1b[31m║           💥 发生未预料的错误（程序崩溃）                ║\x1b[0m');
  console.error('\x1b[31m╚════════════════════════════════════════════════════════╝\x1b[0m');
  printError(error);
  console.error('\n\x1b[33m提示：\x1b[0m 如果问题持续存在，请尝试使用 --mock 参数运行');
  console.error('');
  process.exit(1);
});

/**
 * 全局错误处理：未处理的 Promise 拒绝
 */
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('\n\x1b[31m╔════════════════════════════════════════════════════════╗\x1b[0m');
  console.error('\x1b[31m║           ⚠️  异步操作发生错误                           ║\x1b[0m');
  console.error('\x1b[31m╚════════════════════════════════════════════════════════╝\x1b[0m');
  printError(reason);
  console.error('\n\x1b[33m提示：\x1b[0m 异步操作失败，请检查网络连接或 API 配置');
  console.error('');
  process.exit(1);
});

// 创建并执行程序
const program = createProgram();
program.parse(process.argv);
