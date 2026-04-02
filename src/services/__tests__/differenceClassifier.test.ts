/**
 * DifferenceClassifier 单元测试
 * 测试基于规则的差异分类引擎
 */

import { DifferenceClassifier } from '../differenceClassifier';
import {
  HisRecord,
  InsuranceRecord,
  AlignedRecord,
  AlignStatus,
  DifferenceType,
} from '../../types';

describe('DifferenceClassifier', () => {
  let classifier: DifferenceClassifier;

  beforeEach(() => {
    classifier = new DifferenceClassifier({
      amountTolerance: 0.01,
      quantityTolerance: 0,
      codeMapping: {},
      reverseFlags: ['冲', '正', '退', '取消'],
      enableRejectReasonAnalysis: true,
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

  // 创建对齐记录
  const createAlignedRecord = (overrides: Partial<AlignedRecord> = {}): AlignedRecord => ({
    alignKey: 'P001|2024-01-15|ITEM001',
    hisRecord: createHisRecord(),
    insuranceRecord: createInsuranceRecord(),
    alignStatus: AlignStatus.MATCHED,
    differenceAmount: 0,
    differenceQuantity: 0,
    ...overrides,
  });

  describe('classifyRecord 差异分类', () => {
    it('应该将完全匹配的记录分类为 MATCHED', () => {
      const record = createAlignedRecord({
        alignStatus: AlignStatus.MATCHED,
        differenceAmount: 0,
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.MATCHED);
      expect(result.amount).toBe(0);
    });

    it('应该识别 HIS 高套（金额正差异，且编码不同以避免系统口径差）', () => {
      // 使用不同编码避免触发系统口径差判断
      const record = createAlignedRecord({
        alignStatus: AlignStatus.AMOUNT_DIFF,
        hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 80.0 }),
        insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM002', payAmount: 50.0 }),
        differenceAmount: 30.0, // HIS > 医保
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.HIS_OVERCHARGE);
      expect(result.amount).toBe(30.0);
    });

    it('应该识别医保低付（金额负差异）', () => {
      const record = createAlignedRecord({
        alignStatus: AlignStatus.AMOUNT_DIFF,
        hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 50.0 }),
        insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM002', payAmount: 80.0 }),
        differenceAmount: -30.0, // HIS < 医保
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.INSURANCE_UNDERPAY);
      expect(result.amount).toBe(-30.0);
    });

    it('应该识别医保拒付关键词', () => {
      const record = createAlignedRecord({
        alignStatus: AlignStatus.AMOUNT_DIFF,
        hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 80.0 }),
        insuranceRecord: createInsuranceRecord({
          itemCode: 'ITEM002',
          payAmount: 50.0,
          rejectReason: '超限拒付',
        }),
        differenceAmount: 30.0,
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.INSURANCE_UNDERPAY);
    });

    it('应该识别手工冲销记录（项目名称含冲正关键词）', () => {
      const record = createAlignedRecord({
        alignStatus: AlignStatus.AMOUNT_DIFF,
        hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 50.0, itemName: '血常规检查-冲正' }),
        insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM002', payAmount: 0 }),
        differenceAmount: 50.0,
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.MANUAL_REVERSE);
      expect(result.isManualReverse).toBe(true);
    });

    it('应该识别 HIS 有但医保无的记录', () => {
      const record = createAlignedRecord({
        alignStatus: AlignStatus.HIS_ONLY,
        hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 50.0 }),
        insuranceRecord: null,
        differenceAmount: 50.0,
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.UNKNOWN);
    });

    it('应该识别医保有但 HIS 无的记录', () => {
      const record = createAlignedRecord({
        alignStatus: AlignStatus.INSURANCE_ONLY,
        hisRecord: null,
        insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM001', payAmount: 50.0 }),
        differenceAmount: -50.0,
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.UNKNOWN);
    });

    it('应该识别数量差异', () => {
      const record = createAlignedRecord({
        alignStatus: AlignStatus.AMOUNT_DIFF,
        hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 100.0, quantity: 5 }),
        insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM002', payAmount: 80.0 }),
        differenceAmount: 20.0,
        differenceQuantity: 3, // 数量差异显著
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.QUANTITY_DIFF);
    });

    it('相同编码但金额不同时应识别为系统口径差', () => {
      // 编码相同时被归类为系统口径差
      const record = createAlignedRecord({
        alignStatus: AlignStatus.AMOUNT_DIFF,
        hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 80.0 }),
        insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM001', payAmount: 50.0 }),
        differenceAmount: 30.0,
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.SYSTEM口径差);
      expect(result.isSystemCaliber).toBe(true);
    });
  });

  describe('批量分类 classify', () => {
    it('应该正确批量分类多条记录', () => {
      const records: AlignedRecord[] = [
        createAlignedRecord({
          alignKey: 'P001|2024-01-15|ITEM001',
          alignStatus: AlignStatus.MATCHED,
          differenceAmount: 0,
        }),
        createAlignedRecord({
          alignKey: 'P002|2024-01-15|ITEM002',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ patientId: 'P002', itemCode: 'ITEM001', amount: 80.0 }),
          insuranceRecord: createInsuranceRecord({ patientId: 'P002', itemCode: 'ITEM002', payAmount: 50.0 }),
          differenceAmount: 30.0,
        }),
      ];

      const results = classifier.classify(records);

      expect(results.size).toBe(2);
      expect(results.get('P001|2024-01-15|ITEM001')?.type).toBe(DifferenceType.MATCHED);
      expect(results.get('P002|2024-01-15|ITEM002')?.type).toBe(DifferenceType.HIS_OVERCHARGE);
    });
  });

  describe('getStats 统计方法', () => {
    it('应该正确统计各类型数量和金额', () => {
      const records: AlignedRecord[] = [
        createAlignedRecord({
          alignKey: 'P001|2024-01-15|ITEM001',
          alignStatus: AlignStatus.MATCHED,
          differenceAmount: 0,
        }),
        createAlignedRecord({
          alignKey: 'P002|2024-01-15|ITEM002',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ patientId: 'P002', itemCode: 'ITEM001', amount: 80.0 }),
          insuranceRecord: createInsuranceRecord({ patientId: 'P002', itemCode: 'ITEM002', payAmount: 50.0 }),
          differenceAmount: 30.0,
        }),
        createAlignedRecord({
          alignKey: 'P003|2024-01-15|ITEM003',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ patientId: 'P003', itemCode: 'ITEM002', amount: 60.0 }),
          insuranceRecord: createInsuranceRecord({ patientId: 'P003', itemCode: 'ITEM003', payAmount: 40.0 }),
          differenceAmount: 20.0,
        }),
      ];

      const classifications = classifier.classify(records);
      const stats = classifier.getStats(records, classifications);

      expect(stats.typeCounts[DifferenceType.MATCHED]).toBe(1);
      expect(stats.typeCounts[DifferenceType.HIS_OVERCHARGE]).toBe(2);
      expect(stats.totalDifferenceAmount).toBe(50.0); // 30 + 20
      expect(stats.totalDiffRecords).toBe(2);
    });
  });

  describe('filterByType 按类型筛选', () => {
    it('应该能按差异类型筛选记录', () => {
      const records: AlignedRecord[] = [
        createAlignedRecord({
          alignKey: 'P001|2024-01-15|ITEM001',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 80.0 }),
          insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM002', payAmount: 50.0 }),
          differenceAmount: 30.0,
        }),
        createAlignedRecord({
          alignKey: 'P002|2024-01-15|ITEM002',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ patientId: 'P002', itemCode: 'ITEM002', amount: 60.0 }),
          insuranceRecord: createInsuranceRecord({ patientId: 'P002', itemCode: 'ITEM003', payAmount: 40.0 }),
          differenceAmount: 20.0,
        }),
      ];

      const classifications = classifier.classify(records);
      const hisOverchargeRecords = classifier.filterByType(records, classifications, DifferenceType.HIS_OVERCHARGE);

      expect(hisOverchargeRecords).toHaveLength(2);
    });
  });

  describe('getHighRiskRecords 高套风险记录', () => {
    it('应该按金额降序返回高套风险记录', () => {
      const records: AlignedRecord[] = [
        createAlignedRecord({
          alignKey: 'P001|2024-01-15|ITEM001',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 60.0 }),
          insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM002', payAmount: 50.0 }),
          differenceAmount: 10.0,
        }),
        createAlignedRecord({
          alignKey: 'P002|2024-01-15|ITEM002',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ patientId: 'P002', itemCode: 'ITEM002', amount: 200.0 }),
          insuranceRecord: createInsuranceRecord({ patientId: 'P002', itemCode: 'ITEM003', payAmount: 50.0 }),
          differenceAmount: 150.0,
        }),
      ];

      const classifications = classifier.classify(records);
      const highRisk = classifier.getHighRiskRecords(records, classifications);

      expect(highRisk).toHaveLength(2);
      expect(highRisk[0].detail.amount).toBe(150.0); // 金额最大的在前面
      expect(highRisk[1].detail.amount).toBe(10.0);
    });

    it('应该支持 limit 参数限制返回数量', () => {
      const records: AlignedRecord[] = [
        createAlignedRecord({
          alignKey: 'P001|2024-01-15|ITEM001',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 60.0 }),
          insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM002', payAmount: 50.0 }),
          differenceAmount: 10.0,
        }),
        createAlignedRecord({
          alignKey: 'P002|2024-01-15|ITEM002',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ patientId: 'P002', itemCode: 'ITEM002', amount: 200.0 }),
          insuranceRecord: createInsuranceRecord({ patientId: 'P002', itemCode: 'ITEM003', payAmount: 50.0 }),
          differenceAmount: 150.0,
        }),
      ];

      const classifications = classifier.classify(records);
      const highRisk = classifier.getHighRiskRecords(records, classifications, 1);

      expect(highRisk).toHaveLength(1);
      expect(highRisk[0].detail.amount).toBe(150.0);
    });
  });

  describe('getUnderpayRecords 医保扣款记录', () => {
    it('应该按金额降序返回医保扣款记录', () => {
      // 医保低付需要有rejectReason包含拒付关键词，或者diffAmount<0
      const records: AlignedRecord[] = [
        createAlignedRecord({
          alignKey: 'P001|2024-01-15|ITEM001',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 50.0 }),
          insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM002', payAmount: 40.0, rejectReason: '超限扣款' }),
          differenceAmount: 10.0,
        }),
        createAlignedRecord({
          alignKey: 'P002|2024-01-15|ITEM002',
          alignStatus: AlignStatus.AMOUNT_DIFF,
          hisRecord: createHisRecord({ patientId: 'P002', itemCode: 'ITEM002', amount: 50.0 }),
          insuranceRecord: createInsuranceRecord({ patientId: 'P002', itemCode: 'ITEM003', payAmount: 20.0, rejectReason: '违规拒付' }),
          differenceAmount: 30.0,
        }),
      ];

      const classifications = classifier.classify(records);
      const underpay = classifier.getUnderpayRecords(records, classifications);

      expect(underpay).toHaveLength(2);
      expect(underpay[0].detail.amount).toBe(30.0); // 金额最大的在前面
    });
  });

  describe('系统口径差识别', () => {
    it('应该识别编码映射导致的系统口径差', () => {
      const classifierWithMapping = new DifferenceClassifier({
        amountTolerance: 0.01,
        quantityTolerance: 0,
        codeMapping: {
          'item001': 'ITEM001',
          'item002': 'ITEM002',
        },
        reverseFlags: [],
        enableRejectReasonAnalysis: false,
      });

      const record = createAlignedRecord({
        alignStatus: AlignStatus.AMOUNT_DIFF,
        hisRecord: createHisRecord({ itemCode: 'item001', amount: 55.0 }),
        insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM001', payAmount: 50.0 }),
        differenceAmount: 5.0,
      });

      const result = classifierWithMapping.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.SYSTEM口径差);
      expect(result.isSystemCaliber).toBe(true);
    });
  });

  describe('冲正标志识别', () => {
    it('应该识别结算号中的冲正标志', () => {
      const record = createAlignedRecord({
        alignStatus: AlignStatus.HIS_ONLY,
        hisRecord: createHisRecord({ settlementNo: 'HIS20240115001-冲' }),
        insuranceRecord: null,
        differenceAmount: 50.0,
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.MANUAL_REVERSE);
    });

    it('应该识别医保拒付类型中的冲正标志', () => {
      const record = createAlignedRecord({
        alignStatus: AlignStatus.AMOUNT_DIFF,
        hisRecord: createHisRecord({ itemCode: 'ITEM001', amount: 50.0 }),
        insuranceRecord: createInsuranceRecord({ itemCode: 'ITEM002', payAmount: 0, rejectType: '冲销' }),
        differenceAmount: 50.0,
      });

      const result = classifier.classifyRecord(record);

      expect(result.type).toBe(DifferenceType.MANUAL_REVERSE);
    });
  });
});
