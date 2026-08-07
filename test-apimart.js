const { fetch } = require('undici');

async function testAPIMart() {
  console.log('🔧 配置:');
  const apiKey = 'sk-bCvhU6X9FUzkFGcWcYBgF52ImQvVXXeuiN2lyNxhzlkPCY3x';
  const baseUrl = 'https://api.apimart.ai/v1';
  const endpoint = baseUrl + '/responses';

  const requestBody = {
    model: 'gpt-5.2-pro',
    input: [{
      role: 'user',
      content: '你好'
    }],
    stream: false
  };

  console.log('📡 测试 1: 直连 APIMart');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(requestBody)
    });
    console.log('📥 状态码:', response.status);
    const json = await response.json();
    console.log('✅ 成功响应:', JSON.stringify(json, null, 2));
  } catch (e) {
    console.error('❌ 直连失败:', e);
  }

  console.log('\n------------------------------------------\n');
  console.log('📡 测试 2: 使用代理 http://127.0.0.1:7897');
  try {
    const { ProxyAgent } = require('undici');
    const agent = new ProxyAgent({ uri: 'http://127.0.0.1:7897' });
    const response = await fetch(endpoint, {
      method: 'POST',
      dispatcher: agent,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(requestBody)
    });
    console.log('📥 状态码:', response.status);
    const json = await response.json();
    console.log('✅ 成功响应:', JSON.stringify(json, null, 2));
  } catch (e) {
    console.error('❌ 代理失败:', e);
  }
}

testAPIMart();
