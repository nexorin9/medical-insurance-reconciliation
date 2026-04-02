/**
 * Excel 数据导入服务
 * 支持读取 HIS Excel 和医保回传 Excel，返回统一格式的记录数组
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import {
  HisRecord,
  InsuranceRecord,
  FieldMapping,
} from '../types';

/** 默认字段映射配置 */
const DEFAULT_FIELD_MAPPING: FieldMapping = {
  his: {
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
  },
  insurance: {
    patientId: 'patient_id',
    visitDate: 'visit_date',
    itemCode: 'item_code',
    amount: 'amount',
    payAmount: 'pay_amount',
    rejectReason: 'reject_reason',
    settlementNo: 'settlement_no',
  },
};

/** 解析后的原始记录（未映射字段） */
interface RawRecord {
  [key: string]: string | number | undefined;
}

/**
 * Excel 导入器类
 * 支持 HIS Excel 和医保回传 Excel 的读取与字段映射
 */
export class ExcelImporter {
  private fieldMapping: FieldMapping;

  constructor(fieldMapping?: FieldMapping) {
    this.fieldMapping = fieldMapping || DEFAULT_FIELD_MAPPING;
  }

  /**
   * 从配置文件加载字段映射
   */
  static loadFieldMappingFromFile(configPath: string): FieldMapping {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content) as FieldMapping;
    } catch (error) {
      console.warn(`警告: 无法加载字段映射配置文件 ${configPath}，使用默认配置`);
      return DEFAULT_FIELD_MAPPING;
    }
  }

  /**
   * 自动检测 Excel 文件的 sheet 列表
   */
  async detectSheets(filePath: string): Promise<string[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    const workbook = XLSX.readFile(filePath);
    return workbook.SheetNames;
  }

  /**
   * 自动检测应该使用的 sheet（返回第一个 sheet 或名称包含关键字的 sheet）
   */
  async detectMainSheet(filePath: string, type: 'his' | 'insurance'): Promise<string> {
    const sheets = await this.detectSheets(filePath);
    if (sheets.length === 0) {
      throw new Error(`Excel 文件中没有发现任何 sheet: ${filePath}`);
    }
    const firstSheet = sheets[0];
    if (!firstSheet) {
      throw new Error(`Excel 文件中没有发现任何 sheet: ${filePath}`);
    }
    if (sheets.length === 1) {
      return firstSheet;
    }
    // 尝试根据类型关键字检测
    const keywords: Record<'his' | 'insurance', string[]> = {
      his: ['his', '医院', '结算', '收费', '计费'],
      insurance: ['insurance', '医保', '回传', '支付', '保险'],
    };
    const typeKeywords = keywords[type];
    for (const sheetName of sheets) {
      const lower = sheetName.toLowerCase();
      for (const keyword of typeKeywords) {
        if (lower.includes(keyword)) {
          return sheetName;
        }
      }
    }
    // 默认返回第一个 sheet
    console.warn(`警告: 未能根据类型自动检测 sheet，默认使用第一个: ${firstSheet}`);
    return firstSheet;
  }

  /**
   * 读取 Excel 文件的 sheet 数据
   */
  private readSheet(filePath: string, sheetName?: string, type?: 'his' | 'insurance'): XLSX.WorkSheet {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    const workbook = XLSX.readFile(filePath);
    let targetSheet = sheetName;
    if (!targetSheet && type) {
      const firstName = workbook.SheetNames[0];
      targetSheet = firstName || undefined;
      // 尝试自动检测
      const keywords: Record<'his' | 'insurance', string[]> = {
        his: ['his', '医院', '结算', '收费', '计费'],
        insurance: ['insurance', '医保', '回传', '支付', '保险'],
      };
      const typeKeywords = keywords[type];
      for (const name of workbook.SheetNames) {
        const lower = name.toLowerCase();
        for (const keyword of typeKeywords) {
          if (lower.includes(keyword)) {
            targetSheet = name;
            break;
          }
        }
        if (targetSheet && targetSheet !== firstName) break;
      }
    } else if (!targetSheet) {
      const firstName = workbook.SheetNames[0];
      targetSheet = firstName;
    }
    if (!targetSheet) {
      throw new Error(`Excel 文件中没有发现任何 sheet: ${filePath}`);
    }
    const sheet = workbook.Sheets[targetSheet];
    if (!sheet) {
      throw new Error(`找不到指定的 sheet: ${targetSheet}`);
    }
    return sheet;
  }

  /**
   * 标准化列名（转小写、去除空格）
   */
  private normalizeColumnName(col: string): string {
    return col.toLowerCase().trim().replace(/\s+/g, '_');
  }

  /**
   * 映射 HIS 记录
   */
  private mapHisRecord(raw: RawRecord): HisRecord {
    const m = this.fieldMapping.his;
    const getValue = (key: string, fallback: string): string => {
      const normalizedKey = this.normalizeColumnName(key);
      for (const k of Object.keys(raw)) {
        if (this.normalizeColumnName(k) === normalizedKey) {
          return String(raw[k] ?? '');
        }
      }
      return '';
    };
    const getNumber = (key: string, fallback: number): number => {
      const normalizedKey = this.normalizeColumnName(key);
      for (const k of Object.keys(raw)) {
        if (this.normalizeColumnName(k) === normalizedKey) {
          const val = raw[k];
          if (val === undefined || val === null || val === '') return fallback;
          const num = Number(val);
          return isNaN(num) ? fallback : num;
        }
      }
      return fallback;
    };
    return {
      patientId: getValue(m.patientId, 'patient_id'),
      visitDate: getValue(m.visitDate, 'visit_date'),
      itemCode: getValue(m.itemCode, 'item_code'),
      itemName: getValue(m.itemName, 'item_name'),
      quantity: getNumber(m.quantity, 0),
      amount: getNumber(m.amount, 0),
      departmentCode: getValue(m.departmentCode, 'department_code'),
      departmentName: getValue(m.departmentName, 'department_name'),
      diagnosisCode: getValue(m.diagnosisCode || 'diagnosis_code', ''),
      diagnosisName: getValue(m.diagnosisName || 'diagnosis_name', ''),
      settlementNo: getValue(m.settlementNo, 'settlement_no'),
      settlementTime: getValue('settlement_time', ''),
      chargeOperator: getValue('charge_operator', ''),
      doctorCode: getValue('doctor_code', ''),
    };
  }

  /**
   * 映射医保记录
   */
  private mapInsuranceRecord(raw: RawRecord): InsuranceRecord {
    const m = this.fieldMapping.insurance;
    const getValue = (key: string, fallback: string): string => {
      const normalizedKey = this.normalizeColumnName(key);
      for (const k of Object.keys(raw)) {
        if (this.normalizeColumnName(k) === normalizedKey) {
          return String(raw[k] ?? '');
        }
      }
      return '';
    };
    const getNumber = (key: string, fallback: number): number => {
      const normalizedKey = this.normalizeColumnName(key);
      for (const k of Object.keys(raw)) {
        if (this.normalizeColumnName(k) === normalizedKey) {
          const val = raw[k];
          if (val === undefined || val === null || val === '') return fallback;
          const num = Number(val);
          return isNaN(num) ? fallback : num;
        }
      }
      return fallback;
    };
    return {
      patientId: getValue(m.patientId, 'patient_id'),
      visitDate: getValue(m.visitDate, 'visit_date'),
      itemCode: getValue(m.itemCode, 'item_code'),
      amount: getNumber(m.amount, 0),
      payAmount: getNumber(m.payAmount, 0),
      rejectReason: getValue(m.rejectReason || 'reject_reason', ''),
      rejectType: getValue('reject_type', ''),
      settlementNo: getValue(m.settlementNo, 'settlement_no'),
      settlementTime: getValue('settlement_time', ''),
      insuranceCardNo: getValue('insurance_card_no', ''),
      hospitalCode: getValue('hospital_code', ''),
      insuranceAgency: getValue('insurance_agency', ''),
    };
  }

  /**
   * 解析 HIS Excel 文件
   * @param filePath 文件路径
   * @param sheetName 可选的 sheet 名称，不指定则自动检测
   */
  async importHisExcel(filePath: string, sheetName?: string): Promise<HisRecord[]> {
    return this.parseExcelFile<HisRecord>(filePath, sheetName, 'his', (raw) => this.mapHisRecord(raw));
  }

  /**
   * 解析医保回传 Excel 文件
   * @param filePath 文件路径
   * @param sheetName 可选的 sheet 名称，不指定则自动检测
   */
  async importInsuranceExcel(filePath: string, sheetName?: string): Promise<InsuranceRecord[]> {
    return this.parseExcelFile<InsuranceRecord>(filePath, sheetName, 'insurance', (raw) => this.mapInsuranceRecord(raw));
  }

  /**
   * 通用 Excel 解析方法
   */
  private async parseExcelFile<T>(
    filePath: string,
    sheetName: string | undefined,
    type: 'his' | 'insurance',
    mapper: (raw: RawRecord) => T
  ): Promise<T[]> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    const worksheet = this.readSheet(filePath, sheetName, type);
    const data = XLSX.utils.sheet_to_json<RawRecord>(worksheet, {
      defval: undefined, // 默认值
      raw: false, // 转换为字符串
      header: 1, // 使用第一行作为 header
    });
    if (data.length === 0) {
      console.warn(`警告: Excel 文件 ${filePath} 中没有数据`);
      return [];
    }
    // 第一行是表头
    const headers = (data[0] as unknown as string[]).map((h) => this.normalizeColumnName(String(h)));
    const results: T[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown as (string | number | undefined)[];
      const raw: RawRecord = {};
      headers.forEach((header, idx) => {
        raw[header] = row[idx];
      });
      try {
        const mapped = mapper(raw);
        if (mapped) {
          results.push(mapped);
        }
      } catch (error) {
        console.warn(`警告: 第 ${i + 1} 行解析失败:`, error);
      }
    }
    console.log(`解析完成: ${filePath}, 共 ${data.length - 1} 行, 有效记录 ${results.length} 条`);
    return results;
  }

  /**
   * 同步方法：解析 HIS Excel 文件
   */
  importHisExcelSync(filePath: string, sheetName?: string): HisRecord[] {
    return this.parseExcelFileSync<HisRecord>(filePath, sheetName, 'his', (raw) => this.mapHisRecord(raw));
  }

  /**
   * 同步方法：解析医保回传 Excel 文件
   */
  importInsuranceExcelSync(filePath: string, sheetName?: string): InsuranceRecord[] {
    return this.parseExcelFileSync<InsuranceRecord>(filePath, sheetName, 'insurance', (raw) => this.mapInsuranceRecord(raw));
  }

  /**
   * 同步 Excel 解析方法
   */
  private parseExcelFileSync<T>(
    filePath: string,
    sheetName: string | undefined,
    type: 'his' | 'insurance',
    mapper: (raw: RawRecord) => T
  ): T[] {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    const worksheet = this.readSheet(filePath, sheetName, type);
    const data = XLSX.utils.sheet_to_json<RawRecord>(worksheet, {
      defval: undefined,
      raw: false,
      header: 1,
    });
    if (data.length === 0) {
      console.warn(`警告: Excel 文件 ${filePath} 中没有数据`);
      return [];
    }
    const headers = (data[0] as unknown as string[]).map((h) => this.normalizeColumnName(String(h)));
    const results: T[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown as (string | number | undefined)[];
      const raw: RawRecord = {};
      headers.forEach((header, idx) => {
        raw[header] = row[idx];
      });
      try {
        const mapped = mapper(raw);
        if (mapped) {
          results.push(mapped);
        }
      } catch (error) {
        console.warn(`警告: 第 ${i + 1} 行解析失败:`, error);
      }
    }
    console.log(`解析完成: ${filePath}, 共 ${data.length - 1} 行, 有效记录 ${results.length} 条`);
    return results;
  }

  /**
   * 更新字段映射
   */
  updateFieldMapping(mapping: Partial<FieldMapping>): void {
    this.fieldMapping = {
      ...this.fieldMapping,
      ...mapping,
      his: { ...this.fieldMapping.his, ...mapping.his },
      insurance: { ...this.fieldMapping.insurance, ...mapping.insurance },
    };
  }

  /**
   * 获取当前字段映射
   */
  getFieldMapping(): FieldMapping {
    return this.fieldMapping;
  }
}

export default ExcelImporter;
