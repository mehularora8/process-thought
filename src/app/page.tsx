'use client';

import { useState, useRef, useEffect } from 'react';
import ThoughtAudio, { ThoughtAudioRef } from '@/components/ThoughtAudio';

// Pattern detection regexes (must match ThoughtAudio.tsx)
const UNCERTAINTY_MARKERS = /\b(maybe|might|possibly|perhaps|could|seems|appears|uncertain|unsure|probably|likely)\b/i;
const CERTAINTY_MARKERS = /\b(clearly|definitely|must|obviously|certainly|surely|indeed|undoubtedly|always|never)\b/i;
const REVISION_MARKERS = /\b(actually|wait|however|but|although|though|yet|nevertheless|nonetheless|no,|hmm|reconsider|rethink)\b/i;
const QUESTION_MARKER = /\?/;
const ENUMERATION_MARKERS = /\b(first|second|third|next|then|finally|lastly|step \d+|initially|subsequently|\d+\)|\d+\.)\b/i;
const EMPHASIS_MARKERS = /\b(really|very|extremely|quite|highly|particularly|especially|significantly|crucially|absolutely)\b/i;
const NEGATION_MARKERS = /\b(not|never|won't|can't|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|no\b)\b/i;
const CAUSATION_MARKERS = /\b(because|therefore|thus|hence|consequently|as a result|so|since|given that|due to)\b/i;
const HEDGING_MARKERS = /\b(sort of|kind of|somewhat|relatively|fairly|rather|more or less|approximately)\b/i;
const COMPARISON_MARKERS = /\b(similar|different|unlike|whereas|compared to|in contrast|on the other hand|alternatively)\b/i;
const RESOLUTION_MARKERS = /\b(in conclusion|to summarize|ultimately|in the end|overall|in summary|final|conclusion)\b/i;

interface TextChunk {
  text: string;
  patterns: string[];
}

type PresetMode = 'minimal' | 'standard' | 'maximum';

// Example queries that create interesting sonic textures
const EXAMPLE_QUERIES = [
  {
    title: 'Mathematical Proof',
    prompt: 'Prove that the square root of 2 is irrational.',
    description: 'Lots of logical reasoning and enumeration'
  },
  {
    title: 'Philosophical Dilemma',
    prompt: 'Is it possible to be truly altruistic, or are all actions ultimately self-interested?',
    description: 'Uncertainty, revision, and hedging'
  },
  {
    title: 'Creative Problem',
    prompt: 'Write a short detective story where the detective uses unconventional methods to solve the case.',
    description: 'Narrative structure with enumeration'
  },
  {
    title: 'Complex Explanation',
    prompt: 'Explain how neural networks learn through backpropagation as if I\'m 12 years old.',
    description: 'Causation, comparison, and emphasis'
  },
];

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState(1.0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingChunks, setThinkingChunks] = useState<TextChunk[]>([]);
  const [answer, setAnswer] = useState('');
  const [showConnecting, setShowConnecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [presetMode, setPresetMode] = useState<PresetMode>('standard');
  const audioRef = useRef<ThoughtAudioRef>(null);
  const connectingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Axis active states
  const [axisActive, setAxisActive] = useState({
    certainty: false,
    reasoning: false,
    revision: false,
    resolution: false,
  });

  // Handle active axes changes from audio engine
  const handleActiveAxesChange = (axes: {
    certainty: boolean;
    reasoning: boolean;
    revision: boolean;
    resolution: boolean;
  }) => {
    setAxisActive(axes);
  };

  // Detect patterns in text chunk (filtered by preset mode)
  const detectPatterns = (text: string): string[] => {
    const patterns: string[] = [];

    // Minimal mode: Only core patterns (certainty, revision, question)
    if (presetMode === 'minimal') {
      if (CERTAINTY_MARKERS.test(text)) patterns.push('certainty');
      if (REVISION_MARKERS.test(text)) patterns.push('revision');
      if (QUESTION_MARKER.test(text)) patterns.push('question');
      return patterns;
    }

    // Standard mode: All 11 patterns
    if (UNCERTAINTY_MARKERS.test(text)) patterns.push('uncertainty');
    if (CERTAINTY_MARKERS.test(text)) patterns.push('certainty');
    if (REVISION_MARKERS.test(text)) patterns.push('revision');
    if (QUESTION_MARKER.test(text)) patterns.push('question');
    if (ENUMERATION_MARKERS.test(text)) patterns.push('enumeration');
    if (EMPHASIS_MARKERS.test(text)) patterns.push('emphasis');
    if (NEGATION_MARKERS.test(text)) patterns.push('negation');
    if (CAUSATION_MARKERS.test(text)) patterns.push('causation');
    if (HEDGING_MARKERS.test(text)) patterns.push('hedging');
    if (COMPARISON_MARKERS.test(text)) patterns.push('comparison');
    if (RESOLUTION_MARKERS.test(text)) patterns.push('resolution');

    // Maximum mode: Same patterns but we'll show all matches visually (no filtering)
    return patterns;
  };

  // Get color for pattern type
  const getPatternColor = (pattern: string): string => {
    const colors: Record<string, string> = {
      uncertainty: 'bg-purple-200 text-purple-900',
      certainty: 'bg-green-200 text-green-900',
      revision: 'bg-red-200 text-red-900',
      question: 'bg-blue-200 text-blue-900',
      enumeration: 'bg-yellow-200 text-yellow-900',
      emphasis: 'bg-orange-200 text-orange-900',
      negation: 'bg-gray-300 text-gray-900',
      causation: 'bg-indigo-200 text-indigo-900',
      hedging: 'bg-pink-200 text-pink-900',
      comparison: 'bg-cyan-200 text-cyan-900',
      resolution: 'bg-emerald-200 text-emerald-900',
    };
    return colors[pattern] || '';
  };

  const handleRun = async () => {
    if (!prompt.trim() || isStreaming) return;
    
    setHasStarted(true);
    setIsStreaming(true);
    setThinkingChunks([]);
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
                      // Detect patterns and add chunk
                      const patterns = detectPatterns(text_chunk);
                      setThinkingChunks(prev => [...prev, { text: text_chunk, patterns }]);
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
                <strong>Process Thought</strong> converts Claude&apos;s extended thinking into audio. It detects 11 linguistic patterns
                grouped into 4 cognitive axes and triggers 5 audio layers that blend to create evolving soundscapes.
              </p>

              <div>
                <h3 className="font-bold uppercase tracking-wide text-xs mb-2">How It Works</h3>
                <ul className="space-y-1 ml-4 text-xs">
                  <li>Patterns like &quot;maybe&quot;, &quot;however&quot;, &quot;because&quot; trigger different combinations of audio layers</li>
                  <li>Multiple patterns can fire simultaneously, creating polyphonic textures</li>
                  <li>Intensity controls pitch and volume; complexity adds variation</li>
                  <li>Effects (reverb, delay, chorus) add spatial depth</li>
                </ul>
              </div>

              <p className="text-xs text-stone-600 border-t border-stone-300 pt-4 mt-4">
                Using Claude 4.5 Sonnet with extended thinking. Audio synthesis via Tone.js.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Audio Engine (invisible) */}
      <ThoughtAudio
        ref={audioRef}
        temperature={temperature}
        onActiveAxesChange={handleActiveAxesChange}
      />

      <div className={`transition-all duration-500 ${hasStarted ? 'h-[calc(100vh-120px)]' : 'flex items-center justify-center h-[calc(100vh-120px)]'}`}>
        {!hasStarted ? (
          /* Initial centered prompt */
          <div className="max-w-2xl w-full">
            <div className="text-center">
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full h-32 p-4 border border-stone-300 bg-white font-mono text-sm resize-none focus:outline-none focus:border-stone-400"
                placeholder="Ask or say something..."
              />
            </div>

            {/* Example Queries - Always visible */}
            <div className="mt-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {EXAMPLE_QUERIES.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(example.prompt)}
                    className="text-left p-3 border border-stone-300 hover:border-stone-800 hover:bg-stone-50 transition-colors"
                  >
                    <div className="text-xs font-semibold mb-1">{example.title}</div>
                    <div className="text-xs text-stone-500">{example.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 text-center">
              <div className="flex gap-2 items-center justify-center flex-wrap">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs uppercase tracking-wide border border-stone-600 py-1 px-2 hover:bg-stone-800 hover:text-white transition-colors"
                >
                  {showAdvanced ? '▼ Hide Settings' : '▶ Settings'}
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
                  <div className="mb-4">
                    <label className="block text-xs font-semibold mb-2 uppercase tracking-wide">
                      Preset Mode
                    </label>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => setPresetMode('minimal')}
                        className={`text-xs uppercase tracking-wide border py-1 px-3 transition-colors ${
                          presetMode === 'minimal'
                            ? 'border-stone-800 bg-stone-800 text-white'
                            : 'border-stone-300 hover:border-stone-600'
                        }`}
                      >
                        Minimal
                      </button>
                      <button
                        onClick={() => setPresetMode('standard')}
                        className={`text-xs uppercase tracking-wide border py-1 px-3 transition-colors ${
                          presetMode === 'standard'
                            ? 'border-stone-800 bg-stone-800 text-white'
                            : 'border-stone-300 hover:border-stone-600'
                        }`}
                      >
                        Standard
                      </button>
                      <button
                        onClick={() => setPresetMode('maximum')}
                        className={`text-xs uppercase tracking-wide border py-1 px-3 transition-colors ${
                          presetMode === 'maximum'
                            ? 'border-stone-800 bg-stone-800 text-white'
                            : 'border-stone-300 hover:border-stone-600'
                        }`}
                      >
                        Maximum
                      </button>
                    </div>
                    <p className="text-xs text-stone-500 mt-2">
                      {presetMode === 'minimal' && 'Only core patterns: certainty, revision, question'}
                      {presetMode === 'standard' && 'All 11 linguistic patterns detected'}
                      {presetMode === 'maximum' && 'All patterns with full visual highlighting'}
                    </p>
                  </div>

                  <div>
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
            {(isStreaming || thinkingChunks.length > 0) && (
              <div className="flex-1 flex gap-4 min-h-0">
                {/* Thinking content - left side */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs uppercase tracking-wide text-stone-600">
                      {showConnecting ? 'Connecting...' : 'Thinking'}
                    </label>
                  </div>
                  <div className="flex-1 bg-white border border-stone-300 p-4 overflow-auto">
                    <div className="text-sm font-mono leading-relaxed text-stone-700 whitespace-pre-wrap">
                      {thinkingChunks.map((chunk, i) => {
                        if (chunk.patterns.length === 0) {
                          return <span key={i}>{chunk.text}</span>;
                        }
                        // Use the first (primary) pattern for color
                        const primaryPattern = chunk.patterns[0];
                        return (
                          <span key={i} className={`${getPatternColor(primaryPattern)} px-0.5`} title={chunk.patterns.join(', ')}>
                            {chunk.text}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Legend - right side */}
                <div className="w-80 flex flex-col min-h-0">
                  <div className="flex-1 bg-white border border-stone-300 p-4 overflow-auto">
                    <div className="space-y-4 text-xs">
                      {/* CERTAINTY AXIS */}
                      <div className={`pb-3 border-b border-stone-200 transition-colors ${axisActive.certainty ? 'bg-purple-50' : ''}`}>
                        <div className={`font-bold uppercase tracking-wide mb-2 ${axisActive.certainty ? 'text-purple-700' : 'text-stone-700'}`}>
                          Certainty
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-block px-2 py-0.5 bg-purple-200 text-purple-900">uncertainty</span>
                          <span className="inline-block px-2 py-0.5 bg-green-200 text-green-900">certainty</span>
                          <span className="inline-block px-2 py-0.5 bg-pink-200 text-pink-900">hedging</span>
                        </div>
                      </div>

                      {/* REASONING AXIS */}
                      <div className={`pb-3 border-b border-stone-200 transition-colors ${axisActive.reasoning ? 'bg-blue-50' : ''}`}>
                        <div className={`font-bold uppercase tracking-wide mb-2 ${axisActive.reasoning ? 'text-blue-700' : 'text-stone-700'}`}>
                          Reasoning
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-block px-2 py-0.5 bg-indigo-200 text-indigo-900">causation</span>
                          <span className="inline-block px-2 py-0.5 bg-yellow-200 text-yellow-900">enumeration</span>
                          <span className="inline-block px-2 py-0.5 bg-cyan-200 text-cyan-900">comparison</span>
                        </div>
                      </div>

                      {/* REVISION AXIS */}
                      <div className={`pb-3 border-b border-stone-200 transition-colors ${axisActive.revision ? 'bg-red-50' : ''}`}>
                        <div className={`font-bold uppercase tracking-wide mb-2 ${axisActive.revision ? 'text-red-700' : 'text-stone-700'}`}>
                          Revision
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-block px-2 py-0.5 bg-red-200 text-red-900">revision</span>
                          <span className="inline-block px-2 py-0.5 bg-gray-300 text-gray-900">negation</span>
                          <span className="inline-block px-2 py-0.5 bg-blue-200 text-blue-900">question</span>
                        </div>
                      </div>

                      {/* RESOLUTION AXIS */}
                      <div className={`transition-colors ${axisActive.resolution ? 'bg-green-50' : ''}`}>
                        <div className={`font-bold uppercase tracking-wide mb-2 ${axisActive.resolution ? 'text-green-700' : 'text-stone-700'}`}>
                          Resolution
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className="inline-block px-2 py-0.5 bg-emerald-200 text-emerald-900">resolution</span>
                          <span className="inline-block px-2 py-0.5 bg-orange-200 text-orange-900">emphasis</span>
                        </div>
                      </div>
                    </div>
                  </div>
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
                    if (audioRef.current && thinkingChunks.length > 0) {
                      const textChunks = thinkingChunks.map(chunk => chunk.text);
                      audioRef.current.replay(textChunks, 2.0);
                    }
                  }}
                  className="text-xs uppercase tracking-wide border border-stone-800 py-1 px-3 hover:bg-stone-800 hover:text-white transition-colors"
                >
                  🔊 Replay Audio
                </button>
                <button
                  onClick={() => {
                    setHasStarted(false);
                    setThinkingChunks([]);
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
