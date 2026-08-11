'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [verifyTip, setVerifyTip] = useState(''); // 人机验证提示文案
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // 人机验证拦截
    if (!turnstileToken) {
      setVerifyTip('请先完成下方人机验证');
      return;
    }
    setVerifyTip('');

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    const aiMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true
    }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          turnstileToken,
        }),
      });

      // 后端返回403=人机验证失效，清空token提示重新验证
      if (response.status === 403) {
        setTurnstileToken('');
        setVerifyTip('验证已失效，请重新完成人机验证');
        throw new Error('人机验证过期');
      }
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const dataStr = line.slice(6);
                  try {
                    const data = JSON.parse(dataStr);
                    if (data.content) {
                      fullText += data.content;
                      setMessages(prev => prev.map(msg => 
                        msg.id === aiMessageId 
                          ? { ...msg, content: fullText }
                          : msg
                      ));
                    }
                  } catch {
                    // 忽略解析错误
                  }
                }
              }
            }

            const finalLine = buffer.trim();
            if (finalLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(finalLine.slice(6));
                if (data.content) {
                  fullText += data.content;
                  setMessages(prev => prev.map(msg =>
                    msg.id === aiMessageId
                      ? { ...msg, content: fullText }
                      : msg
                  ));
                }
              } catch {
                // 忽略解析错误
              }
            }
          } finally {
            reader.releaseLock();
          }
        }
      } else {
        const data = await response.json();
        if (data.content) {
          setMessages(prev => prev.map(msg => 
            msg.id === aiMessageId 
              ? { ...msg, content: data.content }
              : msg
          ));
        }
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, content: '抱歉，发生了错误，请稍后重试。', isStreaming: false }
          : msg
      ));
    } finally {
      setIsLoading(false);
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, isStreaming: false }
          : msg
      ));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <header className="p-4 border-b border-gray-700 bg-gray-800">
        <h1 className="text-xl font-bold text-white">AI Chatbot (GPT5.2 Pro by APIMart)</h1>
      </header>
      
      <main className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-20">
              <p className="text-lg">你好！我是基于 APIMart GPT5.2 Pro 的 AI 助手，有什么可以帮助你的吗？</p>
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-100'
                }`}
              >
                <p>{message.content}{message.isStreaming && <span className="animate-pulse">▌</span>}</p>
              </div>
            </div>
          ))}
          {isLoading && messages.filter(m => m.isStreaming).length === 0 && (
            <div className="flex justify-start">
              <div className="bg-gray-700 text-gray-100 rounded-2xl px-4 py-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <footer className="p-4 border-t border-gray-700 bg-gray-800">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded-full px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !turnstileToken}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-full px-6 py-3 font-medium transition-colors"
            >
              发送
            </button>
          </div>
          {/* 提示文案 */}
          {verifyTip && <p className="text-red-400 text-sm mt-2 text-center">{verifyTip}</p>}
          {/* 固定最小高度，防止页面抖动 */}
          <div className="mt-3 flex justify-center min-h-[70px] items-center">
            {turnstileSiteKey ? (
              <Turnstile
                siteKey={turnstileSiteKey}
                onSuccess={(token) => {
                  setTurnstileToken(token);
                  setVerifyTip('');
                }}
                onExpire={() => {
                  setTurnstileToken('');
                  setVerifyTip('验证超时，请重新验证');
                }}
                onError={() => {
                  setTurnstileToken('');
                  setVerifyTip('验证出错，请刷新重试');
                }}
              />
            ) : (
              <div className="text-center py-2 px-4 border-2 border-dashed border-yellow-500 bg-yellow-900/20 rounded-lg">
                <p className="text-yellow-400 text-sm font-semibold">
                  ⚠️ 缺少 NEXT_PUBLIC_TURNSTILE_SITE_KEY 环境变量
                </p>
                <p className="text-gray-300 text-xs mt-1">
                  本地开发：请检查 .env.local 是否配置了该变量
                </p>
                <p className="text-gray-300 text-xs">
                  Vercel 部署：请在项目后台 Settings → Environment Variables 添加
                </p>
              </div>
            )}
          </div>
        </form>
      </footer>
    </div>
  );
}