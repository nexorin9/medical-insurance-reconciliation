/**
 * CSV 数据导入服务
 * 支持读取 HIS CSV 和医保回传 CSV，返回统一格式的记录数组
 */

import * as Papa from 'papaparse';
import * as fs from 'fs';
import * as path from 'path';
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
 * CSV 导入器类
 * 支持 HIS CSV 和医保回传 CSV 的读取与字段映射
 */
export class CsvImporter {
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
   * 自动识别 CSV 文件的列名
   */
  async detectColumns(filePath: string): Promise<string[]> {
    // 使用同步方法读取列名
    const content = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const result = Papa.parse(content, { header: false });
    if (result.data && result.data.length > 0) {
      const firstRow = result.data[0] as string[];
      return firstRow.map(col => col.trim());
    }
    return [];
  }

  /**
   * 映射 HIS 记录
   */
  private mapHisRecord(raw: RawRecord): HisRecord {
    const m = this.fieldMapping.his;
    const record: HisRecord = {
      patientId: String(raw[m.patientId] || raw['patient_id'] || ''),
      visitDate: String(raw[m.visitDate] || raw['visit_date'] || ''),
      itemCode: String(raw[m.itemCode] || raw['item_code'] || ''),
      itemName: String(raw[m.itemName] || raw['item_name'] || ''),
      quantity: Number(raw[m.quantity] || raw['quantity'] || 0),
      amount: Number(raw[m.amount] || raw['amount'] || 0),
      departmentCode: String(raw[m.departmentCode] || raw['department_code'] || ''),
      departmentName: String(raw[m.departmentName] || raw['department_name'] || ''),
      settlementNo: String(raw[m.settlementNo] || raw['settlement_no'] || ''),
    };

    const diagnosisCode = raw[m.diagnosisCode as string] || raw['diagnosis_code'];
    if (diagnosisCode != null) {
      record.diagnosisCode = String(diagnosisCode);
    }

    const diagnosisName = raw[m.diagnosisName as string] || raw['diagnosis_name'];
    if (diagnosisName != null) {
      record.diagnosisName = String(diagnosisName);
    }

    const settlementTime = raw['settlement_time'];
    if (settlementTime != null) {
      record.settlementTime = String(settlementTime);
    }

    const chargeOperator = raw['charge_operator'];
    if (chargeOperator != null) {
      record.chargeOperator = String(chargeOperator);
    }

    const doctorCode = raw['doctor_code'];
    if (doctorCode != null) {
      record.doctorCode = String(doctorCode);
    }

    return record;
  }

  /**
   * 映射医保记录
   */
  private mapInsuranceRecord(raw: RawRecord): InsuranceRecord {
    const m = this.fieldMapping.insurance;
    const record: InsuranceRecord = {
      patientId: String(raw[m.patientId] || raw['patient_id'] || ''),
      visitDate: String(raw[m.visitDate] || raw['visit_date'] || ''),
      itemCode: String(raw[m.itemCode] || raw['item_code'] || ''),
      amount: Number(raw[m.amount] || raw['amount'] || 0),
      payAmount: Number(raw[m.payAmount] || raw['pay_amount'] || 0),
      settlementNo: String(raw[m.settlementNo] || raw['settlement_no'] || ''),
    };

    const rejectReason = raw[m.rejectReason as string] || raw['reject_reason'];
    if (rejectReason != null) {
      record.rejectReason = String(rejectReason);
    }

    const rejectType = raw['reject_type'];
    if (rejectType != null) {
      record.rejectType = String(rejectType);
    }

    const settlementTime = raw['settlement_time'];
    if (settlementTime != null) {
      record.settlementTime = String(settlementTime);
    }

    const insuranceCardNo = raw['insurance_card_no'];
    if (insuranceCardNo != null) {
      record.insuranceCardNo = String(insuranceCardNo);
    }

    const hospitalCode = raw['hospital_code'];
    if (hospitalCode != null) {
      record.hospitalCode = String(hospitalCode);
    }

    const insuranceAgency = raw['insurance_agency'];
    if (insuranceAgency != null) {
      record.insuranceAgency = String(insuranceAgency);
    }

    return record;
  }

  /**
   * 解析 HIS CSV 文件
   */
  async importHisCsv(filePath: string): Promise<HisRecord[]> {
    return this.parseCsvFile<HisRecord>(filePath, (raw) => this.mapHisRecord(raw));
  }

  /**
   * 解析医保回传 CSV 文件
   */
  async importInsuranceCsv(filePath: string): Promise<InsuranceRecord[]> {
    return this.parseCsvFile<InsuranceRecord>(filePath, (raw) => this.mapInsuranceRecord(raw));
  }

  /**
   * 通用 CSV 解析方法（异步）
   */
  private async parseCsvFile<T>(
    filePath: string,
    mapper: (raw: RawRecord) => T
  ): Promise<T[]> {
    // 使用同步解析方法
    const results: T[] = [];

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const parseResult = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase(),
    });

    if (parseResult.errors.length > 0) {
      console.warn('CSV 解析警告:', parseResult.errors);
    }

    let rowCount = 0;
    (parseResult.data as RawRecord[]).forEach((row) => {
      rowCount++;
      try {
        const mapped = mapper(row);
        if (mapped) {
          results.push(mapped);
        }
      } catch (error) {
        console.warn(`警告: 第 ${rowCount} 行解析失败:`, error);
      }
    });

    console.log(`解析完成: ${filePath}, 共 ${rowCount} 行, 有效记录 ${results.length} 条`);
    return results;
  }

  /**
   * 同步方法：解析 HIS CSV 文件
   */
  importHisCsvSync(filePath: string): HisRecord[] {
    return this.parseCsvFileSync<HisRecord>(filePath, (raw) => this.mapHisRecord(raw));
  }

  /**
   * 同步方法：解析医保回传 CSV 文件
   */
  importInsuranceCsvSync(filePath: string): InsuranceRecord[] {
    return this.parseCsvFileSync<InsuranceRecord>(filePath, (raw) => this.mapInsuranceRecord(raw));
  }

  /**
   * 同步 CSV 解析方法
   */
  private parseCsvFileSync<T>(
    filePath: string,
    mapper: (raw: RawRecord) => T
  ): T[] {
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase(),
    });

    if (parseResult.errors.length > 0) {
      console.warn('CSV 解析警告:', parseResult.errors);
    }

    const results: T[] = [];
    (parseResult.data as RawRecord[]).forEach((row, index) => {
      try {
        const mapped = mapper(row);
        if (mapped) {
          results.push(mapped);
        }
      } catch (error) {
        console.warn(`警告: 第 ${index + 1} 行解析失败:`, error);
      }
    });

    console.log(`解析完成: ${filePath}, 共 ${parseResult.data.length} 行, 有效记录 ${results.length} 条`);
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

export default CsvImporter;
