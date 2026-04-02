/**
 * 记录对齐引擎
 * 按 患者ID + 就诊日期 + 医疗项目编码 三键对齐 HIS 记录和医保记录
 */

import {
  HisRecord,
  InsuranceRecord,
  AlignedRecord,
  AlignStatus,
  DifferenceType,
} from '../types';

/**
 * 对齐选项
 */
export interface AlignerOptions {
  /** 是否启用编码口径差处理 */
  enableCodeMapping?: boolean;
  /** 允许的金额误差范围（用于处理浮点数精度问题） */
  amountTolerance?: number;
  /** 允许的数量误差范围 */
  quantityTolerance?: number;
}

/**
 * 对齐结果统计
 */
export interface AlignmentStats {
  totalHisRecords: number;
  totalInsuranceRecords: number;
  matchedCount: number;
  amountDiffCount: number;
  hisOnlyCount: number;
  insuranceOnlyCount: number;
  totalDifferenceAmount: number;
}

/**
 * 记录对齐引擎类
 * 核心逻辑：按 患者ID + 就诊日期 + 医疗项目编码 三键对齐
 */
export class Aligner {
  private options: Required<AlignerOptions>;

  constructor(options?: AlignerOptions) {
    this.options = {
      enableCodeMapping: options?.enableCodeMapping ?? true,
      amountTolerance: options?.amountTolerance ?? 0.01,
      quantityTolerance: options?.quantityTolerance ?? 0,
    };
  }

  /**
   * 生成对齐键值
   * 键 = 患者ID + 就诊日期 + 项目编码
   */
  private generateAlignKey(patientId: string, visitDate: string, itemCode: string): string {
    return `${patientId}|${visitDate}|${itemCode}`;
  }

  /**
   * 标准化项目编码（处理 HIS 自定义编码 vs 医保国家编码的口径差）
   * 如果启用编码映射，进行标准化处理
   */
  private normalizeItemCode(itemCode: string): string {
    if (!this.options.enableCodeMapping) {
      return itemCode;
    }
    // 标准化处理：转小写、去除空格、去除前导零
    return itemCode.toLowerCase().trim().replace(/^0+/, '') || itemCode;
  }

  /**
   * 检查金额是否相等（考虑误差容忍度）
   */
  private isAmountEqual(hisAmount: number, insuranceAmount: number): boolean {
    return Math.abs(hisAmount - insuranceAmount) <= this.options.amountTolerance;
  }

  /**
   * 检查数量是否相等
   */
  private isQuantityEqual(hisQuantity: number, insuranceQuantity: number): boolean {
    return Math.abs(hisQuantity - insuranceQuantity) <= this.options.quantityTolerance;
  }

  /**
   * 执行记录对齐
   * @param hisRecords HIS结算记录数组
   * @param insuranceRecords 医保回传记录数组
   * @returns 对齐后的记录数组
   */
  align(hisRecords: HisRecord[], insuranceRecords: InsuranceRecord[]): AlignedRecord[] {
    const result: AlignedRecord[] = [];
    const processedInsuranceKeys = new Set<string>();

    // 构建 HIS 记录的映射
    const hisMap = new Map<string, HisRecord[]>();
    for (const his of hisRecords) {
      const normalizedCode = this.normalizeItemCode(his.itemCode);
      const key = this.generateAlignKey(his.patientId, his.visitDate, normalizedCode);
      if (!hisMap.has(key)) {
        hisMap.set(key, []);
      }
      hisMap.get(key)!.push(his);
    }

    // 遍历 HIS 记录进行对齐
    for (const his of hisRecords) {
      const normalizedCode = this.normalizeItemCode(his.itemCode);
      const key = this.generateAlignKey(his.patientId, his.visitDate, normalizedCode);
      processedInsuranceKeys.add(key);

      // 查找对应的医保记录
      const matchingInsurance = insuranceRecords.find((ins) => {
        const insNormalizedCode = this.normalizeItemCode(ins.itemCode);
        const insKey = this.generateAlignKey(ins.patientId, ins.visitDate, insNormalizedCode);
        return key === insKey;
      });

      if (matchingInsurance) {
        // 找到了对应的医保记录
        const diffAmount = his.amount - matchingInsurance.payAmount;
        const diffQuantity = his.quantity - (matchingInsurance as any).quantity || 0;

        // 判断对齐状态
        let alignStatus: AlignStatus;
        let preliminaryType: DifferenceType = DifferenceType.UNKNOWN;

        if (this.isAmountEqual(his.amount, matchingInsurance.payAmount)) {
          alignStatus = AlignStatus.MATCHED;
          preliminaryType = DifferenceType.MATCHED;
        } else {
          alignStatus = AlignStatus.AMOUNT_DIFF;
          // 初步差异分类
          if (diffAmount > 0) {
            preliminaryType = DifferenceType.HIS_OVERCHARGE;
          } else {
            preliminaryType = DifferenceType.INSURANCE_UNDERPAY;
          }
        }

        result.push({
          alignKey: key,
          hisRecord: his,
          insuranceRecord: matchingInsurance,
          alignStatus,
          differenceAmount: diffAmount,
          differenceQuantity: diffQuantity,
          preliminaryType,
        });
      } else {
        // HIS 有但医保无
        result.push({
          alignKey: key,
          hisRecord: his,
          insuranceRecord: null,
          alignStatus: AlignStatus.HIS_ONLY,
          differenceAmount: his.amount,
          differenceQuantity: his.quantity,
          preliminaryType: DifferenceType.UNKNOWN,
        });
      }
    }

    // 查找医保有但 HIS 无的记录
    for (const insurance of insuranceRecords) {
      const normalizedCode = this.normalizeItemCode(insurance.itemCode);
      const key = this.generateAlignKey(insurance.patientId, insurance.visitDate, normalizedCode);

      if (!processedInsuranceKeys.has(key)) {
        // 医保有但 HIS 无
        result.push({
          alignKey: key,
          hisRecord: null,
          insuranceRecord: insurance,
          alignStatus: AlignStatus.INSURANCE_ONLY,
          differenceAmount: -insurance.payAmount,
          differenceQuantity: 0,
          preliminaryType: DifferenceType.UNKNOWN,
        });
        processedInsuranceKeys.add(key);
      }
    }

    return result;
  }

  /**
   * 获取对齐统计信息
   */
  getStats(alignedRecords: AlignedRecord[]): AlignmentStats {
    let matchedCount = 0;
    let amountDiffCount = 0;
    let hisOnlyCount = 0;
    let insuranceOnlyCount = 0;
    let totalDifferenceAmount = 0;

    for (const record of alignedRecords) {
      switch (record.alignStatus) {
        case AlignStatus.MATCHED:
          matchedCount++;
          break;
        case AlignStatus.AMOUNT_DIFF:
          amountDiffCount++;
          totalDifferenceAmount += Math.abs(record.differenceAmount);
          break;
        case AlignStatus.HIS_ONLY:
          hisOnlyCount++;
          totalDifferenceAmount += Math.abs(record.differenceAmount);
          break;
        case AlignStatus.INSURANCE_ONLY:
          insuranceOnlyCount++;
          totalDifferenceAmount += Math.abs(record.differenceAmount);
          break;
      }
    }

    return {
      totalHisRecords: matchedCount + amountDiffCount + hisOnlyCount,
      totalInsuranceRecords: matchedCount + amountDiffCount + insuranceOnlyCount,
      matchedCount,
      amountDiffCount,
      hisOnlyCount,
      insuranceOnlyCount,
      totalDifferenceAmount,
    };
  }

  /**
   * 按对齐状态筛选记录
   */
  filterByStatus(alignedRecords: AlignedRecord[], status: AlignStatus): AlignedRecord[] {
    return alignedRecords.filter((r) => r.alignStatus === status);
  }

  /**
   * 获取所有金额差异记录
   */
  getAmountDiffRecords(alignedRecords: AlignedRecord[]): AlignedRecord[] {
    return alignedRecords.filter(
      (r) => r.alignStatus === AlignStatus.AMOUNT_DIFF || r.alignStatus === AlignStatus.HIS_ONLY
    );
  }

  /**
   * 获取所有缺失记录（HIS有医保无 或 医保有HIS无）
   */
  getMissingRecords(alignedRecords: AlignedRecord[]): AlignedRecord[] {
    return alignedRecords.filter(
      (r) => r.alignStatus === AlignStatus.HIS_ONLY || r.alignStatus === AlignStatus.INSURANCE_ONLY
    );
  }
}

export default Aligner;
