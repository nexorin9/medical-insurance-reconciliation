/**
 * 字段映射配置加载器
 * 支持从 JSON 配置文件加载自定义映射，也支持从 .env 覆盖字段名
 */

import * as fs from 'fs';
import * as path from 'path';
import { FieldMapping } from '../types';

// 内置默认 HIS→标准字段映射
const DEFAULT_HIS_MAPPING: FieldMapping['his'] = {
  patientId: 'patient_id',
  visitDate: 'visit_date',
  itemCode: 'item_code',
  itemName: 'item_name',
  quantity: 'quantity',
  amount: 'amount',
  departmentCode: 'department_code',
  departmentName: 'department_name',
  diagnosisCode: 'diagnosis_code',
  diagnosisName: 'diagnosis_name',
  settlementNo: 'settlement_no',
};

// 内置默认医保平台→标准字段映射
const DEFAULT_INSURANCE_MAPPING: FieldMapping['insurance'] = {
  patientId: 'patient_id',
  visitDate: 'visit_date',
  itemCode: 'item_code',
  amount: 'amount',
  payAmount: 'pay_amount',
  rejectReason: 'reject_reason',
  settlementNo: 'settlement_no',
};

// 默认字段映射配置
const DEFAULT_FIELD_MAPPING: FieldMapping = {
  his: DEFAULT_HIS_MAPPING,
  insurance: DEFAULT_INSURANCE_MAPPING,
};

// 配置文件结构（包含 aliases）
interface FieldMappingConfig {
  description?: string;
  version?: string;
  his: {
    [key: string]: {
      standard: string;
      aliases?: string[];
    };
  };
  insurance: {
    [key: string]: {
      standard: string;
      aliases?: string[];
    };
  };
}

/**
 * 字段映射器类
 * 负责加载和管理 HIS/医保 字段到标准字段名的映射
 */
export class FieldMapper {
  private fieldMapping: FieldMapping;
  private configPath: string | null = null;
  private config: FieldMappingConfig | null = null;

  constructor(fieldMapping?: FieldMapping) {
    this.fieldMapping = fieldMapping || DEFAULT_FIELD_MAPPING;
  }

  /**
   * 从配置文件加载字段映射
   * @param configPath 配置文件路径（相对于项目根目录）
   */
  loadFromFile(configPath: string): void {
    try {
      // 支持相对路径和绝对路径
      const fullPath = path.isAbsolute(configPath)
        ? configPath
        : path.resolve(process.cwd(), configPath);

      if (!fs.existsSync(fullPath)) {
        console.warn(`警告: 字段映射配置文件不存在 ${fullPath}，使用默认配置`);
        return;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const loadedConfig = JSON.parse(content) as FieldMappingConfig;

      this.configPath = fullPath;
      this.config = loadedConfig;

      // 将配置转换为 FieldMapping 格式
      this.fieldMapping = this.convertConfigToMapping(loadedConfig);

      console.log(`字段映射配置已加载: ${fullPath}`);
    } catch (error) {
      console.warn(`警告: 无法加载字段映射配置文件 ${configPath}，使用默认配置:`, error);
    }
  }

  /**
   * 将配置文件转换为 FieldMapping 格式
   */
  private convertConfigToMapping(config: FieldMappingConfig): FieldMapping {
    const his: FieldMapping['his'] = {} as FieldMapping['his'];
    const insurance: FieldMapping['insurance'] = {} as FieldMapping['insurance'];

    // 转换 HIS 映射（取 aliases 中的第一个作为实际字段名）
    for (const [key, value] of Object.entries(config.his)) {
      if (value && typeof value === 'object' && 'standard' in value) {
        // 使用第一个 alias 作为实际字段名
        (his as any)[key] = value.aliases?.[0] || value.standard;
      }
    }

    // 转换保险映射
    for (const [key, value] of Object.entries(config.insurance)) {
      if (value && typeof value === 'object' && 'standard' in value) {
        (insurance as any)[key] = value.aliases?.[0] || value.standard;
      }
    }

    return { his, insurance };
  }

  /**
   * 从 .env 环境变量覆盖字段名
   * 支持的环境变量格式：
   * - HIS_PATIENT_ID_FIELD=his_patient_id
   * - INSURANCE_PAY_AMOUNT_FIELD=insurance_pay
   */
  loadFromEnv(): void {
    const envHis: Partial<Record<keyof FieldMapping['his'], string>> = {};
    const envInsurance: Partial<Record<keyof FieldMapping['insurance'], string>> = {};

    // HIS 字段环境变量覆盖
    const hisFields: Array<keyof FieldMapping['his']> = [
      'patientId', 'visitDate', 'itemCode', 'itemName', 'quantity', 'amount',
      'departmentCode', 'departmentName', 'diagnosisCode', 'diagnosisName', 'settlementNo'
    ];

    for (const field of hisFields) {
      const envKey = `HIS_${field.toUpperCase()}_FIELD`;
      const envValue = process.env[envKey];
      if (envValue) {
        envHis[field] = envValue;
      }
    }

    // Insurance 字段环境变量覆盖
    const insuranceFields: Array<keyof FieldMapping['insurance']> = [
      'patientId', 'visitDate', 'itemCode', 'amount', 'payAmount', 'rejectReason', 'settlementNo'
    ];

    for (const field of insuranceFields) {
      const envKey = `INSURANCE_${field.toUpperCase()}_FIELD`;
      const envValue = process.env[envKey];
      if (envValue) {
        envInsurance[field] = envValue;
      }
    }

    // 合并环境变量覆盖
    if (Object.keys(envHis).length > 0 || Object.keys(envInsurance).length > 0) {
      this.fieldMapping = {
        his: { ...this.fieldMapping.his, ...envHis },
        insurance: { ...this.fieldMapping.insurance, ...envInsurance },
      };
      console.log('字段映射已从环境变量覆盖');
    }
  }

  /**
   * 从自定义 JSON 文件加载并合并到现有映射
   */
  mergeFromFile(configPath: string): void {
    try {
      const fullPath = path.isAbsolute(configPath)
        ? configPath
        : path.resolve(process.cwd(), configPath);

      if (!fs.existsSync(fullPath)) {
        console.warn(`警告: 字段映射配置文件不存在 ${fullPath}`);
        return;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const customMapping = JSON.parse(content) as FieldMapping;

      // 合并到现有映射
      this.fieldMapping = {
        his: { ...this.fieldMapping.his, ...customMapping.his },
        insurance: { ...this.fieldMapping.insurance, ...customMapping.insurance },
      };

      console.log(`字段映射已合并: ${fullPath}`);
    } catch (error) {
      console.warn(`警告: 无法合并字段映射配置文件 ${configPath}:`, error);
    }
  }

  /**
   * 获取当前字段映射
   */
  getFieldMapping(): FieldMapping {
    return this.fieldMapping;
  }

  /**
   * 获取 HIS 字段映射
   */
  getHisMapping(): FieldMapping['his'] {
    return this.fieldMapping.his;
  }

  /**
   * 获取医保字段映射
   */
  getInsuranceMapping(): FieldMapping['insurance'] {
    return this.fieldMapping.insurance;
  }

  /**
   * 根据实际列名获取标准字段名（HIS）
   * 用于自动列名识别
   */
  getStandardHisFieldName(actualColumnName: string): string | null {
    const normalized = actualColumnName.toLowerCase().trim();

    // 从配置中查找匹配的 alias
    if (this.config?.his) {
      for (const [standardName, config] of Object.entries(this.config.his)) {
        if (config && typeof config === 'object' && 'aliases' in config) {
          if (config.aliases?.map(a => a.toLowerCase()).includes(normalized)) {
            return standardName;
          }
        }
      }
    }

    // 从内置默认映射中查找
    for (const [standardName, actualName] of Object.entries(this.fieldMapping.his)) {
      if (actualName.toLowerCase() === normalized) {
        return standardName;
      }
    }

    return null;
  }

  /**
   * 根据实际列名获取标准字段名（医保）
   */
  getStandardInsuranceFieldName(actualColumnName: string): string | null {
    const normalized = actualColumnName.toLowerCase().trim();

    if (this.config?.insurance) {
      for (const [standardName, config] of Object.entries(this.config.insurance)) {
        if (config && typeof config === 'object' && 'aliases' in config) {
          if (config.aliases?.map(a => a.toLowerCase()).includes(normalized)) {
            return standardName;
          }
        }
      }
    }

    for (const [standardName, actualName] of Object.entries(this.fieldMapping.insurance)) {
      if (actualName.toLowerCase() === normalized) {
        return standardName;
      }
    }

    return null;
  }

  /**
   * 获取所有支持的标准字段名（HIS）
   */
  getAllStandardHisFields(): string[] {
    return Object.keys(this.fieldMapping.his);
  }

  /**
   * 获取所有支持的标准字段名（医保）
   */
  getAllStandardInsuranceFields(): string[] {
    return Object.keys(this.fieldMapping.insurance);
  }

  /**
   * 创建默认 FieldMapper 实例（依次检查 env 和自定义配置）
   */
  static createDefault(): FieldMapper {
    const mapper = new FieldMapper();

    // 1. 先尝试从 .env 中的 CUSTOM_FIELD_MAPPING_PATH 加载
    const customPath = process.env.CUSTOM_FIELD_MAPPING_PATH;
    if (customPath) {
      mapper.loadFromFile(customPath);
    }

    // 2. 尝试从默认配置文件加载
    const defaultConfigPath = path.resolve(process.cwd(), 'config/field-mapping.json');
    if (fs.existsSync(defaultConfigPath)) {
      mapper.loadFromFile(defaultConfigPath);
    }

    // 3. 最后用环境变量覆盖
    mapper.loadFromEnv();

    return mapper;
  }

  /**
   * 重置为默认映射
   */
  reset(): void {
    this.fieldMapping = DEFAULT_FIELD_MAPPING;
    this.configPath = null;
    this.config = null;
  }
}

export default FieldMapper;