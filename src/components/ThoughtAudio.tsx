'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';

// Dynamically import Tone.js
type ToneType = typeof import('tone');

export interface ThoughtAudioRef {
  startAudio: () => void;
  addDelta: (text: string) => void;
  startFlourish: () => void;
  stopAudio: () => void;
  reset: () => void;
}

// Linguistic marker patterns
const UNCERTAINTY_MARKERS = /\b(maybe|might|possibly|perhaps|could|seems|appears|uncertain|unsure|probably|likely)\b/i;
const CERTAINTY_MARKERS = /\b(clearly|definitely|must|obviously|certainly|surely|indeed|undoubtedly|always|never)\b/i;
const REVISION_MARKERS = /\b(actually|wait|however|but|although|though|yet|nevertheless|nonetheless|no,|hmm|reconsider|rethink)\b/i;
const METACOGNITIVE_MARKERS = /\b(I think|I believe|I'm not sure|I wonder|let me|I need to|I should)\b/i;
const QUESTION_MARKER = /\?/;

interface ThoughtAudioProps {
  temperature: number;
}

// Musical scales/modes for different cognitive phases
const PHASE_SCALES = {
  questioning: ['C4', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4'], // Lydian (dreamy, exploratory)
  backtracking: ['C4', 'Db4', 'Eb4', 'F4', 'Gb4', 'Ab4', 'Bb4'], // Locrian (unstable)
  reasoning: ['C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4'], // Dorian (balanced)
  concluding: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'], // Ionian/Major (resolving)
  thinking: ['C4', 'D4', 'F4', 'G4', 'A4'], // Pentatonic (ambient)
  idle: ['C4'],
};

const ThoughtAudio = forwardRef<ThoughtAudioRef, ThoughtAudioProps>(
  ({ temperature }, ref) => {
    const [Tone, setTone] = useState<ToneType | null>(null);

    // Load Tone.js dynamically
    useEffect(() => {
      import('tone').then((module) => {
        setTone(module);
      });
    }, []);

    // Audio synthesis refs
    const synthRef = useRef<any | null>(null);
    const ambientSynthRef = useRef<any | null>(null);
    const noiseRef = useRef<any | null>(null);
    const filterRef = useRef<any | null>(null);
    const reverbRef = useRef<any | null>(null);
    const delayRef = useRef<any | null>(null);

    // Temporal analysis tracking
    const lastDeltaTimeRef = useRef<number>(0);
    const deltaTimingsRef = useRef<number[]>([]);
    const tokenVelocityRef = useRef<number>(1);
    const burstCounterRef = useRef<number>(0);

    // Phase detection
    const currentPhaseRef = useRef<string>('idle');
    const phaseIntensityRef = useRef<number>(0);

    // Text analysis tracking
    const currentSentenceRef = useRef<string>('');
    const sentenceLengthsRef = useRef<number[]>([]);
    const recentTextRef = useRef<string>('');
    const repetitionCountRef = useRef<number>(0);
    const pitchDriftRef = useRef<number>(0);
    const psychStateHistoryRef = useRef<string[]>([]); // Track recent states

    // Audio state
    const isPlayingRef = useRef<boolean>(false);
    const scheduledNotesRef = useRef<string[]>([]);

    // Phase detection based on text patterns
    const detectPhase = useCallback((text: string): { phase: string; intensity: number; trigger?: string } => {
      if (!Tone) return { phase: 'idle', intensity: 0 };
      const lower = text.toLowerCase();

      const questionMatch = lower.match(/(what|how|why|could|might|maybe|perhaps|possibly|wonder|consider|seems|appears)/i);
      if (questionMatch) {
        return { phase: 'questioning', intensity: 0.8, trigger: questionMatch[0] };
      }

      const backtrackMatch = lower.match(/(actually|wait|however|but|although|on the other hand|reconsider)/i);
      if (backtrackMatch) {
        return { phase: 'backtracking', intensity: 1.0, trigger: backtrackMatch[0] };
      }

      const reasoningMatch = lower.match(/(because|since|therefore|thus|given|if|then|step|first|second|analyze)/i);
      if (reasoningMatch) {
        return { phase: 'reasoning', intensity: 0.6, trigger: reasoningMatch[0] };
      }

      const conclusionMatch = lower.match(/(clearly|obviously|certainly|must|definitely|conclude|answer|solution|result)/i);
      if (conclusionMatch) {
        return { phase: 'concluding', intensity: 0.9, trigger: conclusionMatch[0] };
      }

      return { phase: 'thinking', intensity: 0.5 };
    }, [Tone]);

    // Initialize audio context and instruments
    useEffect(() => {
      if (!Tone) return;

      const initAudio = async () => {
        // Main melodic synth
        synthRef.current = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.1,
            decay: 0.3,
            sustain: 0.4,
            release: 1.0,
          },
        });

        // Ambient drone synth
        ambientSynthRef.current = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: {
            attack: 2.0,
            decay: 1.0,
            sustain: 0.6,
            release: 3.0,
          },
        });

        // Noise for texture (backtracking phase)
        noiseRef.current = new Tone.Noise('pink');
        filterRef.current = new Tone.Filter({
          type: 'lowpass',
          frequency: 200,
          rolloff: -24,
        });

        // Effects
        reverbRef.current = new Tone.Reverb({
          decay: 4,
          wet: 0.4,
        });

        delayRef.current = new Tone.FeedbackDelay({
          delayTime: 0.25,
          feedback: 0.3,
          wet: 0.3,
        });

        await reverbRef.current.generate();

        // Connect audio graph
        noiseRef.current.connect(filterRef.current);
        filterRef.current.connect(reverbRef.current);

        synthRef.current.connect(delayRef.current);
        delayRef.current.connect(reverbRef.current);

        ambientSynthRef.current.connect(reverbRef.current);

        reverbRef.current.toDestination();
      };

      initAudio();

      return () => {
        // Cleanup
        synthRef.current?.dispose();
        ambientSynthRef.current?.dispose();
        noiseRef.current?.dispose();
        filterRef.current?.dispose();
        reverbRef.current?.dispose();
        delayRef.current?.dispose();
      };
    }, [Tone]);

    // Play a note based on current phase and parameters
    const playNote = useCallback((phase: string, intensity: number, velocity: number) => {
      if (!Tone || !synthRef.current) return;

      const scale = PHASE_SCALES[phase as keyof typeof PHASE_SCALES] || PHASE_SCALES.thinking;
      const noteIndex = Math.floor(Math.random() * scale.length);
      const note = scale[noteIndex];

      // Velocity influences volume and duration
      const volume = -20 + (velocity * 10); // -20dB to -10dB
      const duration = 0.2 + (intensity * 0.3); // 0.2s to 0.5s

      synthRef.current.triggerAttackRelease(note, duration, undefined, Tone.dbToGain(volume));

      scheduledNotesRef.current.push(note);
      if (scheduledNotesRef.current.length > 100) {
        scheduledNotesRef.current.shift();
      }
    }, [Tone]);

    // Update ambient drone based on phase
    const updateAmbient = useCallback((phase: string, intensity: number) => {
      if (!Tone || !ambientSynthRef.current) return;

      const scale = PHASE_SCALES[phase as keyof typeof PHASE_SCALES] || PHASE_SCALES.thinking;
      const rootNote = scale[0];

      // Stop previous note and start new one
      ambientSynthRef.current.triggerRelease();
      setTimeout(() => {
        if (ambientSynthRef.current && isPlayingRef.current) {
          const volume = -30 + (intensity * 10);
          ambientSynthRef.current.volume.value = volume;
          ambientSynthRef.current.triggerAttack(rootNote);
        }
      }, 100);
    }, [Tone]);

    // Update noise filter for backtracking phase
    const updateNoise = useCallback((isBacktracking: boolean, intensity: number) => {
      if (!Tone || !noiseRef.current || !filterRef.current) return;

      if (isBacktracking && isPlayingRef.current) {
        if (noiseRef.current.state !== 'started') {
          noiseRef.current.start();
        }
        filterRef.current.frequency.value = 200 + (intensity * 300);
        noiseRef.current.volume.value = -40 + (intensity * 15);
      } else {
        if (noiseRef.current.state === 'started') {
          noiseRef.current.stop();
        }
      }
    }, [Tone]);

    useImperativeHandle(ref, () => ({
      startAudio: async () => {
        if (!Tone) {
          return;
        }
        await Tone.start();
        isPlayingRef.current = true;

        // Don't start ambient drone - too annoying
      },

      addDelta: (text: string) => {
        if (!Tone || !isPlayingRef.current || !synthRef.current) return;

        // Update tracking
        currentSentenceRef.current += text;
        recentTextRef.current += text;
        if (recentTextRef.current.length > 200) {
          recentTextRef.current = recentTextRef.current.slice(-200); // Keep last 200 chars
        }

        // === LINGUISTIC MARKER DETECTION ===
        const hasUncertainty = UNCERTAINTY_MARKERS.test(text);
        const hasCertainty = CERTAINTY_MARKERS.test(text);
        const hasRevision = REVISION_MARKERS.test(text);
        const hasMetacognition = METACOGNITIVE_MARKERS.test(text);
        const hasQuestion = QUESTION_MARKER.test(text);

        // === STRUCTURAL PATTERN DETECTION ===

        // Sentence completion detection
        const sentenceEnded = /[.!?]\s*$/.test(text);
        let sentenceLength = 0;
        if (sentenceEnded) {
          sentenceLength = currentSentenceRef.current.length;
          sentenceLengthsRef.current.push(sentenceLength);
          if (sentenceLengthsRef.current.length > 10) sentenceLengthsRef.current.shift();
          currentSentenceRef.current = '';
        }

        // Complexity: count commas and nested structures
        const commaCount = (text.match(/,/g) || []).length;
        const complexity = commaCount + (text.match(/\(/g) || []).length;

        // Repetition detection: check if recent text is similar
        const isRepetitive = recentTextRef.current.length > 50 &&
          text.length > 3 &&
          recentTextRef.current.slice(0, -text.length).includes(text.trim());

        // === PSYCHOLOGICAL STATE INFERENCE ===

        let primaryState = 'thinking';
        let intensity = 0.5;

        if (hasRevision) {
          primaryState = 'revision';
          intensity = 0.9;
        } else if (hasUncertainty || hasMetacognition) {
          primaryState = 'uncertain';
          intensity = 0.7;
        } else if (hasCertainty) {
          primaryState = 'certain';
          intensity = 0.8;
        } else if (hasQuestion) {
          primaryState = 'exploring';
          intensity = 0.6;
        } else if (isRepetitive) {
          primaryState = 'working';
          intensity = 0.5;
        }

        // Track state history for flow detection
        psychStateHistoryRef.current.push(primaryState);
        if (psychStateHistoryRef.current.length > 10) psychStateHistoryRef.current.shift();

        const isFlowing = psychStateHistoryRef.current.slice(-5).every(s => s === 'certain');
        const isStruggling = psychStateHistoryRef.current.slice(-5).filter(s => s === 'uncertain' || s === 'revision').length >= 3;

        // === MUSICAL MAPPING ===

        // Map intensity to pitch (0.0-1.0 → C3-C6)
        const baseMidi = 48; // C3
        const midiRange = 36; // 3 octaves
        let midiNote = baseMidi + (intensity * midiRange);

        // Apply complexity to pitch variation
        if (complexity > 0) {
          midiNote += complexity * 2; // Higher complexity = higher pitch
        }

        const frequency = Tone.Frequency(midiNote, 'midi').toFrequency();

        // Map state to chord complexity/dissonance
        const intervals = primaryState === 'revision' || primaryState === 'uncertain'
          ? [0, 1, 6] // Dissonant (minor 2nd, tritone) for uncertainty/revision
          : primaryState === 'certain'
          ? [0, 4, 7] // Major triad for certainty
          : primaryState === 'exploring'
          ? [0, 2, 7, 9] // Add9 for exploration
          : [0, 7]; // Perfect fifth (neutral)

        // Map intensity to volume
        const volume = -30 + (intensity * 15); // -30dB to -15dB range

        // Map state to timbre (filter cutoff)
        if (filterRef.current) {
          const filterFreq = primaryState === 'revision' || primaryState === 'uncertain'
            ? 800 + (intensity * 400) // Brighter for uncertainty
            : primaryState === 'certain'
            ? 400 + (intensity * 200) // Warmer for certainty
            : 600; // Neutral
          filterRef.current.frequency.value = filterFreq;
        }

        // === PLAY NOTES BASED ON PSYCHOLOGICAL STATES ===

        let noteDuration = '8n';

        // REVISION: Descending glissando
        if (hasRevision) {
          const startFreq = frequency * 1.3; // Start higher
          const endFreq = frequency;

          // Create descending pattern
          for (let i = 0; i < 5; i++) {
            const stepFreq = startFreq - ((startFreq - endFreq) / 5) * i;
            setTimeout(() => {
              synthRef.current?.triggerAttackRelease(
                stepFreq,
                '32n',
                undefined,
                Tone.dbToGain(volume - i)
              );
            }, i * 30);
          }
          return;
        }

        // UNCERTAINTY: Wavering tremolo
        if (primaryState === 'uncertain') {
          for (let i = 0; i < 4; i++) {
            setTimeout(() => {
              const detune = (Math.random() - 0.5) * 25; // ±12.5 cents
              synthRef.current?.triggerAttackRelease(
                frequency * Math.pow(2, detune / 1200),
                '16n',
                undefined,
                Tone.dbToGain(volume - 2)
              );
            }, i * 35);
          }

          // Add noise texture
          updateNoise(true, intensity);
          return;
        }

        // QUESTION/EXPLORING: Ascending arpeggio
        if (hasQuestion) {
          [0, 2, 4, 7, 9].forEach((interval, i) => {
            const noteFreq = frequency * Math.pow(2, interval / 12);
            setTimeout(() => {
              synthRef.current?.triggerAttackRelease(
                noteFreq,
                '16n',
                undefined,
                Tone.dbToGain(volume - i)
              );
            }, i * 40);
          });
          return;
        }

        // REPETITIVE/WORKING THROUGH: Repeated note with slight variation
        if (isRepetitive) {
          for (let i = 0; i < 3; i++) {
            setTimeout(() => {
              synthRef.current?.triggerAttackRelease(
                frequency,
                '16n',
                undefined,
                Tone.dbToGain(volume - i * 2)
              );
            }, i * 50);
          }
          return;
        }

        // FLOWING: Smooth legato notes
        if (isFlowing) {
          noteDuration = '4n'; // Longer

          // Clean consonant sound
          synthRef.current.triggerAttackRelease(
            frequency,
            noteDuration,
            undefined,
            Tone.dbToGain(volume - 3)
          );

          // Add perfect fifth for richness
          const fifthFreq = frequency * Math.pow(2, 7 / 12);
          setTimeout(() => {
            synthRef.current?.triggerAttackRelease(
              fifthFreq,
              noteDuration,
              undefined,
              Tone.dbToGain(volume - 8)
            );
          }, 30);

          updateNoise(false, 0);
          return;
        }

        // STRUGGLING: Dissonant cluster
        if (isStruggling) {
          intervals.forEach((interval, i) => {
            const noteFreq = frequency * Math.pow(2, interval / 12);
            setTimeout(() => {
              synthRef.current?.triggerAttackRelease(
                noteFreq,
                noteDuration,
                undefined,
                Tone.dbToGain(volume - (i * 2))
              );
            }, i * 15);
          });

          updateNoise(true, 0.7);
          return;
        }

        // DEFAULT: Standard chord based on state
        if (primaryState === 'certain') {
          // CERTAINTY: Clean major chord
          intervals.forEach((interval, i) => {
            const noteFreq = frequency * Math.pow(2, interval / 12);
            setTimeout(() => {
              synthRef.current?.triggerAttackRelease(
                noteFreq,
                noteDuration,
                undefined,
                Tone.dbToGain(volume - (i * 3))
              );
            }, i * 20);
          });

          updateNoise(false, 0);
        } else {
          // NEUTRAL: Simple notes
          synthRef.current.triggerAttackRelease(
            frequency,
            noteDuration,
            undefined,
            Tone.dbToGain(volume)
          );

          updateNoise(false, 0);
        }
      },

      startFlourish: () => {
        // Final resolving chord
        if (synthRef.current) {
          const scale = PHASE_SCALES.concluding;
          const chord = [scale[0], scale[2], scale[4]]; // Major triad

          chord.forEach((note, i) => {
            setTimeout(() => {
              synthRef.current?.triggerAttackRelease(note, '2n', undefined, 0.5);
            }, i * 100);
          });
        }
      },

      stopAudio: () => {
        isPlayingRef.current = false;

        // Fade out
        if (ambientSynthRef.current) {
          ambientSynthRef.current.triggerRelease();
        }
        if (noiseRef.current && noiseRef.current.state === 'started') {
          noiseRef.current.stop();
        }
      },

      reset: () => {
        // Reset temporal tracking
        lastDeltaTimeRef.current = 0;
        deltaTimingsRef.current = [];
        tokenVelocityRef.current = 1;
        burstCounterRef.current = 0;

        // Reset phase tracking
        currentPhaseRef.current = 'idle';
        phaseIntensityRef.current = 0;

        // Reset text analysis
        currentSentenceRef.current = '';
        sentenceLengthsRef.current = [];
        recentTextRef.current = '';
        repetitionCountRef.current = 0;
        pitchDriftRef.current = 0;
        psychStateHistoryRef.current = [];

        // Stop all audio
        if (ambientSynthRef.current) {
          ambientSynthRef.current.triggerRelease();
        }
        if (noiseRef.current && noiseRef.current.state === 'started') {
          noiseRef.current.stop();
        }

        scheduledNotesRef.current = [];
        isPlayingRef.current = false;
      }
    }), [Tone]);

    return null; // This component doesn't render anything
  }
);

ThoughtAudio.displayName = 'ThoughtAudio';

export default ThoughtAudio;
