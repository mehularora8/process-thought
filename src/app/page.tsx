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
                <strong>Process Thought</strong> sonifies Claude's extended thinking using a <strong>multi-layered audio architecture</strong> that detects
                linguistic patterns and triggers 5 simultaneous sound layers. Each detected pattern activates specific layers that blend together,
                creating rich, complex soundscapes that reveal the model's cognitive state.
              </p>

              <div>
                <h3 className="font-bold uppercase tracking-wide text-xs mb-2">5-Layer Architecture</h3>
                <ul className="space-y-1 ml-4 text-xs">
                  <li><strong>BASS</strong> (40-150Hz) - Foundation layer triggered by structure: enumeration, causation, resolution</li>
                  <li><strong>MID</strong> (150-2000Hz) - Main melodic layer, always present, varies by pattern (chords, arpeggios, glissandos)</li>
                  <li><strong>HIGH</strong> (2000-8000Hz) - Shimmer layer for emphasis, comparison, hedging (sparkle and detail)</li>
                  <li><strong>PAD</strong> (sustained chords) - Background atmosphere for uncertainty, resolution, causation</li>
                  <li><strong>TEXTURE</strong> (filtered noise) - Organic grain for uncertainty, revision, negation</li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold uppercase tracking-wide text-xs mb-2">Detected Linguistic Patterns</h3>
                <ul className="space-y-1 ml-4 text-xs">
                  <li><strong>Revision</strong> ("actually", "wait", "however", "but") → Descending pattern on MID + noise TEXTURE</li>
                  <li><strong>Uncertainty</strong> ("maybe", "might", "seems") → Dissonant PAD + noise TEXTURE</li>
                  <li><strong>Certainty</strong> ("clearly", "definitely", "must") → Major chord on MID</li>
                  <li><strong>Questions</strong> ("?") → Ascending arpeggio on MID</li>
                  <li><strong>Enumeration</strong> ("first", "second", "next", "finally") → BASS foundation</li>
                  <li><strong>Emphasis</strong> ("really", "very", "extremely", "crucially") → Bright burst on HIGH layer</li>
                  <li><strong>Negation</strong> ("not", "never", "can't", "won't") → Filtered TEXTURE noise</li>
                  <li><strong>Causation</strong> ("because", "therefore", "thus", "hence") → BASS + consonant PAD</li>
                  <li><strong>Hedging</strong> ("sort of", "kind of", "somewhat", "relatively") → Subtle HIGH shimmer</li>
                  <li><strong>Comparison</strong> ("similar", "different", "whereas", "unlike") → HIGH layer detail</li>
                  <li><strong>Resolution</strong> ("in conclusion", "ultimately", "overall") → BASS + consonant PAD</li>
                </ul>
              </div>

              <div>
                <h3 className="font-bold uppercase tracking-wide text-xs mb-2">How Layers Blend</h3>
                <p className="text-xs">
                  Multiple patterns can trigger simultaneously. For example, text with <em>both</em> "first" (enumeration) and "really" (emphasis)
                  would activate BASS + HIGH + MID layers together. Intensity (0.5-1.0) controls pitch height and volume. Complexity
                  (commas, parentheses) adds pitch variation. All 5 layers route through reverb, delay, and chorus effects for spatial depth.
                </p>
              </div>

              <p className="text-xs text-stone-600 border-t border-stone-300 pt-4 mt-4">
                <strong>Sound ON.</strong> Using Claude 3.7 Sonnet with extended thinking (5000 token budget). Multi-layered synthesis via Tone.js.
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
