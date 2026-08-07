'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    // 添加用户消息
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    // 添加空的 AI 消息占位符
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
        body: JSON.stringify({ messages: [...messages, userMessage] }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('text/event-stream')) {
        // 处理 SSE 流式响应，保留跨 chunk 的残余数据，避免丢帧
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
                      // 兼容“增量片段”和“完整文本快照”两种后端透传模式
                      if (
                        typeof data.content === 'string' &&
                        data.content.length >= fullText.length &&
                        data.content.startsWith(fullText)
                      ) {
                        fullText = data.content;
                      } else {
                        fullText += data.content;
                      }
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
                  if (
                    typeof data.content === 'string' &&
                    data.content.length >= fullText.length &&
                    data.content.startsWith(fullText)
                  ) {
                    fullText = data.content;
                  } else {
                    fullText += data.content;
                  }
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
        // 处理非流式响应（备用方案）
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
      // 出错时更新消息为错误提示
      setMessages(prev => prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, content: '抱歉，发生了错误，请稍后重试。', isStreaming: false }
          : msg
      ));
    } finally {
      setIsLoading(false);
      // 标记流式结束
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
              disabled={isLoading || !input.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-full px-6 py-3 font-medium transition-colors"
            >
              发送
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
