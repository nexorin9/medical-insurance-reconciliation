/**
 * LLM API 客户端
 * 支持 OpenAI 兼容接口
 *
 * 功能说明：
 * - 通过 OPENAI_API_KEY 和 OPENAI_BASE_URL 环境变量配置
 * - 实现 call(prompt) 方法
 * - 处理 API 错误（超时、重试逻辑、最多3次）
 * - 流式和非流式输出兼容
 */

import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { LLMClient } from './semanticCluster';

// 配置接口
export interface LLMClientConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
  timeout?: number;
}

// API 响应接口
interface OpenAIErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

// API 响应接口（Chat Completions）
interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * OpenAI 兼容的 LLM API 客户端
 */
export class OpenAILLMClient implements LLMClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxRetries: number;
  private timeout: number;

  constructor(config: LLMClientConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.baseUrl = config.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    this.model = config.model ?? 'gpt-3.5-turbo';
    this.maxRetries = config.maxRetries ?? 3;
    this.timeout = config.timeout ?? 60000; // 默认 60 秒超时
  }

  /**
   * 检查 API Key 是否已配置
   */
  hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * 设置 Base URL
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  /**
   * 构建请求配置
   */
  private buildRequestConfig(): AxiosRequestConfig {
    return {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      timeout: this.timeout,
    };
  }

  /**
   * 执行带重试的请求
   */
  private async requestWithRetry<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    retries: number = this.maxRetries
  ): Promise<AxiosResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as Error;

        // 如果已达到最大重试次数，不再重试
        if (attempt >= retries) {
          break;
        }

        // 判断错误类型，决定是否重试
        if (this.isRetryableError(error as Error)) {
          // 指数退避等待
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`LLM API 请求失败 (尝试 ${attempt + 1}/${retries + 1}), ${delay}ms 后重试...`);
          await this.sleep(delay);
        } else {
          // 不可重试的错误，直接抛出
          throw error;
        }
      }
    }

    throw lastError ?? new Error('LLM API 请求失败');
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: Error): boolean {
    if (error instanceof AxiosError) {
      // 网络错误、超时、5xx 错误可重试
      if (error.code === 'ECONNABORTED' || // 超时
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND' ||
          error.code === 'ECONNREFUSED' ||
          error.code === 'NETWORK_ERROR') {
        return true;
      }

      // 5xx 服务器错误可重试
      if (error.response?.status && error.response.status >= 500) {
        return true;
      }

      // 429 Rate Limit 可重试
      if (error.response?.status === 429) {
        return true;
      }
    }

    return false;
  }

  /**
   * 睡眠工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 调用 LLM
   * @param prompt 提示词
   * @returns LLM 响应文本
   */
  async call(prompt: string): Promise<string> {
    if (!this.hasApiKey()) {
      throw new Error('OPENAI_API_KEY 未配置，请检查 .env 文件或在环境变量中设置');
    }

    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // 使用较低的 temperature 以获得更确定性的输出
    };

    try {
      const response = await this.requestWithRetry<ChatCompletionResponse>(
        () => axios.post<ChatCompletionResponse>(endpoint, requestBody, this.buildRequestConfig())
      );

      const data = response.data;

      // 检查 API 错误
      if (data.error) {
        throw new Error(`LLM API 错误: ${data.error.message ?? '未知错误'}`);
      }

      // 提取响应内容
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('LLM API 响应格式异常：未找到有效内容');
      }

      return content;
    } catch (error) {
      if (error instanceof AxiosError) {
        const axiosError = error as AxiosError<OpenAIErrorResponse>;

        // 处理 API 错误响应
        if (axiosError.response?.data?.error) {
          const apiError = axiosError.response.data.error;
          throw new Error(`LLM API 调用失败: ${apiError.message ?? '未知错误'}`);
        }

        // 处理网络错误
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
          throw new Error(`LLM API 请求超时 (${this.timeout}ms)`);
        }

        if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED') {
          throw new Error(`LLM API 无法连接: 请检查 OPENAI_BASE_URL 配置是否正确 (当前: ${this.baseUrl})`);
        }

        // 其他 Axios 错误
        throw new Error(`LLM API 请求失败: ${axiosError.message}`);
      }

      // 重新抛出非 Axios 错误
      throw error;
    }
  }

  /**
   * 调用 LLM（流式模式）
   * @param prompt 提示词
   * @param onChunk 每次接收到的文本片段
   */
  async callStream(
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (!this.hasApiKey()) {
      throw new Error('OPENAI_API_KEY 未配置，请检查 .env 文件或在环境变量中设置');
    }

    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const requestBody = {
      model: this.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      stream: true, // 启用流式输出
    };

    try {
      const response = await axios.post(
        endpoint,
        requestBody,
        {
          ...this.buildRequestConfig(),
          responseType: 'stream',
          timeout: this.timeout,
        }
      );

      return new Promise((resolve, reject) => {
        let buffer = '';

        response.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();

              // 处理流结束标志
              if (data === '[DONE]') {
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;

                if (content) {
                  buffer += content;
                  onChunk(content);
                }
              } catch (e) {
                // 忽略解析错误，继续处理下一行
              }
            }
          }
        });

        response.data.on('end', () => {
          resolve();
        });

        response.data.on('error', (err: Error) => {
          reject(new Error(`流式响应错误: ${err.message}`));
        });
      });
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(`LLM API 流式请求失败: ${error.message}`);
      }
      throw error;
    }
  }
}

/**
 * Mock LLM 客户端（用于测试或无 API Key 场景）
 */
export class MockLLMClient implements LLMClient {
  private mockResponses: Map<string, string>;
  private delay: number;

  constructor(delay: number = 500) {
    this.mockResponses = new Map();
    this.delay = delay;
  }

  /**
   * 添加预设的 Mock 响应
   */
  addMockResponse(prompt: string, response: string): void {
    this.mockResponses.set(prompt, response);
  }

  /**
   * 调用 Mock LLM
   */
  async call(prompt: string): Promise<string> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, this.delay));

    // 检查是否有预设响应
    for (const [key, value] of this.mockResponses) {
      if (prompt.includes(key)) {
        return value;
      }
    }

    // 默认 Mock 响应
    return JSON.stringify({
      category: '其他',
      attribution: 'Mock 模式：未进行真实 LLM 调用',
      suggestedAction: '请配置 OPENAI_API_KEY 以启用真实 LLM 调用',
    });
  }
}

/**
 * 创建 LLM 客户端工厂函数
 * 根据配置自动选择真实客户端或 Mock 客户端
 */
export function createLLMClient(config?: LLMClientConfig): LLMClient {
  const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY ?? '';

  if (!apiKey) {
    console.warn('警告: OPENAI_API_KEY 未配置，将使用 Mock 模式');
    return new MockLLMClient();
  }

  return new OpenAILLMClient(config);
}

export default OpenAILLMClient;
