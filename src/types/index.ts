/**
 * 医保对账差异语义聚类分析器 - 核心类型定义
 * Medical Insurance Reconciliation - Core Type Definitions
 */

/**
 * HIS结算记录
 * 代表医院信息系统(HIS)中的一笔结算记录
 */
export interface HisRecord {
  /** 患者ID */
  patientId: string;
  /** 就诊日期 (YYYY-MM-DD) */
  visitDate: string;
  /** 医疗项目编码 */
  itemCode: string;
  /** 医疗项目名称 */
  itemName: string;
  /** 数量 */
  quantity: number;
  /** 金额 (HIS计费金额) */
  amount: number;
  /** 科室编码 */
  departmentCode: string;
  /** 科室名称 */
  departmentName: string;
  /** 诊断编码 */
  diagnosisCode?: string;
  /** 诊断名称 */
  diagnosisName?: string;
  /** 医生编码 */
  doctorCode?: string;
  /** 收费员 */
  chargeOperator?: string;
  /** 结算流水号 */
  settlementNo: string;
  /** 结算时间 */
  settlementTime?: string;
}

/**
 * 医保平台回传记录
 * 代表医保平台返回的结算/扣款记录
 */
export interface InsuranceRecord {
  /** 患者ID */
  patientId: string;
  /** 就诊日期 (YYYY-MM-DD) */
  visitDate: string;
  /** 医疗项目编码(医保目录编码) */
  itemCode: string;
  /** 金额(医保认定金额) */
  amount: number;
  /** 实付金额(医保实际支付) */
  payAmount: number;
  /** 拒付/扣款原因 */
  rejectReason?: string;
  /** 拒付类型 */
  rejectType?: string;
  /** 医保卡号 */
  insuranceCardNo?: string;
  /** 结算流水号 */
  settlementNo: string;
  /** 结算时间 */
  settlementTime?: string;
  /** 定点医疗机构编码 */
  hospitalCode?: string;
  /** 医保经办机构 */
  insuranceAgency?: string;
}

/**
 * 字段映射配置
 * 用于将不同系统的字段名映射到标准字段名
 */
export interface FieldMapping {
  /** HIS系统字段映射配置 */
  his: {
    /** 患者ID字段名 */
    patientId: string;
    /** 就诊日期字段名 */
    visitDate: string;
    /** 项目编码字段名 */
    itemCode: string;
    /** 项目名称字段名 */
    itemName: string;
    /** 数量字段名 */
    quantity: string;
    /** 金额字段名 */
    amount: string;
    /** 科室编码字段名 */
    departmentCode: string;
    /** 科室名称字段名 */
    departmentName: string;
    /** 诊断编码字段名 */
    diagnosisCode?: string;
    /** 诊断名称字段名 */
    diagnosisName?: string;
    /** 结算流水号字段名 */
    settlementNo: string;
  };
  /** 医保系统字段映射配置 */
  insurance: {
    /** 患者ID字段名 */
    patientId: string;
    /** 就诊日期字段名 */
    visitDate: string;
    /** 项目编码字段名 */
    itemCode: string;
    /** 金额字段名 */
    amount: string;
    /** 实付金额字段名 */
    payAmount: string;
    /** 拒付原因字段名 */
    rejectReason?: string;
    /** 结算流水号字段名 */
    settlementNo: string;
  };
}

/**
 * 对齐记录
 * 代表HIS记录与医保记录对齐后的结果
 */
export interface AlignedRecord {
  /** 对齐键值(患者ID+日期+项目编码的组合) */
  alignKey: string;
  /** HIS原始记录 */
  hisRecord: HisRecord | null;
  /** 医保原始记录 */
  insuranceRecord: InsuranceRecord | null;
  /** 对齐状态 */
  alignStatus: AlignStatus;
  /** 差异金额 (HIS金额 - 医保金额) */
  differenceAmount: number;
  /** 差异数量 (HIS数量 - 医保数量) */
  differenceQuantity: number;
  /** 初步差异分类(基于规则) */
  preliminaryType?: DifferenceType;
}

/**
 * 对齐状态枚举
 */
export const enum AlignStatus {
  /** 完全匹配 */
  MATCHED = 'matched',
  /** 金额差异 */
  AMOUNT_DIFF = 'amount_diff',
  /** HIS有但医保无 */
  HIS_ONLY = 'his_only',
  /** 医保有但HIS无 */
  INSURANCE_ONLY = 'insurance_only',
}

/**
 * 差异类型枚举
 * 基于规则的初步差异分类
 */
export const enum DifferenceType {
  /** HIS高套 (HIS金额>医保金额且非系统误差) */
  HIS_OVERCHARGE = 'his_overcharge',
  /** 医保低付/拒付 (医保克扣) */
  INSURANCE_UNDERPAY = 'insurance_underpay',
  /** 数量差异 (计费数量不一致) */
  QUANTITY_DIFF = 'quantity_diff',
  /** 系统口径差 (编码映射导致) */
  SYSTEM口径差 = 'system口径差',
  /** 手工冲销/冲正 */
  MANUAL_REVERSE = 'manual_reverse',
  /** 完全匹配(无差异) */
  MATCHED = 'matched',
  /** 未知类型 */
  UNKNOWN = 'unknown',
}

/**
 * 语义聚类结果
 * LLM对差异记录的语义归因结果
 */
export interface SemanticCluster {
  /** 聚类ID */
  clusterId: string;
  /** 语义类别名称 */
  categoryName: string;
  /** 涉及记录条数 */
  recordCount: number;
  /** 涉及总金额 */
  totalAmount: number;
  /** 典型案例列表(脱敏) */
  typicalCases: TypicalCase[];
  /** LLM归因说明 */
  attribution: string;
  /** 建议处理方式 */
  suggestedAction?: string;
}

/**
 * 典型案例(脱敏后)
 */
export interface TypicalCase {
  /** 案例索引 */
  index: number;
  /** 患者ID(脱敏,只显示后4位) */
  patientIdMasked: string;
  /** 就诊日期 */
  visitDate: string;
  /** 项目名称 */
  itemName: string;
  /** 差异金额 */
  differenceAmount: number;
  /** 简要说明 */
  briefDescription: string;
}

/**
 * 聚类原因描述
 * 对每个语义聚类类别的详细描述
 */
export interface ClusterReason {
  /** 类别名称 */
  categoryName: string;
  /** 原因描述 */
  description: string;
  /** 可能的业务原因 */
  possibleReasons: string[];
  /** 建议的核查方向 */
  suggestedInvestigation: string[];
}

/**
 * 最终对账结果
 * 代表完整的对账分析结果
 */
export interface ReconciliationResult {
  /** 对账执行时间 */
  executedAt: string;
  /** HIS文件路径 */
  hisFilePath: string;
  /** 医保文件路径 */
  insuranceFilePath: string;
  /** 对账模式 */
  mode: ReconciliationMode;
  /** 总HIS记录数 */
  totalHisRecords: number;
  /** 总医保记录数 */
  totalInsuranceRecords: number;
  /** 完全匹配数 */
  matchedCount: number;
  /** 金额差异数 */
  amountDiffCount: number;
  /** 记录缺失数(HIS有医保无) */
  hisOnlyCount: number;
  /** 记录缺失数(医保有HIS无) */
  insuranceOnlyCount: number;
  /** 总差异金额 */
  totalDifferenceAmount: number;
  /** 对齐记录列表 */
  alignedRecords: AlignedRecord[];
  /** 语义聚类结果(如果启用) */
  semanticClusters?: SemanticCluster[];
  /** 各差异类型的统计 */
  differenceTypeStats: Record<DifferenceType, number>;
  /** 执行耗时(毫秒) */
  executionTimeMs: number;
  /** 是否使用Mock模式 */
  isMockMode: boolean;
}

/**
 * 对账模式枚举
 */
export const enum ReconciliationMode {
  /** 完整模式(包含语义聚类) */
  FULL = 'full',
  /** 仅语义聚类模式 */
  SEMANTIC = 'semantic',
  /** 快速模式(仅规则分类) */
  FAST = 'fast',
}

/**
 * 对账选项
 */
export interface ReconciliationOptions {
  /** 对账模式 */
  mode?: ReconciliationMode;
  /** 是否使用Mock LLM */
  mockLLM?: boolean;
  /** 最大并发数(LLM调用) */
  maxConcurrent?: number;
  /** 字段映射配置路径 */
  mappingConfigPath?: string;
  /** 输出路径 */
  outputPath?: string;
  /** 进度回调函数 */
  onProgress?: (progress: ProgressInfo) => void;
}

/**
 * 进度信息
 */
export interface ProgressInfo {
  /** 当前阶段 */
  stage: string;
  /** 进度百分比 */
  percent: number;
  /** 当前处理数量 */
  current: number;
  /** 总数量 */
  total: number;
  /** 详细信息 */
  message?: string;
}

/**
 * CLI命令选项
 */
export interface CliOptions {
  /** HIS文件路径 */
  hisFile: string;
  /** 医保文件路径 */
  insuranceFile: string;
  /** 文件格式 */
  format?: 'csv' | 'excel';
  /** 输出路径 */
  output?: string;
  /** 映射配置路径 */
  mapping?: string;
  /** 对账模式 */
  mode?: ReconciliationMode;
  /** 使用Mock LLM */
  mock?: boolean;
}

/**
 * 报告选项
 */
export interface ReportOptions {
  /** 结果文件路径 */
  resultFile: string;
  /** 报告类型 */
  type?: 'summary' | 'detail' | 'clusters';
  /** 输出格式 */
  format?: 'html' | 'json';
  /** 输出路径 */
  output?: string;
}

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 结果文件路径 */
  resultFile: string;
  /** 患者ID */
  patientId?: string;
  /** 聚类类别 */
  clusterType?: string;
  /** 差异类型 */
  differenceType?: DifferenceType;
}
