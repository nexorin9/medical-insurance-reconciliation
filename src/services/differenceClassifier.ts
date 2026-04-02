/**
 * 差异分类器
 * 基于规则的差异分类引擎，不依赖 LLM
 * 作为语义聚类的预分类层
 */

import {
  HisRecord,
  InsuranceRecord,
  AlignedRecord,
  DifferenceType,
  AlignStatus,
} from '../types';

/**
 * 差异分类选项
 */
export interface DifferenceClassifierOptions {
  /** 金额误差容忍度（用于处理浮点数精度问题） */
  amountTolerance?: number;
  /** 数量误差容忍度 */
  quantityTolerance?: number;
  /** 编码映射表（用于判断是否是系统口径差） */
  codeMapping?: Record<string, string>;
  /** 冲正记录标志字段列表 */
  reverseFlags?: string[];
  /** 是否启用语义预分类（基于rejectReason关键词） */
  enableRejectReasonAnalysis?: boolean;
}

/**
 * 分类结果统计
 */
export interface ClassificationStats {
  /** 各差异类型数量 */
  typeCounts: Record<DifferenceType, number>;
  /** 各差异类型涉及金额 */
  typeAmounts: Record<DifferenceType, number>;
  /** 总差异金额 */
  totalDifferenceAmount: number;
  /** 差异记录总数 */
  totalDiffRecords: number;
}

/**
 * 差异分类详情
 */
export interface ClassificationDetail {
  /** 差异类型 */
  type: DifferenceType;
  /** 差异金额 */
  amount: number;
  /** 数量差异 */
  quantityDiff: number;
  /** 分类原因 */
  reason: string;
  /** 是否为系统口径差 */
  isSystemCaliber?: boolean;
  /** 是否为手工冲销 */
  isManualReverse?: boolean;
}

/**
 * 基于规则的差异分类器
 *
 * 差异类型说明：
 * - HIS高套：HIS金额 > 医保金额且非系统误差、非手工冲销
 * - 医保低付：医保克扣/拒付（金额差异为负或有拒付原因）
 * - 数量差异：计费数量不一致
 * - 系统口径差：编码映射导致的金额差异
 * - 手工冲销：冲正记录
 * - 完全匹配：无差异
 * - 未知类型：无法归类
 */
export class DifferenceClassifier {
  private options: Required<DifferenceClassifierOptions>;

  // 医保拒付原因关键词（用于识别医保低付）
  private static readonly REJECT_REASON_KEYWORDS = [
    '拒付', '扣款', '不予支付', '违规', '超限',
    '分解收费', '重复收费', '套项目收费', '过度检查',
    '不合理用药', '不符合适应症', '指征不符', '未按规程',
  ];

  // 冲正标志关键词
  private static readonly REVERSE_FLAG_KEYWORDS = [
    '冲', '正', '退', '取消', '作废', '撤销',
    '冲销', '冲正', '红冲', '反冲', '回退',
  ];

  constructor(options?: DifferenceClassifierOptions) {
    this.options = {
      amountTolerance: options?.amountTolerance ?? 0.01,
      quantityTolerance: options?.quantityTolerance ?? 0,
      codeMapping: options?.codeMapping ?? {},
      reverseFlags: options?.reverseFlags ?? DifferenceClassifier.REVERSE_FLAG_KEYWORDS,
      enableRejectReasonAnalysis: options?.enableRejectReasonAnalysis ?? true,
    };
  }

  /**
   * 检查记录是否为手工冲销/冲正
   */
  private isManualReverse(record: AlignedRecord): boolean {
    const hisRecord = record.hisRecord;
    const insuranceRecord = record.insuranceRecord;

    if (!hisRecord && !insuranceRecord) {
      return false;
    }

    // 检查 HIS 记录
    if (hisRecord) {
      // 检查项目名称是否包含冲正关键词
      if (this.containsReverseFlag(hisRecord.itemName)) {
        return true;
      }
      // 检查结算流水号是否包含冲正标识
      if (this.containsReverseFlag(hisRecord.settlementNo)) {
        return true;
      }
      // 检查科室名称
      if (hisRecord.departmentName && this.containsReverseFlag(hisRecord.departmentName)) {
        return true;
      }
    }

    // 检查医保记录
    if (insuranceRecord) {
      if (insuranceRecord.rejectReason && this.containsReverseFlag(insuranceRecord.rejectReason)) {
        return true;
      }
      if (insuranceRecord.rejectType && this.containsReverseFlag(insuranceRecord.rejectType)) {
        return true;
      }
      if (this.containsReverseFlag(insuranceRecord.settlementNo)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查文本是否包含冲正标志
   */
  private containsReverseFlag(text: string): boolean {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return this.options.reverseFlags.some(flag =>
      lowerText.includes(flag.toLowerCase())
    );
  }

  /**
   * 检查是否为医保低付（基于拒付原因分析）
   */
  private isInsuranceUnderpay(record: AlignedRecord): boolean {
    if (!record.insuranceRecord) return false;

    const rejectReason = record.insuranceRecord.rejectReason;
    if (!rejectReason) return false;

    const lowerReason = rejectReason.toLowerCase();
    return DifferenceClassifier.REJECT_REASON_KEYWORDS.some(keyword =>
      lowerReason.includes(keyword)
    );
  }

  /**
   * 检查金额差异是否在容忍度范围内
   */
  private isAmountSignificant(diffAmount: number): boolean {
    return Math.abs(diffAmount) > this.options.amountTolerance;
  }

  /**
   * 检查数量差异是否在容忍度范围内
   */
  private isQuantitySignificant(diffQuantity: number): boolean {
    return Math.abs(diffQuantity) > this.options.quantityTolerance;
  }

  /**
   * 检查是否为系统口径差（编码映射导致的差异）
   */
  private isSystemCaliberDiff(record: AlignedRecord): boolean {
    if (!record.hisRecord || !record.insuranceRecord) return false;

    const hisCode = record.hisRecord.itemCode.toLowerCase().trim();
    const insuranceCode = record.insuranceRecord.itemCode.toLowerCase().trim();

    // 检查是否在编码映射表中
    const mappedHisCode = this.options.codeMapping[hisCode];
    if (mappedHisCode && mappedHisCode.toLowerCase() === insuranceCode) {
      return true;
    }

    // 检查是否互为映射
    const mappedInsuranceCode = this.options.codeMapping[insuranceCode];
    if (mappedInsuranceCode && mappedInsuranceCode.toLowerCase() === hisCode) {
      return true;
    }

    // 如果编码完全相同但金额有差异，可能是其他系统口径问题
    if (hisCode === insuranceCode && record.alignStatus === AlignStatus.AMOUNT_DIFF) {
      return true;
    }

    return false;
  }

  /**
   * 对单条记录进行差异分类
   */
  classifyRecord(record: AlignedRecord): ClassificationDetail {
    // 1. 如果是完全匹配，直接返回
    if (record.alignStatus === AlignStatus.MATCHED) {
      return {
        type: DifferenceType.MATCHED,
        amount: 0,
        quantityDiff: 0,
        reason: '金额完全匹配，无差异',
      };
    }

    // 2. 如果是 HIS 有但医保无，或医保有但 HIS 无
    if (record.alignStatus === AlignStatus.HIS_ONLY || record.alignStatus === AlignStatus.INSURANCE_ONLY) {
      // 先检查是否为手工冲销
      if (this.isManualReverse(record)) {
        return {
          type: DifferenceType.MANUAL_REVERSE,
          amount: record.differenceAmount,
          quantityDiff: record.differenceQuantity,
          reason: this.getManualReverseReason(record),
          isManualReverse: true,
        };
      }
      // 否则标记为未知类型
      return {
        type: DifferenceType.UNKNOWN,
        amount: record.differenceAmount,
        quantityDiff: record.differenceQuantity,
        reason: record.alignStatus === AlignStatus.HIS_ONLY
          ? 'HIS有记录但医保无对应记录'
          : '医保有记录但HIS无对应记录',
      };
    }

    // 3. 金额差异记录
    if (record.alignStatus === AlignStatus.AMOUNT_DIFF) {
      const diffAmount = record.differenceAmount;
      const diffQuantity = record.differenceQuantity;

      // 3.1 先检查是否为手工冲销
      if (this.isManualReverse(record)) {
        return {
          type: DifferenceType.MANUAL_REVERSE,
          amount: diffAmount,
          quantityDiff: diffQuantity,
          reason: this.getManualReverseReason(record),
          isManualReverse: true,
        };
      }

      // 3.2 检查是否有数量差异
      if (this.isQuantitySignificant(diffQuantity)) {
        return {
          type: DifferenceType.QUANTITY_DIFF,
          amount: diffAmount,
          quantityDiff: diffQuantity,
          reason: `计费数量不一致：HIS计费${record.hisRecord?.quantity}，医保认定${record.insuranceRecord?.payAmount}`,
        };
      }

      // 3.3 检查是否为医保低付（基于拒付原因）
      if (this.isInsuranceUnderpay(record)) {
        return {
          type: DifferenceType.INSURANCE_UNDERPAY,
          amount: diffAmount,
          quantityDiff: diffQuantity,
          reason: `医保低付/拒付：${record.insuranceRecord?.rejectReason || '有拒付记录'}`,
        };
      }

      // 3.4 检查是否为系统口径差
      if (this.isSystemCaliberDiff(record)) {
        return {
          type: DifferenceType.SYSTEM口径差,
          amount: diffAmount,
          quantityDiff: diffQuantity,
          reason: '系统编码映射导致的金额差异',
          isSystemCaliber: true,
        };
      }

      // 3.5 判断是 HIS 高套还是医保低付
      if (diffAmount > 0) {
        // HIS 金额 > 医保金额
        // 需要排除系统口径差的情况（已在上面处理）
        return {
          type: DifferenceType.HIS_OVERCHARGE,
          amount: diffAmount,
          quantityDiff: diffQuantity,
          reason: 'HIS金额高于医保认定金额，可能存在高套风险',
        };
      } else if (diffAmount < 0) {
        // HIS 金额 < 医保金额
        return {
          type: DifferenceType.INSURANCE_UNDERPAY,
          amount: diffAmount,
          quantityDiff: diffQuantity,
          reason: '医保支付金额低于HIS计费，需关注医保扣款情况',
        };
      }
    }

    // 4. 默认返回未知
    return {
      type: DifferenceType.UNKNOWN,
      amount: record.differenceAmount,
      quantityDiff: record.differenceQuantity,
      reason: '无法归类的差异类型，需人工核查',
    };
  }

  /**
   * 获取手工冲销的详细原因
   */
  private getManualReverseReason(record: AlignedRecord): string {
    const reasons: string[] = [];

    if (record.hisRecord) {
      const his = record.hisRecord;
      if (this.containsReverseFlag(his.itemName)) {
        reasons.push(`项目名称含冲正标识：${his.itemName}`);
      }
      if (this.containsReverseFlag(his.settlementNo)) {
        reasons.push(`HIS结算号含冲正标识：${his.settlementNo}`);
      }
    }

    if (record.insuranceRecord) {
      const ins = record.insuranceRecord;
      if (ins.rejectReason && this.containsReverseFlag(ins.rejectReason)) {
        reasons.push(`医保拒付原因含冲正标识：${ins.rejectReason}`);
      }
      if (ins.rejectType && this.containsReverseFlag(ins.rejectType)) {
        reasons.push(`医保拒付类型含冲正标识：${ins.rejectType}`);
      }
    }

    return reasons.length > 0 ? reasons.join('；') : '被识别为手工冲销/冲正记录';
  }

  /**
   * 批量分类对齐记录
   */
  classify(alignedRecords: AlignedRecord[]): Map<string, ClassificationDetail> {
    const results = new Map<string, ClassificationDetail>();

    for (const record of alignedRecords) {
      const detail = this.classifyRecord(record);
      results.set(record.alignKey, detail);
    }

    return results;
  }

  /**
   * 分类统计
   */
  getStats(
    alignedRecords: AlignedRecord[],
    classifications: Map<string, ClassificationDetail>
  ): ClassificationStats {
    const typeCounts: Record<DifferenceType, number> = {
      [DifferenceType.HIS_OVERCHARGE]: 0,
      [DifferenceType.INSURANCE_UNDERPAY]: 0,
      [DifferenceType.QUANTITY_DIFF]: 0,
      [DifferenceType.SYSTEM口径差]: 0,
      [DifferenceType.MANUAL_REVERSE]: 0,
      [DifferenceType.MATCHED]: 0,
      [DifferenceType.UNKNOWN]: 0,
    };

    const typeAmounts: Record<DifferenceType, number> = {
      [DifferenceType.HIS_OVERCHARGE]: 0,
      [DifferenceType.INSURANCE_UNDERPAY]: 0,
      [DifferenceType.QUANTITY_DIFF]: 0,
      [DifferenceType.SYSTEM口径差]: 0,
      [DifferenceType.MANUAL_REVERSE]: 0,
      [DifferenceType.MATCHED]: 0,
      [DifferenceType.UNKNOWN]: 0,
    };

    let totalDifferenceAmount = 0;
    let totalDiffRecords = 0;

    for (const record of alignedRecords) {
      const detail = classifications.get(record.alignKey);
      if (!detail) continue;

      typeCounts[detail.type]++;
      typeAmounts[detail.type] += Math.abs(detail.amount);

      if (detail.type !== DifferenceType.MATCHED) {
        totalDiffRecords++;
        totalDifferenceAmount += Math.abs(detail.amount);
      }
    }

    return {
      typeCounts,
      typeAmounts,
      totalDifferenceAmount,
      totalDiffRecords,
    };
  }

  /**
   * 按差异类型筛选记录
   */
  filterByType(
    alignedRecords: AlignedRecord[],
    classifications: Map<string, ClassificationDetail>,
    type: DifferenceType
  ): AlignedRecord[] {
    const result: AlignedRecord[] = [];

    for (const record of alignedRecords) {
      const detail = classifications.get(record.alignKey);
      if (detail && detail.type === type) {
        result.push(record);
      }
    }

    return result;
  }

  /**
   * 获取高套风险记录（按金额降序）
   */
  getHighRiskRecords(
    alignedRecords: AlignedRecord[],
    classifications: Map<string, ClassificationDetail>,
    limit?: number
  ): Array<{ record: AlignedRecord; detail: ClassificationDetail }> {
    const results: Array<{ record: AlignedRecord; detail: ClassificationDetail }> = [];

    for (const record of alignedRecords) {
      const detail = classifications.get(record.alignKey);
      if (detail && detail.type === DifferenceType.HIS_OVERCHARGE) {
        results.push({ record, detail });
      }
    }

    // 按金额降序排序
    results.sort((a, b) => b.detail.amount - a.detail.amount);

    return limit ? results.slice(0, limit) : results;
  }

  /**
   * 获取医保扣款记录（按金额降序）
   */
  getUnderpayRecords(
    alignedRecords: AlignedRecord[],
    classifications: Map<string, ClassificationDetail>,
    limit?: number
  ): Array<{ record: AlignedRecord; detail: ClassificationDetail }> {
    const results: Array<{ record: AlignedRecord; detail: ClassificationDetail }> = [];

    for (const record of alignedRecords) {
      const detail = classifications.get(record.alignKey);
      if (detail && detail.type === DifferenceType.INSURANCE_UNDERPAY) {
        results.push({ record, detail });
      }
    }

    // 按金额降序排序
    results.sort((a, b) => Math.abs(b.detail.amount) - Math.abs(a.detail.amount));

    return limit ? results.slice(0, limit) : results;
  }
}

export default DifferenceClassifier;
