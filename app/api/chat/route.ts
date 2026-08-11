import { NextRequest, NextResponse } from 'next/server';
import type { ProxyAgent as UndiciProxyAgent } from 'undici';

// 动态导入 undici 避免类型问题
let undici: typeof import('undici') | null = null;
let ProxyAgent: typeof UndiciProxyAgent | null = null;

try {
  undici = require('undici') as typeof import('undici');
  ProxyAgent = undici.ProxyAgent;
  console.log('✅ undici 加载成功');
} catch (e) {
  console.warn('⚠️ undici 加载失败:', e);
}

interface FrontendMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  messages: FrontendMessage[];
  turnstileToken?: string;
}

// 通用：带代理的 fetch（失败自动回退直连）
async function fetchWithProxy(url: string, options: RequestInit, timeoutMs: number = 15000): Promise<Response> {
  const proxyUrl = 'http://127.0.0.1:7897';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (ProxyAgent && undici) {
      console.log('🔌 使用代理请求:', url);
      const agent = new ProxyAgent({
        uri: proxyUrl,
        connect: {
          timeout: timeoutMs,
          rejectUnauthorized: false
        }
      });

      const undiciFetch = undici.fetch as any;
      const finalOpts: any = {
        ...options,
        dispatcher: agent,
        signal: controller.signal
      };
      const response = await undiciFetch(url, finalOpts);
      clearTimeout(timeoutId);
      console.log('✅ 代理请求成功:', url);
      return response as Response;
    }

    console.warn('⚠️ 无 ProxyAgent，直连请求:', url);
    const directOpts: any = {
      ...options,
      signal: controller.signal
    };
    const response = await fetch(url, directOpts);
    clearTimeout(timeoutId);
    return response;
  } catch (proxyError) {
    clearTimeout(timeoutId);
    console.warn('⚠️ 代理请求失败，回退直连:', url, '错误:', proxyError instanceof Error ? proxyError.message : String(proxyError));
    // 回退直连
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), timeoutMs);
    try {
      const directOpts: any = {
        ...options,
        signal: controller2.signal
      };
      const response = await fetch(url, directOpts);
      clearTimeout(timeoutId2);
      return response;
    } catch (directError) {
      clearTimeout(timeoutId2);
      throw directError;
    }
  }
}

function extractTextFromFullResponse(jsonObj: any): string | null {
  try {
    if (jsonObj.output && Array.isArray(jsonObj.output) && jsonObj.output.length > 0) {
      const firstOutput = jsonObj.output[0];
      if (firstOutput.content && Array.isArray(firstOutput.content) && firstOutput.content.length > 0) {
        const contentItem = firstOutput.content[0];
        if (contentItem.text) {
          return contentItem.text;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  console.log('\n=========================================');
  console.log('🚀 新请求到达 /api/chat');
  try {
    const { messages, turnstileToken }: ChatRequest = await request.json();

    // ============ Turnstile 校验逻辑 开始 ============
    if (!turnstileToken) {
      return NextResponse.json(
        { content: "⚠️ 请完成人机验证后再发起对话" },
        { status: 403 }
      );
    }

    console.log('🔐 正在校验 Turnstile Token...');
    let verifyResult: any = null;
    try {
      const verifyRes = await fetchWithProxy(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: process.env.TURNSTILE_SECRET_KEY!,
            response: turnstileToken,
          }),
        },
        8000 // Turnstile 校验超时 8 秒
      );
      verifyResult = await verifyRes.json();
      console.log('📝 Turnstile 校验结果:', JSON.stringify(verifyResult));
    } catch (verifyError) {
      console.error('❌ Turnstile 校验请求异常:', verifyError);
      // 网络超时/代理问题时，给出明确提示
      return NextResponse.json(
        { content: "⚠️ 人机验证超时，请检查网络后刷新重试" },
        { status: 403 }
      );
    }

    if (!verifyResult || !verifyResult.success) {
      const errorCodes = verifyResult?.['error-codes'] || [];
      console.warn('⚠️ Turnstile 校验失败，错误码:', errorCodes);
      return NextResponse.json(
        { content: "⚠️ 人机验证失效，请刷新页面重新验证" },
        { status: 403 }
      );
    }
    console.log('✅ Turnstile 校验通过');
    // ============ Turnstile 校验逻辑 结束 ============

    console.log('📝 收到前端消息:', JSON.stringify(messages, null, 2));

    const apiKey = process.env.APIMART_API_KEY;
    const baseUrl = process.env.APIMART_BASE_URL || 'https://api.apimart.ai/v1';
    const endpoint = baseUrl + '/responses';

    console.log('🔧 环境变量:');
    console.log('  APIMART_BASE_URL:', baseUrl);
    console.log('  有 API Key?', !!apiKey ? '✅' : '❌');
    console.log('  目标 Endpoint:', endpoint);

    if (!apiKey) {
      console.log('❌ 没有 APIMART_API_KEY');
      return NextResponse.json({
        content: '⚠️ 错误：请在 .env.local 中配置 APIMART_API_KEY'
      }, { status: 200 });
    }

    const requestBody = {
      model: 'gpt-5.2-pro',
      input: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: false
    };

    console.log('📤 发送给 APIMart 的请求:');
    console.log('  URL:', endpoint);
    console.log('  Body:', JSON.stringify(requestBody, null, 2));

    console.log('� 开始调用 APIMart API...');
    const response = await fetchWithProxy(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(requestBody)
    }, 30000); // APIMart 超时 30 秒

    console.log('📥 APIMart 响应状态:', response.status, response.statusText);
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ APIMart 错误响应:', errorText);
      throw new Error('API 请求失败: ' + response.status + ' - ' + errorText);
    }

    console.log('✅ APIMart 响应成功，解析 JSON');
    const jsonResp = await response.json();
    console.log('📦 APIMart 完整响应:', JSON.stringify(jsonResp, null, 2));

    const text = extractTextFromFullResponse(jsonResp);
    if (!text) {
      throw new Error('无法从响应中提取文本');
    }
    console.log('✅ 成功提取文本:', text);

    // 模拟打字机效果，分段逐字返回给前端
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        console.log('🚰 开始模拟打字机效果');
        const chunkSize = 2;
        for (let i = 0; i < text.length; i += chunkSize) {
          const chunk = text.slice(i, i + chunkSize);
          controller.enqueue(
            encoder.encode('data: ' + JSON.stringify({ content: chunk }) + '\n\n')
          );
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        controller.close();
        console.log('✅ 流已结束');
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('❌ API 路由异常:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ 错误详情:', errorMsg);
    return NextResponse.json({
      content: '😔 服务暂时不可用: ' + errorMsg + '\n\n请检查网络连接'
    }, { status: 200 });
  }
}
