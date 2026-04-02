/**
 * Aligner 单元测试
 * 测试记录对齐引擎的三键对齐算法
 */

import { Aligner } from '../aligner';
import { HisRecord, InsuranceRecord, AlignStatus, DifferenceType } from '../../types';

describe('Aligner', () => {
  let aligner: Aligner;

  beforeEach(() => {
    aligner = new Aligner({
      enableCodeMapping: true,
      amountTolerance: 0.01,
      quantityTolerance: 0,
    });
  });

  // 创建测试用的 HIS 记录
  const createHisRecord = (overrides: Partial<HisRecord> = {}): HisRecord => ({
    patientId: 'P001',
    visitDate: '2024-01-15',
    itemCode: 'ITEM001',
    itemName: '血常规检查',
    quantity: 1,
    amount: 50.0,
    departmentCode: 'D001',
    departmentName: '检验科',
    settlementNo: 'HIS20240115001',
    ...overrides,
  });

  // 创建测试用的医保记录
  const createInsuranceRecord = (overrides: Partial<InsuranceRecord> = {}): InsuranceRecord => ({
    patientId: 'P001',
    visitDate: '2024-01-15',
    itemCode: 'ITEM001',
    amount: 50.0,
    payAmount: 50.0,
    settlementNo: 'INS20240115001',
    ...overrides,
  });

  describe('三键对齐算法', () => {
    it('应该正确匹配完全相同的记录', () => {
      const hisRecords = [
        createHisRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', amount: 50.0 }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', payAmount: 50.0 }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);

      expect(result).toHaveLength(1);
      expect(result[0].alignStatus).toBe(AlignStatus.MATCHED);
      expect(result[0].hisRecord).not.toBeNull();
      expect(result[0].insuranceRecord).not.toBeNull();
    });

    it('应该正确识别金额差异记录', () => {
      const hisRecords = [
        createHisRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', amount: 80.0 }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', payAmount: 50.0 }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);

      expect(result).toHaveLength(1);
      expect(result[0].alignStatus).toBe(AlignStatus.AMOUNT_DIFF);
      expect(result[0].differenceAmount).toBe(30.0); // 80 - 50
    });

    it('应该识别 HIS 有但医保无的记录', () => {
      const hisRecords = [
        createHisRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', amount: 50.0 }),
      ];
      const insuranceRecords: InsuranceRecord[] = [];

      const result = aligner.align(hisRecords, insuranceRecords);

      expect(result).toHaveLength(1);
      expect(result[0].alignStatus).toBe(AlignStatus.HIS_ONLY);
      expect(result[0].hisRecord).not.toBeNull();
      expect(result[0].insuranceRecord).toBeNull();
    });

    it('应该识别医保有但 HIS 无的记录', () => {
      const hisRecords: HisRecord[] = [];
      const insuranceRecords = [
        createInsuranceRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', payAmount: 50.0 }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);

      expect(result).toHaveLength(1);
      expect(result[0].alignStatus).toBe(AlignStatus.INSURANCE_ONLY);
      expect(result[0].hisRecord).toBeNull();
      expect(result[0].insuranceRecord).not.toBeNull();
    });

    it('不同患者ID的记录不应匹配', () => {
      const hisRecords = [
        createHisRecord({
          patientId: 'P001',
          visitDate: '2024-01-15',
          itemCode: 'ITEM001',
          amount: 50.0
        }),
      ];
      // 不同患者ID，不应匹配
      const insuranceRecords = [
        createInsuranceRecord({
          patientId: 'P002', // 不同患者
          visitDate: '2024-01-15',
          itemCode: 'ITEM001',
          payAmount: 50.0
        }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);

      // 不同患者ID会产生HIS_ONLY和INSURANCE_ONLY两条记录
      expect(result).toHaveLength(2);
      expect(result[0].alignStatus).toBe(AlignStatus.HIS_ONLY);
      expect(result[1].alignStatus).toBe(AlignStatus.INSURANCE_ONLY);
    });
  });

  describe('编码口径差处理', () => {
    it('应该处理 HIS 自定义编码与医保国家编码的差异（标准化后匹配）', () => {
      // HIS用大写LOCAL001，医保用小写item001，标准化后都是local001
      const hisRecords = [
        createHisRecord({
          patientId: 'P001',
          visitDate: '2024-01-15',
          itemCode: 'LOCAL001',
          amount: 50.0
        }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({
          patientId: 'P001',
          visitDate: '2024-01-15',
          itemCode: 'local001',
          payAmount: 50.0
        }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);

      expect(result).toHaveLength(1);
      expect(result[0].alignStatus).toBe(AlignStatus.MATCHED);
    });

    it('应该处理前导零的编码差异', () => {
      const hisRecords = [
        createHisRecord({
          patientId: 'P001',
          visitDate: '2024-01-15',
          itemCode: '001ITEM',
          amount: 50.0
        }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({
          patientId: 'P001',
          visitDate: '2024-01-15',
          itemCode: '1ITEM', // 去除前导零后匹配
          payAmount: 50.0
        }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);

      expect(result).toHaveLength(1);
      expect(result[0].alignStatus).toBe(AlignStatus.MATCHED);
    });

    it('不同项目编码不应匹配', () => {
      const hisRecords = [
        createHisRecord({
          patientId: 'P001',
          visitDate: '2024-01-15',
          itemCode: 'ITEM001',
          amount: 50.0
        }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({
          patientId: 'P001',
          visitDate: '2024-01-15',
          itemCode: 'ITEM002', // 不同项目编码
          payAmount: 50.0
        }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);

      // 不同编码产生HIS_ONLY和INSURANCE_ONLY
      expect(result).toHaveLength(2);
    });
  });

  describe('金额误差容忍度', () => {
    it('应该在容忍度范围内视为金额相同', () => {
      const alignerWithTolerance = new Aligner({
        enableCodeMapping: true,
        amountTolerance: 0.05,
        quantityTolerance: 0,
      });

      const hisRecords = [
        createHisRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', amount: 50.03 }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', payAmount: 50.0 }),
      ];

      const result = alignerWithTolerance.align(hisRecords, insuranceRecords);

      expect(result).toHaveLength(1);
      expect(result[0].alignStatus).toBe(AlignStatus.MATCHED);
    });
  });

  describe('getStats 统计方法', () => {
    it('应该正确统计对齐结果', () => {
      const hisRecords = [
        createHisRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', amount: 50.0 }),
        createHisRecord({ patientId: 'P002', visitDate: '2024-01-15', itemCode: 'ITEM002', amount: 100.0 }),
        createHisRecord({ patientId: 'P003', visitDate: '2024-01-15', itemCode: 'ITEM003', amount: 80.0 }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', payAmount: 50.0 }), // matched
        createInsuranceRecord({ patientId: 'P002', visitDate: '2024-01-15', itemCode: 'ITEM002', payAmount: 80.0 }), // amount diff
      ];

      const result = aligner.align(hisRecords, insuranceRecords);
      const stats = aligner.getStats(result);

      expect(stats.totalHisRecords).toBe(3);
      expect(stats.totalInsuranceRecords).toBe(2);
      expect(stats.matchedCount).toBe(1);
      expect(stats.amountDiffCount).toBe(1);
      expect(stats.hisOnlyCount).toBe(1);
      expect(stats.insuranceOnlyCount).toBe(0);
    });
  });

  describe('filterByStatus 筛选方法', () => {
    it('应该能按对齐状态筛选记录', () => {
      const hisRecords = [
        createHisRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', amount: 50.0 }),
        createHisRecord({ patientId: 'P002', visitDate: '2024-01-15', itemCode: 'ITEM002', amount: 100.0 }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', payAmount: 50.0 }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);
      const matched = aligner.filterByStatus(result, AlignStatus.MATCHED);
      const hisOnly = aligner.filterByStatus(result, AlignStatus.HIS_ONLY);

      expect(matched).toHaveLength(1);
      expect(hisOnly).toHaveLength(1);
    });
  });

  describe('getAmountDiffRecords 方法', () => {
    it('应该返回所有金额差异记录', () => {
      const hisRecords = [
        createHisRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', amount: 80.0 }),
        createHisRecord({ patientId: 'P002', visitDate: '2024-01-15', itemCode: 'ITEM002', amount: 100.0 }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', payAmount: 50.0 }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);
      const diffRecords = aligner.getAmountDiffRecords(result);

      expect(diffRecords).toHaveLength(2); // 1个金额差异 + 1个HIS_ONLY
    });
  });

  describe('getMissingRecords 方法', () => {
    it('应该返回所有缺失记录', () => {
      const hisRecords = [
        createHisRecord({ patientId: 'P001', visitDate: '2024-01-15', itemCode: 'ITEM001', amount: 50.0 }),
      ];
      const insuranceRecords = [
        createInsuranceRecord({ patientId: 'P002', visitDate: '2024-01-15', itemCode: 'ITEM002', payAmount: 30.0 }),
      ];

      const result = aligner.align(hisRecords, insuranceRecords);
      const missing = aligner.getMissingRecords(result);

      expect(missing).toHaveLength(2); // 1个HIS_ONLY + 1个INSURANCE_ONLY
    });
  });
});
