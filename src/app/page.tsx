'use client';

import { useState, useRef } from 'react';
import ThoughtAudio, { ThoughtAudioRef } from '@/components/ThoughtAudio';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState(1.0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinking, setThinking] = useState('');
  const [answer, setAnswer] = useState('');
  const [showConnecting, setShowConnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const audioRef = useRef<ThoughtAudioRef>(null);
  const connectingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleRun = async () => {
    if (!prompt.trim() || isStreaming) return;
    
    setHasStarted(true);
    setIsStreaming(true);
    setThinking('');
    setAnswer('');
    setShowConnecting(false);
    
    // Start audio after component has had time to render
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.reset();
        audioRef.current.startAudio();
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
          model: 'claude-3-7-sonnet-20250219'
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
                      break;

                    case 'delta':
                      const { text_chunk } = eventData.data;
                      // Clear connecting timeout on first delta
                      if (connectingTimeoutRef.current) {
                        clearTimeout(connectingTimeoutRef.current);
                        setShowConnecting(false);
                      }
                      // Append to thinking display
                      setThinking(prev => prev + text_chunk);
                      audioRef.current?.addDelta(text_chunk);
                      break;

                    case 'end':
                      audioRef.current?.startFlourish();
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
      <div className="flex items-center justify-between mb-6 border-b border-stone-800 pb-2">
        <h1 className="text-xl font-bold">PROCESS THOUGHT</h1>
        <button
          onClick={() => setShowHelp(true)}
          className="w-6 h-6 border border-stone-800 flex items-center justify-center hover:bg-stone-800 hover:text-white transition-colors text-sm"
          aria-label="Help"
        >
          ?
        </button>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-6" onClick={() => setShowHelp(false)}>
          <div className="bg-white border-2 border-stone-800 max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold uppercase tracking-wide">About Process Thought</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-2xl leading-none hover:text-stone-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 text-sm leading-relaxed">
              <p>
                <strong>Process Thought</strong> sonifies Claude's extended thinking in real-time by detecting linguistic patterns
                that reveal psychological states. Each thinking pattern triggers a distinct musical signature, letting you
                <em>hear</em> the model's uncertainty, revisions, exploration, and flow as it reasons.
              </p>

              <div>
                <h3 className="font-bold uppercase tracking-wide text-xs mb-2">Thinking → Sound Mappings</h3>
                <ul className="space-y-1 ml-4 text-xs">
                  <li><strong>Revision</strong> ("actually", "wait", "but", "however") → <em>Descending glissando</em> - pitch falling through 5 steps</li>
                  <li><strong>Uncertainty</strong> ("maybe", "might", "seems", "I think") → <em>Tremolo</em> - 4 wavering detuned notes + noise</li>
                  <li><strong>Questions</strong> ("?") → <em>Ascending arpeggio</em> - rising pentatonic scale (exploratory)</li>
                  <li><strong>Repetition</strong> (repeated phrases) → <em>Repeated notes</em> - same pitch, fading volume (working through)</li>
                  <li><strong>Flowing</strong> (sustained certainty) → <em>Legato + perfect fifth</em> - smooth connected notes with harmony</li>
                  <li><strong>Struggling</strong> (frequent uncertainty/revision) → <em>Dissonant cluster</em> - harsh minor 2nd + tritone + noise</li>
                  <li><strong>Certainty</strong> ("clearly", "definitely", "must") → <em>Major chord</em> - clean consonant triad (0, 4, 7)</li>
                  <li><strong>Neutral</strong> (no markers) → <em>Simple tone</em> - single note or perfect fifth</li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold uppercase tracking-wide text-xs mb-2">Additional Parameters</h3>
                <ul className="space-y-1 ml-4 text-xs">
                  <li><strong>State intensity</strong> → Pitch range (C3-C6) - more intense states = higher pitch</li>
                  <li><strong>Complexity</strong> (commas, parentheses) → Pitch shift - complex syntax = higher notes</li>
                  <li><strong>Certainty level</strong> → Timbre - uncertain = bright/harsh filter, certain = warm/soft filter</li>
                  <li><strong>State intensity</strong> → Volume - stronger states are louder</li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold uppercase tracking-wide text-xs mb-2">Detection Method</h3>
                <p className="text-xs">
                  Real-time regex pattern matching analyzes each text chunk for linguistic markers and structural features.
                  Recent state history (last 10 chunks) infers higher-level patterns like "flowing" (sustained certainty)
                  and "struggling" (frequent uncertainty). Priority system: revision overrides uncertainty overrides certainty.
                </p>
              </div>

              <p className="text-xs text-stone-600 border-t border-stone-300 pt-4 mt-4">
                <strong>Sound ON.</strong> Using Claude 3.7 Sonnet with extended thinking (5000 token budget).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Audio Engine (invisible) */}
      <ThoughtAudio ref={audioRef} temperature={temperature} />

      <div className={`transition-all duration-500 ${hasStarted ? 'h-[calc(100vh-120px)]' : 'flex items-center justify-center h-[calc(100vh-120px)]'}`}>
        {!hasStarted ? (
          /* Initial centered prompt */
          <div className="max-w-md w-full">
            <div className="text-center">
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-32 p-4 border border-stone-300 bg-white font-mono text-sm resize-none focus:outline-none focus:border-stone-400"
                placeholder="Ask or say something..."
              />
            </div>

            <div className="mt-6 text-center">
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
          </div>
        ) : (
          /* After started: show query, thinking, and answer */
          <div className="h-full flex flex-col gap-4">
            {/* Query - always visible, compact */}
            <div>
              <label htmlFor="prompt-display" className="block text-xs mb-1 uppercase tracking-wide text-stone-600">
                Query
              </label>
              <div className="bg-stone-100 border border-stone-300 p-3 text-sm font-mono">
                {prompt}
              </div>
            </div>

            {/* Thinking box */}
            {(isStreaming || thinking) && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs uppercase tracking-wide text-stone-600">
                    {showConnecting ? 'Connecting...' : 'Thinking'}
                  </label>
                  <span className="text-xs text-stone-400">♪ Listen to the process</span>
                </div>
                <div className="flex-1 bg-white border border-stone-300 p-4 overflow-auto">
                  <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-stone-700">{thinking}</pre>
                </div>
              </div>
            )}

            {/* Answer box - only visible when complete */}
            {answer && (
              <div className="flex-1 flex flex-col min-h-0">
                <label className="text-xs mb-1 uppercase tracking-wide text-stone-600">
                  Output
                </label>
                <div className="flex-1 bg-white border border-stone-300 p-4 overflow-auto">
                  <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">{answer}</pre>
                </div>
              </div>
            )}

            {/* Run again button */}
            {!isStreaming && answer && (
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => {
                    setHasStarted(false);
                    setThinking('');
                    setAnswer('');
                    setPrompt('');
                  }}
                  className="text-xs uppercase tracking-wide border border-stone-800 bg-stone-800 text-white py-1 px-3 hover:bg-white hover:text-stone-800 transition-colors"
                >
                  New Query
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
