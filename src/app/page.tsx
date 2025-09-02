'use client';

import { useState, useRef } from 'react';
import ThoughtCanvas, { ThoughtCanvasRef } from '@/components/ThoughtCanvas';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [isStreaming, setIsStreaming] = useState(false);
  const [answer, setAnswer] = useState('');
  const [showConnecting, setShowConnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const canvasRef = useRef<ThoughtCanvasRef>(null);
  const connectingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleRun = async () => {
    if (!prompt.trim() || isStreaming) return;
    
    setHasStarted(true);
    setIsStreaming(true);
    setAnswer('');
    setShowConnecting(false);
    
    // Start animation after component has had time to render
    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.reset();
        canvasRef.current.startAnimation();
      }
    }, 100);

    // Show "connecting..." if no delta within 2s (per spec)
    connectingTimeoutRef.current = setTimeout(() => {
      setShowConnecting(true);
    }, 2000);

    try {
      const response = await fetch('/api/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          temperature,
          model: 'claude-3-sonnet'
        }),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const eventData = JSON.parse(line.slice(6));
                  
                  switch (eventData.type) {
                    case 'start':
                      console.log('Stream started:', eventData.data);
                      break;
                      
                    case 'delta':
                      const { text_chunk } = eventData.data;
                      // Clear connecting timeout on first delta
                      if (connectingTimeoutRef.current) {
                        clearTimeout(connectingTimeoutRef.current);
                        setShowConnecting(false);
                      }
                      canvasRef.current?.addDelta(text_chunk, Math.random() * 2 + 0.5);
                      break;
                      
                    case 'end':
                      console.log('Stream ended:', eventData.data);
                      canvasRef.current?.startFlourish();
                      break;
                      
                    case 'answer':
                      // Show answer at flourish end (per spec)
                      setTimeout(() => {
                        setAnswer(eventData.data.answer);
                        setIsStreaming(false);
                      }, 3000);
                      break;
                  }
                } catch (parseError) {
                  console.error('Error parsing SSE data:', parseError);
                }
              }
            }
          }
        } catch (streamError) {
          console.error('Stream processing error:', streamError);
          setIsStreaming(false);
        }
      };

      processStream();

    } catch (error) {
      console.error('Error starting stream:', error);
      setAnswer('Error: Failed to start the thinking process. Please try again.');
      setIsStreaming(false);
    }
  };

  const copyAnswer = () => {
    navigator.clipboard.writeText(answer);
  };

  return (
    <div className="min-h-screen h-screen bg-stone-50 p-6 font-mono text-stone-900 overflow-hidden">
      <h1 className="text-xl font-bold mb-6 border-b border-stone-800 pb-2">PROCESS THOUGHT</h1>
      
      <div className={`transition-all duration-500 ${hasStarted ? (answer ? 'grid grid-cols-3 gap-6 h-[calc(100vh-120px)]' : 'grid grid-cols-2 gap-6 h-[calc(100vh-120px)]') : 'flex items-center justify-center h-[calc(100vh-120px)]'}`}>
        {/* Input Panel - Center when not started, left column when started */}
        <div className={`${hasStarted ? (isStreaming ? 'opacity-50' : '') : 'max-w-md w-full'} transition-opacity duration-300`}>
          <div className={`${hasStarted ? '' : 'text-center'}`}>
            {hasStarted && (
              <label htmlFor="prompt" className={`block text-sm mb-2 uppercase tracking-wide ${isStreaming ? 'text-stone-400' : ''}`}>
                Query
              </label>
            )}
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isStreaming}
              className={`w-full h-32 p-4 border bg-white font-mono text-sm resize-none focus:outline-none transition-colors ${
                isStreaming 
                  ? 'border-stone-400 text-stone-400 cursor-not-allowed' 
                  : 'border-stone-300 focus:border-stone-400'
              }`}
              placeholder={hasStarted ? "Enter your query..." : "Ask or say something..."}
            />
          </div>

          {!isStreaming && (
            <div className={`mt-6 ${hasStarted ? '' : 'text-center'}`}>
              <div className="flex gap-2 items-center justify-center">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs uppercase tracking-wide border border-stone-600 py-1 px-2 hover:bg-stone-800 hover:text-white transition-colors"
                >
                  {showAdvanced ? '▼ Hide Settings' : '▶ Advanced Settings'}
                </button>

                <button
                  onClick={handleRun}
                  disabled={!prompt.trim()}
                  className="text-xs uppercase tracking-wide border border-stone-800 bg-stone-800 text-white py-1 px-2 hover:bg-white hover:text-stone-800 disabled:bg-stone-400 disabled:text-stone-200 disabled:cursor-not-allowed transition-colors"
                >
                  Execute
                </button>
              </div>

              {showAdvanced && (
                <div className="border-t border-stone-300 pt-4 mt-4">
                  <label htmlFor="temperature" className="block text-xs font-semibold mb-2 uppercase tracking-wide">
                    Temperature: {temperature}
                  </label>
                  <input
                    id="temperature"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-stone-800"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center Panel - Canvas (only visible after start) */}
        {hasStarted && (
          <div className="flex flex-col h-full animate-in slide-in-from-right-5 duration-500">
            <h2 className="text-sm mb-2 uppercase tracking-wide">Process</h2>
            <div className="flex-1 bg-white border-2 border-stone-800 relative overflow-hidden">
              <ThoughtCanvas
                ref={canvasRef}
                temperature={temperature}
                className="w-full h-full"
              />
              {!isStreaming && !answer && (
                <div className="absolute inset-0 flex items-center justify-center text-stone-400 pointer-events-none font-mono text-xs uppercase tracking-wide">
                  Ready for Query
                </div>
              )}
              {showConnecting && (
                <div className="absolute bottom-2 left-2 text-xs text-stone-600 bg-stone-100 px-2 py-1 border border-stone-300 font-mono uppercase tracking-wide">
                  Connecting...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right Panel - Answer (only visible after processing is complete) */}
        {answer && (
          <div className="flex flex-col h-full animate-in slide-in-from-right-5 duration-500 delay-150">
            <h2 className="text-sm mb-2 uppercase tracking-wide">Output</h2>
            <div className="flex-1 bg-white border border-stone-300 p-4 overflow-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">{answer}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
