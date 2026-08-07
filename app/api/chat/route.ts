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
    const { messages }: ChatRequest = await request.json();
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

    let response;
    const proxyUrl = 'http://127.0.0.1:7897'; // 固定代理

    if (ProxyAgent && undici) {
      console.log('🔌 强制使用代理:', proxyUrl);
      const agent = new ProxyAgent({
        uri: proxyUrl,
        connect: {
          timeout: 15000,
          rejectUnauthorized: false
        }
      });
      console.log('✅ ProxyAgent 创建成功');

      const undiciFetch = undici.fetch;
      response = await undiciFetch(endpoint, {
        method: 'POST',
        dispatcher: agent,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(requestBody)
      });
    } else {
      console.warn('⚠️ 无 ProxyAgent，尝试直连');
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify(requestBody)
      });
    }

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
