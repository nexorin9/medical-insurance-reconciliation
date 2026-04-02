/**
 * 语义聚类服务
 * 基于 LLM API 的差异语义归因层
 *
 * 功能说明：
 * - 对每条差异记录，结合 HIS 明细和医保扣款原因，让 LLM 输出语义归因
 * - 支持 mock 模式（返回预设分类，不真实调用 API）
 * - 支持结果缓存（同一条记录不重复调用 LLM）
 */

import {
  AlignedRecord,
  DifferenceType,
  SemanticCluster,
  TypicalCase,
  ClusterReason,
} from '../types';
import { ClassificationDetail } from './differenceClassifier';

// 语义类别定义
export const SEMANTIC_CATEGORIES = {
  // 药品规格不符
  DRUG_SPEC_MISMATCH: '药品规格不符',
  // 检查指征不符
  EXAM_INDICATION_MISMATCH: '检查指征不符',
  // 手术操作编码错误
  SURGERY_CODE_ERROR: '手术操作编码错误',
  // 病历记载与计费不符
  RECORD_BILLING_MISMATCH: '病历记载与计费不符',
  // 系统传输丢包
  SYSTEM_TRANSMISSION_LOSS: '系统传输丢包',
  // 医保政策调整
  INSURANCE_POLICY_ADJUSTMENT: '医保政策调整',
  // 编码映射差异
  CODE_MAPPING_DIFF: '编码映射差异',
  // 其他/未知
  OTHER: '其他',
} as const;

export type SemanticCategory = typeof SEMANTIC_CATEGORIES[keyof typeof SEMANTIC_CATEGORIES];

/**
 * 单条记录的语义归因请求
 */
export interface SemanticAttributionRequest {
  /** 对齐记录 */
  alignedRecord: AlignedRecord;
  /** 初步分类详情 */
  classificationDetail: ClassificationDetail;
}

/**
 * 单条记录的语义归因结果
 */
export interface SemanticAttributionResult {
  /** 对齐键 */
  alignKey: string;
  /** 语义类别 */
  category: SemanticCategory;
  /** 归因说明 */
  attribution: string;
  /** 建议处理方式 */
  suggestedAction?: string;
  /** 是否为 Mock 结果 */
  isMock: boolean;
}

/**
 * 批量语义归因选项
 */
export interface SemanticClusterOptions {
  /** 最大并发数 */
  maxConcurrent?: number;
  /** 是否使用 Mock 模式 */
  mockMode?: boolean;
  /** API Key（如果未通过环境变量设置） */
  apiKey?: string;
  /** API Base URL */
  baseUrl?: string;
  /** 结果缓存 */
  cacheEnabled?: boolean;
}

/**
 * Mock 模式的预设归因映射（基于初步分类和关键词）
 */
const MOCK_ATTRIBUTION_MAP: Array<{
  keywords: string[];
  category: SemanticCategory;
  attribution: string;
  suggestedAction: string;
}> = [
  {
    keywords: ['药品', '规格', '剂型', '包装'],
    category: SEMANTIC_CATEGORIES.DRUG_SPEC_MISMATCH,
    attribution: '药品规格、剂型或包装与医保目录要求不符，导致无法按原标准报销',
    suggestedAction: '核查药品规格是否在医保目录范围内，必要时更换规格或重新申报',
  },
  {
    keywords: ['检查', '指征', '适应症', '无明显'],
    category: SEMANTIC_CATEGORIES.EXAM_INDICATION_MISMATCH,
    attribution: '检查项目的临床指征不充分或与医保审核标准不符',
    suggestedAction: '补充检查的临床必要性说明，完善病历记载',
  },
  {
    keywords: ['手术', '操作', '编码', '术式'],
    category: SEMANTIC_CATEGORIES.SURGERY_CODE_ERROR,
    attribution: '手术或操作的医保编码与实际执行不符，可能存在编码套用',
    suggestedAction: '核对手术记录与医保编码，确保编码准确反映实际手术操作',
  },
  {
    keywords: ['病历', '记载', '计费', '不符', '医嘱'],
    category: SEMANTIC_CATEGORIES.RECORD_BILLING_MISMATCH,
    attribution: '病历记载内容与实际计费项目存在不一致',
    suggestedAction: '比对病历与计费明细，修正计费或补充病历说明',
  },
  {
    keywords: ['传输', '丢包', '丢失', '未传', '接口'],
    category: SEMANTIC_CATEGORIES.SYSTEM_TRANSMISSION_LOSS,
    attribution: '结算数据在 HIS 与医保系统间传输时发生丢失或错误',
    suggestedAction: '检查接口日志，确认数据是否成功上传，必要时重新传输',
  },
  {
    keywords: ['政策', '调整', '目录', '变更'],
    category: SEMANTIC_CATEGORIES.INSURANCE_POLICY_ADJUSTMENT,
    attribution: '医保目录或报销政策近期发生调整，导致结算标准变化',
    suggestedAction: '查阅最新医保政策文件，确认结算依据是否过期',
  },
  {
    keywords: ['映射', '对照', '编码转换'],
    category: SEMANTIC_CATEGORIES.CODE_MAPPING_DIFF,
    attribution: 'HIS 编码与医保目录编码的映射对照存在差异',
    suggestedAction: '更新编码映射表，确保 HIS 编码正确对应医保目录',
  },
];

/**
 * 中文提示词模板
 */
const PROMPT_TEMPLATE = `你是一位专业的医保对账审核员，负责对医疗结算差异进行语义归因分析。

## 任务说明
根据以下 HIS 结算记录和医保回传信息，对差异记录进行语义归因，找出差异产生的真实原因。

## 差异记录信息

**HIS 记录：**
- 患者ID：{{patientId}}
- 就诊日期：{{visitDate}}
- 医疗项目编码：{{itemCode}}
- 医疗项目名称：{{itemName}}
- 数量：{{quantity}}
- HIS计费金额：{{hisAmount}}
- 科室：{{departmentName}}
- 结算流水号：{{hisSettlementNo}}
{{#if diagnosisName}}
- 诊断：{{diagnosisName}}
{{/if}}

**医保回传信息：**
- 医保认定金额：{{insuranceAmount}}
- 实付金额：{{payAmount}}
{{#if rejectReason}}
- 拒付/扣款原因：{{rejectReason}}
{{/if}}
- 结算流水号：{{insuranceSettlementNo}}

**差异信息：**
- 差异金额：{{differenceAmount}}元
- 初步分类：{{preliminaryType}}
- 分类说明：{{classificationReason}}

## 归因要求

请从以下语义类别中选择最合适的类别，并对差异原因给出详细说明：

1. **药品规格不符**：药品的剂型、规格或包装与医保目录要求不一致
2. **检查指征不符**：检查项目的临床指征不充分或不符合医保审核标准
3. **手术操作编码错误**：手术或操作的医保编码与实际执行不符（可能存在编码套用）
4. **病历记载与计费不符**：病历记载内容与实际计费项目存在不一致
5. **系统传输丢包**：结算数据在传输过程中发生丢失或错误
6. **医保政策调整**：医保目录或报销政策近期发生调整
7. **编码映射差异**：HIS编码与医保目录编码的映射对照存在差异
8. **其他**：无法归入以上类别的其他原因

## 输出格式

请按以下 JSON 格式输出结果（只输出 JSON，不要有其他内容）：
{
  "category": "选择的类别名称",
  "attribution": "对差异原因的详细说明，50-100字",
  "suggestedAction": "建议的后续处理方式，30-50字"
}

请开始分析并输出 JSON 结果。`;

/**
 * LLM 客户端接口（将在 Task 9 实现）
 */
export interface LLMClient {
  /**
   * 调用 LLM
   * @param prompt 提示词
   * @returns LLM 响应文本
   */
  call(prompt: string): Promise<string>;
}

/**
 * 语义聚类器类
 */
export class SemanticClusterer {
  private options: Required<SemanticClusterOptions>;
  private llmClient: LLMClient | null = null;
  private cache: Map<string, SemanticAttributionResult>;
  private mockMode: boolean;

  constructor(options?: SemanticClusterOptions) {
    this.options = {
      maxConcurrent: options?.maxConcurrent ?? 5,
      mockMode: options?.mockMode ?? false,
      apiKey: options?.apiKey ?? process.env.OPENAI_API_KEY ?? '',
      baseUrl: options?.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      cacheEnabled: options?.cacheEnabled ?? true,
    };
    this.cache = new Map();
    this.mockMode = this.options.mockMode || !this.options.apiKey;
  }

  /**
   * 设置 LLM 客户端
   */
  setLLMClient(client: LLMClient): void {
    this.llmClient = client;
  }

  /**
   * 启用/禁用 Mock 模式
   */
  setMockMode(mockMode: boolean): void {
    this.mockMode = mockMode;
  }

  /**
   * 检查是否为 Mock 模式
   */
  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * 构建提示词
   */
  private buildPrompt(record: AlignedRecord, classification: ClassificationDetail): string {
    const his = record.hisRecord;
    const ins = record.insuranceRecord;

    let prompt = PROMPT_TEMPLATE;

    // 替换 HIS 记录信息
    prompt = prompt.replace('{{patientId}}', his?.patientId ?? ins?.patientId ?? '未知');
    prompt = prompt.replace('{{visitDate}}', his?.visitDate ?? ins?.visitDate ?? '未知');
    prompt = prompt.replace('{{itemCode}}', his?.itemCode ?? ins?.itemCode ?? '未知');
    prompt = prompt.replace('{{itemName}}', his?.itemName ?? '未知');
    prompt = prompt.replace('{{quantity}}', String(his?.quantity ?? '未知'));
    prompt = prompt.replace('{{hisAmount}}', String(his?.amount ?? 0));
    prompt = prompt.replace('{{departmentName}}', his?.departmentName ?? '未知');
    prompt = prompt.replace('{{hisSettlementNo}}', his?.settlementNo ?? '未知');
    prompt = prompt.replace('{{diagnosisName}}', his?.diagnosisName ?? '');

    // 替换医保信息
    prompt = prompt.replace('{{insuranceAmount}}', String(ins?.amount ?? 0));
    prompt = prompt.replace('{{payAmount}}', String(ins?.payAmount ?? 0));
    prompt = prompt.replace('{{rejectReason}}', ins?.rejectReason ?? '无');
    prompt = prompt.replace('{{insuranceSettlementNo}}', ins?.settlementNo ?? '未知');

    // 替换差异信息
    prompt = prompt.replace('{{differenceAmount}}', String(record.differenceAmount));
    prompt = prompt.replace('{{preliminaryType}}', this.translateDifferenceType(record.preliminaryType ?? classification.type));
    prompt = prompt.replace('{{classificationReason}}', classification.reason);

    return prompt;
  }

  /**
   * 翻译差异类型为中文
   */
  private translateDifferenceType(type: DifferenceType): string {
    const typeMap: Record<DifferenceType, string> = {
      [DifferenceType.HIS_OVERCHARGE]: 'HIS高套',
      [DifferenceType.INSURANCE_UNDERPAY]: '医保低付/拒付',
      [DifferenceType.QUANTITY_DIFF]: '数量差异',
      [DifferenceType.SYSTEM口径差]: '系统口径差',
      [DifferenceType.MANUAL_REVERSE]: '手工冲销',
      [DifferenceType.MATCHED]: '完全匹配',
      [DifferenceType.UNKNOWN]: '未知类型',
    };
    return typeMap[type] ?? '未知类型';
  }

  /**
   * Mock 模式归因
   */
  private mockAttribution(record: AlignedRecord, classification: ClassificationDetail): SemanticAttributionResult {
    const his = record.hisRecord;
    const ins = record.insuranceRecord;
    const text = `${his?.itemName ?? ''} ${his?.itemCode ?? ''} ${ins?.rejectReason ?? ''} ${classification.reason}`.toLowerCase();

    // 根据关键词匹配最合适的预设归因
    for (const item of MOCK_ATTRIBUTION_MAP) {
      if (item.keywords.some(keyword => text.includes(keyword))) {
        return {
          alignKey: record.alignKey,
          category: item.category,
          attribution: item.attribution,
          suggestedAction: item.suggestedAction,
          isMock: true,
        };
      }
    }

    // 默认归因为其他
    return {
      alignKey: record.alignKey,
      category: SEMANTIC_CATEGORIES.OTHER,
      attribution: '无法确定具体原因，需人工进一步核查HIS明细与医保扣款依据',
      suggestedAction: '建议调取原始结算凭证和医保审核明细进行人工对账',
      isMock: true,
    };
  }

  /**
   * 调用 LLM 进行语义归因
   */
  private async callLLM(prompt: string): Promise<string> {
    if (!this.llmClient) {
      throw new Error('LLM 客户端未设置，请先调用 setLLMClient()');
    }
    return this.llmClient.call(prompt);
  }

  /**
   * 解析 LLM 返回的 JSON
   */
  private parseLLMResponse(response: string): { category: string; attribution: string; suggestedAction: string } {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        return {
          category: json.category ?? SEMANTIC_CATEGORIES.OTHER,
          attribution: json.attribution ?? 'LLM 未提供归因说明',
          suggestedAction: json.suggestedAction ?? '建议人工核查',
        };
      }
    } catch (e) {
      console.warn('解析 LLM 响应失败:', e);
    }

    // 默认返回
    return {
      category: SEMANTIC_CATEGORIES.OTHER,
      attribution: response.slice(0, 200),
      suggestedAction: '建议人工核查',
    };
  }

  /**
   * 对单条记录进行语义归因
   */
  async attributeSingle(
    record: AlignedRecord,
    classification: ClassificationDetail
  ): Promise<SemanticAttributionResult> {
    // 检查缓存
    const cacheKey = record.alignKey;
    if (this.options.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let result: SemanticAttributionResult;

    if (this.mockMode) {
      result = this.mockAttribution(record, classification);
    } else {
      try {
        const prompt = this.buildPrompt(record, classification);
        const response = await this.callLLM(prompt);
        const parsed = this.parseLLMResponse(response);

        // 验证 category 是否有效
        const categoryValues = Object.values(SEMANTIC_CATEGORIES);
        const category = categoryValues.includes(parsed.category as SemanticCategory)
          ? (parsed.category as SemanticCategory)
          : SEMANTIC_CATEGORIES.OTHER;

        result = {
          alignKey: record.alignKey,
          category,
          attribution: parsed.attribution,
          suggestedAction: parsed.suggestedAction,
          isMock: false,
        };
      } catch (error) {
        console.error(`LLM 调用失败，降级到 Mock 模式:`, error);
        result = this.mockAttribution(record, classification);
      }
    }

    // 写入缓存
    if (this.options.cacheEnabled) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * 批量处理（带并发控制）
   */
  async attributeBatch(
    requests: SemanticAttributionRequest[],
    onProgress?: (current: number, total: number) => void
  ): Promise<SemanticAttributionResult[]> {
    const results: SemanticAttributionResult[] = [];
    const total = requests.length;
    let completed = 0;

    // 分批处理，每批最多 maxConcurrent 个
    for (let i = 0; i < requests.length; i += this.options.maxConcurrent) {
      const batch = requests.slice(i, i + this.options.maxConcurrent);

      const batchPromises = batch.map(async (req) => {
        const result = await this.attributeSingle(req.alignedRecord, req.classificationDetail);
        completed++;
        onProgress?.(completed, total);
        return result;
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 将归因结果聚类
   */
  clusterize(results: SemanticAttributionResult[]): SemanticCluster[] {
    const clusterMap = new Map<SemanticCategory, SemanticCluster>();

    for (const result of results) {
      if (!clusterMap.has(result.category)) {
        clusterMap.set(result.category, {
          clusterId: `cluster_${result.category}`,
          categoryName: result.category,
          recordCount: 0,
          totalAmount: 0,
          typicalCases: [],
          attribution: '',
        });
      }

      const cluster = clusterMap.get(result.category)!;
      cluster.recordCount++;
    }

    // 返回聚类结果数组
    return Array.from(clusterMap.values());
  }
}

export default SemanticClusterer;
