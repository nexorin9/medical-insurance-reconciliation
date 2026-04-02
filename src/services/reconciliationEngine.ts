/**
 * 主 ETL 协调流程
 * 整合 importer→mapper→aligner→classifier→clusterer 全流程
 *
 * 功能说明：
 * - 输入：HIS 文件和医保回传文件（CSV 或 Excel）
 * - 过程：数据导入 → 字段映射 → 记录对齐 → 差异分类 → 语义聚类
 * - 输出：完整的对账分析结果
 */

import * as path from 'path';
import {
  HisRecord,
  InsuranceRecord,
  AlignedRecord,
  ReconciliationResult,
  ReconciliationOptions,
  ReconciliationMode,
  ProgressInfo,
  DifferenceType,
  SemanticCluster,
  TypicalCase,
} from '../types';
import { CsvImporter } from './csvImporter';
import { ExcelImporter } from './excelImporter';
import { FieldMapper } from './fieldMapper';
import { Aligner, AlignmentStats } from './aligner';
import { DifferenceClassifier, ClassificationDetail } from './differenceClassifier';
import { SemanticClusterer, SemanticAttributionResult, SemanticAttributionRequest } from './semanticCluster';
import { OpenAILLMClient, MockLLMClient } from './llmClient';

/**
 * 对账引擎选项
 */
export interface ReconciliationEngineOptions {
  /** 字段映射配置文件路径 */
  mappingConfigPath?: string;
  /** 是否使用 Mock LLM */
  mockLLM?: boolean;
  /** 最大并发数（LLM 调用） */
  maxConcurrent?: number;
  /** 编码映射表 */
  codeMapping?: Record<string, string>;
  /** 进度回调 */
  onProgress?: (progress: ProgressInfo) => void;
}

/**
 * 对账引擎类
 * 协调整个对账分析流程
 */
export class ReconciliationEngine {
  private csvImporter: CsvImporter;
  private excelImporter: ExcelImporter;
  private fieldMapper: FieldMapper;
  private aligner: Aligner;
  private differenceClassifier: DifferenceClassifier;
  private semanticClusterer: SemanticClusterer;
  private options: Required<ReconciliationEngineOptions>;
  private isMockMode: boolean;

  constructor(options?: ReconciliationEngineOptions) {
    // 初始化字段映射器
    this.fieldMapper = new FieldMapper();
    if (options?.mappingConfigPath) {
      this.fieldMapper.loadFromFile(options.mappingConfigPath);
    }

    // 初始化 CSV 导入器
    this.csvImporter = new CsvImporter(this.fieldMapper.getFieldMapping());

    // 初始化 Excel 导入器
    this.excelImporter = new ExcelImporter(this.fieldMapper.getFieldMapping());

    // 初始化对齐引擎
    this.aligner = new Aligner({
      enableCodeMapping: true,
      amountTolerance: 0.01,
      quantityTolerance: 0,
    });

    // 初始化差异分类器
    this.differenceClassifier = new DifferenceClassifier({
      amountTolerance: 0.01,
      quantityTolerance: 0,
      codeMapping: options?.codeMapping ?? {},
      enableRejectReasonAnalysis: true,
    });

    // 初始化语义聚类器
    this.semanticClusterer = new SemanticClusterer({
      maxConcurrent: options?.maxConcurrent ?? 5,
      mockMode: options?.mockLLM ?? false,
      cacheEnabled: true,
    });

    // 设置选项
    this.options = {
      mappingConfigPath: options?.mappingConfigPath ?? '',
      mockLLM: options?.mockLLM ?? false,
      maxConcurrent: options?.maxConcurrent ?? 5,
      codeMapping: options?.codeMapping ?? {},
      onProgress: options?.onProgress ?? ((_) => {}),
    };

    // 初始化 LLM 客户端
    this.initializeLLMClient();

    // 判断是否为 Mock 模式
    this.isMockMode = this.options.mockLLM || !process.env.OPENAI_API_KEY;
  }

  /**
   * 初始化 LLM 客户端
   */
  private initializeLLMClient(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL;

    let llmClient;
    if (this.options.mockLLM || !apiKey) {
      llmClient = new MockLLMClient();
      console.log('使用 Mock LLM 客户端（无 API Key 或强制 Mock 模式）');
    } else {
      llmClient = new OpenAILLMClient({ apiKey, baseUrl: baseUrl || '' });
      console.log('使用真实 OpenAI LLM 客户端');
    }

    this.semanticClusterer.setLLMClient(llmClient);
    this.semanticClusterer.setMockMode(this.isMockMode);
  }

  /**
   * 报告进度
   */
  private reportProgress(stage: string, percent: number, current: number, total: number, message?: string): void {
    const progress: ProgressInfo = { stage, percent, current, total, message: message || '' };
    this.options.onProgress(progress);
  }

  /**
   * 检测文件类型
   */
  private detectFileType(filePath: string): 'csv' | 'excel' {
    const ext = path.extname(filePath).toLowerCase();
    if (['.csv'].includes(ext)) {
      return 'csv';
    } else if (['.xlsx', '.xls'].includes(ext)) {
      return 'excel';
    }
    // 默认根据内容检测
    return 'csv';
  }

  /**
   * 导入 HIS 数据
   */
  private async importHisData(filePath: string): Promise<HisRecord[]> {
    this.reportProgress('导入HIS数据', 10, 0, 100, `正在导入 HIS 数据: ${filePath}`);

    const fileType = this.detectFileType(filePath);
    let records: HisRecord[];

    if (fileType === 'csv') {
      records = await this.csvImporter.importHisCsv(filePath);
    } else {
      records = await this.excelImporter.importHisExcel(filePath);
    }

    this.reportProgress('导入HIS数据', 20, records.length, records.length, `HIS 数据导入完成: ${records.length} 条记录`);
    return records;
  }

  /**
   * 导入医保数据
   */
  private async importInsuranceData(filePath: string): Promise<InsuranceRecord[]> {
    this.reportProgress('导入医保数据', 30, 0, 100, `正在导入医保数据: ${filePath}`);

    const fileType = this.detectFileType(filePath);
    let records: InsuranceRecord[];

    if (fileType === 'csv') {
      records = await this.csvImporter.importInsuranceCsv(filePath);
    } else {
      records = await this.excelImporter.importInsuranceExcel(filePath);
    }

    this.reportProgress('导入医保数据', 40, records.length, records.length, `医保数据导入完成: ${records.length} 条记录`);
    return records;
  }

  /**
   * 执行记录对齐
   */
  private alignRecords(hisRecords: HisRecord[], insuranceRecords: InsuranceRecord[]): AlignedRecord[] {
    this.reportProgress('记录对齐', 50, 0, 100, '正在进行记录对齐...');

    const alignedRecords = this.aligner.align(hisRecords, insuranceRecords);

    this.reportProgress('记录对齐', 60, alignedRecords.length, alignedRecords.length, `对齐完成: ${alignedRecords.length} 条记录`);
    return alignedRecords;
  }

  /**
   * 执行差异分类
   */
  private classifyDifferences(alignedRecords: AlignedRecord[]): Map<string, ClassificationDetail> {
    this.reportProgress('差异分类', 65, 0, 100, '正在进行差异分类...');

    const classifications = this.differenceClassifier.classify(alignedRecords);

    this.reportProgress('差异分类', 70, classifications.size, classifications.size, `分类完成: ${classifications.size} 条记录`);
    return classifications;
  }

  /**
   * 执行语义聚类
   */
  private async performSemanticClustering(
    alignedRecords: AlignedRecord[],
    classifications: Map<string, ClassificationDetail>,
    mode: ReconciliationMode
  ): Promise<SemanticCluster[] | undefined> {
    if (mode === ReconciliationMode.FAST) {
      return undefined;
    }

    this.reportProgress('语义聚类', 75, 0, 100, '正在进行语义聚类...');

    // 只对有差异的记录进行语义聚类
    const diffRecords = alignedRecords.filter(
      (r) => r.alignStatus !== 'matched'
    );

    if (diffRecords.length === 0) {
      console.log('没有需要聚类的差异记录');
      return [];
    }

    // 构建语义归因请求
    const requests: SemanticAttributionRequest[] = diffRecords.map((record) => ({
      alignedRecord: record,
      classificationDetail: classifications.get(record.alignKey) || {
        type: DifferenceType.UNKNOWN,
        amount: record.differenceAmount,
        quantityDiff: record.differenceQuantity,
        reason: '无法归类的差异类型',
      },
    }));

    // 执行批量语义归因
    const results = await this.semanticClusterer.attributeBatch(requests, (current, total) => {
      const percent = 75 + Math.floor((current / total) * 20);
      this.reportProgress('语义聚类', percent, current, total, `语义聚类进度: ${current}/${total}`);
    });

    // 聚类结果
    const clusters = this.clusterizeResults(results, alignedRecords);

    this.reportProgress('语义聚类', 95, results.length, results.length, `语义聚类完成: ${results.length} 条记录归入 ${clusters.length} 个类别`);
    return clusters;
  }

  /**
   * 将语义归因结果聚类
   */
  private clusterizeResults(
    results: SemanticAttributionResult[],
    alignedRecords: AlignedRecord[]
  ): SemanticCluster[] {
    const clusterMap = new Map<string, SemanticCluster>();
    const recordMap = new Map(alignedRecords.map((r) => [r.alignKey, r]));

    for (const result of results) {
      const categoryName = result.category;

      if (!clusterMap.has(categoryName)) {
        clusterMap.set(categoryName, {
          clusterId: `cluster_${categoryName}`,
          categoryName,
          recordCount: 0,
          totalAmount: 0,
          typicalCases: [],
          attribution: result.attribution,
          suggestedAction: result.suggestedAction || '',
        });
      }

      const cluster = clusterMap.get(categoryName)!;
      cluster.recordCount++;

      // 计算涉及金额
      const alignedRecord = recordMap.get(result.alignKey);
      if (alignedRecord) {
        cluster.totalAmount += Math.abs(alignedRecord.differenceAmount);
      }

      // 添加典型案例（最多 3 个）
      if (cluster.typicalCases.length < 3 && alignedRecord) {
        const his = alignedRecord.hisRecord;
        const ins = alignedRecord.insuranceRecord;

        cluster.typicalCases.push({
          index: cluster.typicalCases.length + 1,
          patientIdMasked: this.maskPatientId(his?.patientId ?? ins?.patientId ?? ''),
          visitDate: his?.visitDate ?? ins?.visitDate ?? '',
          itemName: his?.itemName ?? '未知项目',
          differenceAmount: alignedRecord.differenceAmount,
          briefDescription: result.attribution.slice(0, 50),
        });
      }

      // 更新归因说明（如果有更好的说明）
      if (result.attribution.length > cluster.attribution.length) {
        cluster.attribution = result.attribution;
        if (result.suggestedAction) {
          cluster.suggestedAction = result.suggestedAction;
        }
      }
    }

    return Array.from(clusterMap.values());
  }

  /**
   * 脱敏患者 ID
   */
  private maskPatientId(patientId: string): string {
    if (patientId.length <= 4) {
      return '****';
    }
    return '****' + patientId.slice(-4);
  }

  /**
   * 统计对齐结果
   */
  private getAlignmentStats(alignedRecords: AlignedRecord[]): AlignmentStats {
    return this.aligner.getStats(alignedRecords);
  }

  /**
   * 统计差异类型
   */
  private getDifferenceTypeStats(
    alignedRecords: AlignedRecord[],
    classifications: Map<string, ClassificationDetail>
  ): Record<DifferenceType, number> {
    const stats: Record<DifferenceType, number> = {
      [DifferenceType.HIS_OVERCHARGE]: 0,
      [DifferenceType.INSURANCE_UNDERPAY]: 0,
      [DifferenceType.QUANTITY_DIFF]: 0,
      [DifferenceType.SYSTEM口径差]: 0,
      [DifferenceType.MANUAL_REVERSE]: 0,
      [DifferenceType.MATCHED]: 0,
      [DifferenceType.UNKNOWN]: 0,
    };

    for (const record of alignedRecords) {
      const detail = classifications.get(record.alignKey);
      if (detail) {
        stats[detail.type]++;
      }
    }

    return stats;
  }

  /**
   * 执行完整对账流程
   */
  async run(
    hisFile: string,
    insuranceFile: string,
    options?: ReconciliationOptions
  ): Promise<ReconciliationResult> {
    const startTime = Date.now();
    const mode = options?.mode ?? ReconciliationMode.FULL;

    console.log('='.repeat(60));
    console.log('医保对账差异语义聚类分析器');
    console.log('='.repeat(60));
    console.log(`HIS 文件: ${hisFile}`);
    console.log(`医保文件: ${insuranceFile}`);
    console.log(`对账模式: ${mode}`);
    console.log(`Mock 模式: ${this.isMockMode}`);
    console.log('='.repeat(60));

    try {
      // 1. 导入 HIS 数据
      const hisRecords = await this.importHisData(hisFile);

      // 2. 导入医保数据
      const insuranceRecords = await this.importInsuranceData(insuranceFile);

      // 3. 执行记录对齐
      const alignedRecords = this.alignRecords(hisRecords, insuranceRecords);

      // 4. 执行差异分类
      const classifications = this.classifyDifferences(alignedRecords);

      // 5. 执行语义聚类（如果模式不是 FAST）
      let semanticClusters: SemanticCluster[] | undefined;
      if (mode !== ReconciliationMode.FAST) {
        semanticClusters = await this.performSemanticClustering(alignedRecords, classifications, mode);
      }

      // 6. 统计结果
      const alignmentStats = this.getAlignmentStats(alignedRecords);
      const differenceTypeStats = this.getDifferenceTypeStats(alignedRecords, classifications);

      // 7. 构建最终结果
      const result: ReconciliationResult = {
        executedAt: new Date().toISOString(),
        hisFilePath: hisFile,
        insuranceFilePath: insuranceFile,
        mode,
        totalHisRecords: hisRecords.length,
        totalInsuranceRecords: insuranceRecords.length,
        matchedCount: alignmentStats.matchedCount,
        amountDiffCount: alignmentStats.amountDiffCount,
        hisOnlyCount: alignmentStats.hisOnlyCount,
        insuranceOnlyCount: alignmentStats.insuranceOnlyCount,
        totalDifferenceAmount: alignmentStats.totalDifferenceAmount,
        alignedRecords,
        semanticClusters: semanticClusters || [],
        differenceTypeStats,
        executionTimeMs: Date.now() - startTime,
        isMockMode: this.isMockMode,
      };

      // 8. 报告完成
      this.reportProgress('完成', 100, result.totalHisRecords, result.totalHisRecords, '对账分析完成');

      console.log('='.repeat(60));
      console.log('对账分析完成!');
      console.log(`总 HIS 记录数: ${result.totalHisRecords}`);
      console.log(`总医保记录数: ${result.totalInsuranceRecords}`);
      console.log(`完全匹配数: ${result.matchedCount}`);
      console.log(`金额差异数: ${result.amountDiffCount}`);
      console.log(`HIS 独有记录: ${result.hisOnlyCount}`);
      console.log(`医保独有记录: ${result.insuranceOnlyCount}`);
      console.log(`总差异金额: ${result.totalDifferenceAmount.toFixed(2)} 元`);
      console.log(`执行耗时: ${result.executionTimeMs} ms`);
      console.log(`Mock 模式: ${result.isMockMode}`);
      console.log('='.repeat(60));

      return result;
    } catch (error) {
      console.error('对账分析失败:', error);
      throw error;
    }
  }

  /**
   * 获取语义聚类器实例（用于外部访问）
   */
  getSemanticClusterer(): SemanticClusterer {
    return this.semanticClusterer;
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback: (progress: ProgressInfo) => void): void {
    this.options.onProgress = callback;
  }

  /**
   * 检查是否为 Mock 模式
   */
  getIsMockMode(): boolean {
    return this.isMockMode;
  }
}

export default ReconciliationEngine;