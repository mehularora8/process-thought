'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';

// Dynamically import Tone.js
type ToneType = typeof import('tone');

export interface MixerControls {
  certainty: { muted: boolean; solo: boolean; volume: number };
  reasoning: { muted: boolean; solo: boolean; volume: number };
  revision: { muted: boolean; solo: boolean; volume: number };
  resolution: { muted: boolean; solo: boolean; volume: number };
}

export interface ThoughtAudioRef {
  startAudio: () => void;
  addDelta: (text: string) => void;
  startFlourish: () => void;
  stopAudio: () => void;
  reset: () => void;
  updateMixerControls: (controls: MixerControls) => void;
  setActiveAxes: (axes: { certainty: boolean; reasoning: boolean; revision: boolean; resolution: boolean }) => void;
  replay: (chunks: string[], speed?: number) => void;
}

// Linguistic marker patterns
const UNCERTAINTY_MARKERS = /\b(maybe|might|possibly|perhaps|could|seems|appears|uncertain|unsure|probably|likely)\b/i;
const CERTAINTY_MARKERS = /\b(clearly|definitely|must|obviously|certainly|surely|indeed|undoubtedly|always|never)\b/i;
const REVISION_MARKERS = /\b(actually|wait|however|but|although|though|yet|nevertheless|nonetheless|no,|hmm|reconsider|rethink)\b/i;
const METACOGNITIVE_MARKERS = /\b(I think|I believe|I'm not sure|I wonder|let me|I need to|I should)\b/i;
const QUESTION_MARKER = /\?/;
const ENUMERATION_MARKERS = /\b(first|second|third|next|then|finally|lastly|step \d+|initially|subsequently|\d+\)|\d+\.)\b/i;
const EMPHASIS_MARKERS = /\b(really|very|extremely|quite|highly|particularly|especially|significantly|crucially|absolutely)\b/i;
const NEGATION_MARKERS = /\b(not|never|won't|can't|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|no\b)\b/i;
const CAUSATION_MARKERS = /\b(because|therefore|thus|hence|consequently|as a result|so|since|given that|due to)\b/i;
const HEDGING_MARKERS = /\b(sort of|kind of|somewhat|relatively|fairly|rather|somewhat|more or less|approximately)\b/i;
const COMPARISON_MARKERS = /\b(similar|different|unlike|whereas|compared to|in contrast|on the other hand|alternatively)\b/i;
const RESOLUTION_MARKERS = /\b(in conclusion|to summarize|ultimately|in the end|overall|in summary|final|conclusion)\b/i;

interface ThoughtAudioProps {
  temperature: number;
  onActiveAxesChange?: (axes: { certainty: boolean; reasoning: boolean; revision: boolean; resolution: boolean }) => void;
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
  ({ temperature, onActiveAxesChange }, ref) => {
    const [Tone, setTone] = useState<ToneType | null>(null);

    // Mixer controls state
    const mixerControlsRef = useRef<MixerControls>({
      certainty: { muted: false, solo: false, volume: 100 },
      reasoning: { muted: false, solo: false, volume: 100 },
      revision: { muted: false, solo: false, volume: 100 },
      resolution: { muted: false, solo: false, volume: 100 },
    });

    // Load Tone.js dynamically
    useEffect(() => {
      import('tone').then((module) => {
        setTone(module);
      });
    }, []);

    // Audio synthesis refs - Multi-layered architecture
    const bassLayerRef = useRef<InstanceType<ToneType['Synth']> | null>(null);
    const midLayerRef = useRef<InstanceType<ToneType['PolySynth']> | null>(null);
    const highLayerRef = useRef<InstanceType<ToneType['Synth']> | null>(null);
    const padLayerRef = useRef<InstanceType<ToneType['PolySynth']> | null>(null);
    const textureNoiseRef = useRef<InstanceType<ToneType['Noise']> | null>(null);

    // Effects
    const filterRef = useRef<InstanceType<ToneType['Filter']> | null>(null);
    const reverbRef = useRef<InstanceType<ToneType['Reverb']> | null>(null);
    const delayRef = useRef<InstanceType<ToneType['FeedbackDelay']> | null>(null);
    const chorusRef = useRef<InstanceType<ToneType['Chorus']> | null>(null);

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

    // Initialize audio context and instruments
    useEffect(() => {
      if (!Tone) return;

      const initAudio = async () => {
        // BASS LAYER: Sub frequencies (40-150Hz) for depth and foundation
        bassLayerRef.current = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: {
            attack: 0.3,
            decay: 0.5,
            sustain: 0.7,
            release: 1.5,
          },
          volume: -15,
        });

        // MID LAYER: Main melodic content (150-2000Hz)
        midLayerRef.current = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.1,
            decay: 0.3,
            sustain: 0.4,
            release: 1.0,
          },
          volume: -10,
        });

        // HIGH LAYER: Shimmer and sparkle (2000-8000Hz)
        highLayerRef.current = new Tone.Synth({
          oscillator: { type: 'sine' },
          envelope: {
            attack: 0.05,
            decay: 0.2,
            sustain: 0.3,
            release: 0.8,
          },
          volume: -20,
        });

        // PAD LAYER: Sustained atmospheric background
        padLayerRef.current = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: {
            attack: 2.0,
            decay: 1.0,
            sustain: 0.6,
            release: 3.0,
          },
          volume: -25,
        });

        // TEXTURE LAYER: Noise and grain for organic feel
        textureNoiseRef.current = new Tone.Noise('pink');
        textureNoiseRef.current.volume.value = -35;

        // Shared filter for texture
        filterRef.current = new Tone.Filter({
          type: 'lowpass',
          frequency: 800,
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

        chorusRef.current = new Tone.Chorus({
          frequency: 1.5,
          delayTime: 3.5,
          depth: 0.7,
          wet: 0.4,
        });

        await reverbRef.current.generate();
        chorusRef.current.start();

        // Connect audio graph
        textureNoiseRef.current.connect(filterRef.current);
        filterRef.current.connect(reverbRef.current);

        bassLayerRef.current.connect(reverbRef.current);

        midLayerRef.current.connect(chorusRef.current);
        chorusRef.current.connect(delayRef.current);
        delayRef.current.connect(reverbRef.current);

        highLayerRef.current.connect(reverbRef.current);
        padLayerRef.current.connect(reverbRef.current);

        reverbRef.current.toDestination();
      };

      initAudio();

      return () => {
        // Cleanup
        bassLayerRef.current?.dispose();
        midLayerRef.current?.dispose();
        highLayerRef.current?.dispose();
        padLayerRef.current?.dispose();
        textureNoiseRef.current?.dispose();
        filterRef.current?.dispose();
        reverbRef.current?.dispose();
        delayRef.current?.dispose();
        chorusRef.current?.dispose();
      };
    }, [Tone]);

    // Determine which cognitive axes are active based on patterns
    const getActiveAxes = useCallback((patterns: {
      hasUncertainty: boolean;
      hasCertainty: boolean;
      hasRevision: boolean;
      hasQuestion: boolean;
      hasEnumeration: boolean;
      hasEmphasis: boolean;
      hasNegation: boolean;
      hasCausation: boolean;
      hasHedging: boolean;
      hasComparison: boolean;
      hasResolution: boolean;
    }) => {
      return {
        certainty: patterns.hasUncertainty || patterns.hasCertainty || patterns.hasHedging,
        reasoning: patterns.hasCausation || patterns.hasEnumeration || patterns.hasComparison,
        revision: patterns.hasRevision || patterns.hasNegation || patterns.hasQuestion,
        resolution: patterns.hasResolution || patterns.hasEmphasis,
      };
    }, []);

    // Calculate gain multiplier based on mixer controls
    const getAxisGainMultiplier = useCallback((axisName: keyof MixerControls): number => {
      const controls = mixerControlsRef.current;
      const axis = controls[axisName];
      const anySolo = Object.values(controls).some((a) => a.solo);

      // If any axis is soloed, mute all non-solo axes
      if (anySolo && !axis.solo) {
        return 0;
      }

      // If this axis is muted, return 0
      if (axis.muted) {
        return 0;
      }

      // Return volume as a multiplier (0-1)
      return axis.volume / 100;
    }, []);

    // Multi-layer sound triggering based on detected patterns
    const triggerLayers = useCallback((
      patterns: {
        hasUncertainty: boolean;
        hasCertainty: boolean;
        hasRevision: boolean;
        hasQuestion: boolean;
        hasEnumeration: boolean;
        hasEmphasis: boolean;
        hasNegation: boolean;
        hasCausation: boolean;
        hasHedging: boolean;
        hasComparison: boolean;
        hasResolution: boolean;
      },
      intensity: number,
      baseFrequency: number
    ) => {
      if (!Tone) return;

      // Determine active axes and notify parent
      const activeAxes = getActiveAxes(patterns);
      if (onActiveAxesChange) {
        onActiveAxesChange(activeAxes);
      }

      // Get gain multipliers for each axis
      const certaintyGain = getAxisGainMultiplier('certainty');
      const reasoningGain = getAxisGainMultiplier('reasoning');
      const revisionGain = getAxisGainMultiplier('revision');
      const resolutionGain = getAxisGainMultiplier('resolution');

      const {
        hasUncertainty, hasCertainty, hasRevision, hasQuestion,
        hasEnumeration, hasEmphasis, hasNegation, hasCausation,
        hasHedging, hasComparison, hasResolution
      } = patterns;

      // BASS LAYER: Triggered by structure/causation (foundation)
      // Controlled by REASONING and RESOLUTION axes
      if (hasCausation || hasEnumeration || hasResolution) {
        const axisGain = hasCausation || hasEnumeration ? reasoningGain : resolutionGain;
        if (axisGain > 0) {
          const bassFreq = baseFrequency * 0.25; // Two octaves down
          const bassVolume = -18 + (intensity * 5);
          bassLayerRef.current?.triggerAttackRelease(
            bassFreq,
            '4n',
            undefined,
            Tone.dbToGain(bassVolume) * axisGain
          );
        }
      }

      // MID LAYER: Main melodic content (always present)
      // Controlled by REVISION and CERTAINTY axes
      if (midLayerRef.current) {
        const midVolume = -12 + (intensity * 8);

        if (hasRevision) {
          // Descending pattern for revision - controlled by REVISION axis
          if (revisionGain > 0) {
            [0, -2, -4, -6, -8].forEach((semitones, i) => {
              const freq = baseFrequency * Math.pow(2, semitones / 12);
              setTimeout(() => {
                midLayerRef.current?.triggerAttackRelease(
                  freq,
                  '32n',
                  undefined,
                  Tone.dbToGain(midVolume - i) * revisionGain
                );
              }, i * 30);
            });
          }
        } else if (hasQuestion) {
          // Ascending arpeggio for questions - controlled by REVISION axis
          if (revisionGain > 0) {
            [0, 2, 4, 7, 9].forEach((semitones, i) => {
              const freq = baseFrequency * Math.pow(2, semitones / 12);
              setTimeout(() => {
                midLayerRef.current?.triggerAttackRelease(
                  freq,
                  '16n',
                  undefined,
                  Tone.dbToGain(midVolume - i) * revisionGain
                );
              }, i * 40);
            });
          }
        } else if (hasCertainty) {
          // Major chord for certainty - controlled by CERTAINTY axis
          if (certaintyGain > 0) {
            [0, 4, 7].forEach((semitones, i) => {
              const freq = baseFrequency * Math.pow(2, semitones / 12);
              setTimeout(() => {
                midLayerRef.current?.triggerAttackRelease(
                  freq,
                  '8n',
                  undefined,
                  Tone.dbToGain(midVolume - (i * 3)) * certaintyGain
                );
              }, i * 20);
            });
          }
        } else {
          // Simple note - play at base volume, no axis control on default
          midLayerRef.current.triggerAttackRelease(
            baseFrequency,
            '8n',
            undefined,
            Tone.dbToGain(midVolume)
          );
        }
      }

      // HIGH LAYER: Sparkle and detail (triggered by emphasis, comparison, hedging)
      // Controlled by RESOLUTION, REASONING, and CERTAINTY axes
      if (hasEmphasis || hasComparison || hasHedging) {
        const axisGain = hasEmphasis ? resolutionGain : hasComparison ? reasoningGain : certaintyGain;
        if (axisGain > 0) {
          const highFreq = baseFrequency * 2.5; // Higher frequencies
          const highVolume = -22 + (intensity * 6);

          if (hasEmphasis) {
            // Bright burst for emphasis
            [0, 5, 7, 12].forEach((semitones, i) => {
              const freq = highFreq * Math.pow(2, semitones / 12);
              setTimeout(() => {
                highLayerRef.current?.triggerAttackRelease(
                  freq,
                  '32n',
                  undefined,
                  Tone.dbToGain(highVolume - i * 2) * axisGain
                );
              }, i * 25);
            });
          } else {
            // Subtle shimmer
            highLayerRef.current?.triggerAttackRelease(
              highFreq,
              '16n',
              undefined,
              Tone.dbToGain(highVolume) * axisGain
            );
          }
        }
      }

      // PAD LAYER: Sustained background (triggered by uncertainty, resolution, causation)
      // Controlled by CERTAINTY, RESOLUTION, and REASONING axes
      if (hasUncertainty || hasResolution || hasCausation) {
        const axisGain = hasUncertainty ? certaintyGain : hasResolution ? resolutionGain : reasoningGain;
        if (axisGain > 0) {
          const padVolume = -28 + (intensity * 5);
          const chord = hasUncertainty
            ? [0, 1, 6] // Dissonant for uncertainty
            : [0, 4, 7]; // Consonant for resolution/causation

          chord.forEach((semitones, i) => {
            const freq = baseFrequency * Math.pow(2, semitones / 12);
            padLayerRef.current?.triggerAttackRelease(
              freq,
              '2n',
              undefined,
              Tone.dbToGain(padVolume - i * 2) * axisGain
            );
          });
        }
      }

      // TEXTURE LAYER: Noise (triggered by uncertainty, revision, negation)
      // Controlled by CERTAINTY and REVISION axes
      if (hasUncertainty || hasRevision || hasNegation) {
        const axisGain = hasUncertainty ? certaintyGain : revisionGain;
        if (axisGain > 0 && textureNoiseRef.current && filterRef.current) {
          const textureVolume = -38 + (intensity * 10);
          const filterFreq = hasRevision ? 1200 : hasNegation ? 600 : 900;

          filterRef.current.frequency.value = filterFreq;
          textureNoiseRef.current.volume.value = textureVolume + Tone.gainToDb(axisGain);

          if (textureNoiseRef.current.state !== 'started') {
            textureNoiseRef.current.start();
          }

          // Stop noise after a short duration
          setTimeout(() => {
            if (textureNoiseRef.current?.state === 'started') {
              textureNoiseRef.current.stop();
            }
          }, 150);
        }
      }
    }, [Tone, getActiveAxes, getAxisGainMultiplier, onActiveAxesChange]);

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
        if (!Tone || !isPlayingRef.current || !midLayerRef.current) return;

        // Update tracking
        currentSentenceRef.current += text;
        recentTextRef.current += text;
        if (recentTextRef.current.length > 200) {
          recentTextRef.current = recentTextRef.current.slice(-200); // Keep last 200 chars
        }

        // === LINGUISTIC MARKER DETECTION (EXPANDED) ===
        const hasUncertainty = UNCERTAINTY_MARKERS.test(text);
        const hasCertainty = CERTAINTY_MARKERS.test(text);
        const hasRevision = REVISION_MARKERS.test(text);
        const hasMetacognition = METACOGNITIVE_MARKERS.test(text);
        const hasQuestion = QUESTION_MARKER.test(text);
        const hasEnumeration = ENUMERATION_MARKERS.test(text);
        const hasEmphasis = EMPHASIS_MARKERS.test(text);
        const hasNegation = NEGATION_MARKERS.test(text);
        const hasCausation = CAUSATION_MARKERS.test(text);
        const hasHedging = HEDGING_MARKERS.test(text);
        const hasComparison = COMPARISON_MARKERS.test(text);
        const hasResolution = RESOLUTION_MARKERS.test(text);

        // === CALCULATE INTENSITY ===
        // Priority-based intensity calculation
        let intensity = 0.5; // Base

        if (hasRevision) {
          intensity = 0.9;
        } else if (hasResolution) {
          intensity = 0.85;
        } else if (hasCertainty) {
          intensity = 0.8;
        } else if (hasUncertainty || hasMetacognition || hasHedging) {
          intensity = 0.7;
        } else if (hasEnumeration) {
          intensity = 0.65;
        } else if (hasQuestion) {
          intensity = 0.6;
        } else if (hasCausation) {
          intensity = 0.6;
        }

        // Boost intensity for emphasis
        if (hasEmphasis) {
          intensity = Math.min(1.0, intensity + 0.15);
        }

        // === CALCULATE BASE FREQUENCY ===
        // Map intensity to pitch (0.0-1.0 → C3-C6)
        const baseMidi = 48; // C3
        const midiRange = 36; // 3 octaves
        let midiNote = baseMidi + (intensity * midiRange);

        // Adjust for complexity (commas, parentheses)
        const commaCount = (text.match(/,/g) || []).length;
        const complexity = commaCount + (text.match(/\(/g) || []).length;
        if (complexity > 0) {
          midiNote += complexity * 2;
        }

        const baseFrequency = Tone.Frequency(midiNote, 'midi').toFrequency();

        // === TRIGGER MULTI-LAYERED SOUND ===
        triggerLayers(
          {
            hasUncertainty,
            hasCertainty,
            hasRevision,
            hasQuestion,
            hasEnumeration,
            hasEmphasis,
            hasNegation,
            hasCausation,
            hasHedging,
            hasComparison,
            hasResolution,
          },
          intensity,
          baseFrequency
        );
      },

      startFlourish: () => {
        // Final resolving chord across all layers
        if (Tone && midLayerRef.current) {
          const scale = PHASE_SCALES.concluding;
          const chord = [scale[0], scale[2], scale[4]]; // Major triad

          // Play flourish on mid and high layers
          chord.forEach((note, i) => {
            setTimeout(() => {
              midLayerRef.current?.triggerAttackRelease(note, '2n', undefined, 0.5);
              if (highLayerRef.current) {
                const highNote = Tone.Frequency(note).transpose(12).toNote();
                highLayerRef.current.triggerAttackRelease(highNote, '2n', undefined, 0.3);
              }
            }, i * 100);
          });

          // Add bass note
          if (bassLayerRef.current) {
            setTimeout(() => {
              bassLayerRef.current?.triggerAttackRelease(scale[0], '1n', undefined, 0.4);
            }, 0);
          }
        }
      },

      stopAudio: () => {
        isPlayingRef.current = false;

        // Stop texture noise if playing
        if (textureNoiseRef.current && textureNoiseRef.current.state === 'started') {
          textureNoiseRef.current.stop();
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
        if (textureNoiseRef.current && textureNoiseRef.current.state === 'started') {
          textureNoiseRef.current.stop();
        }

        scheduledNotesRef.current = [];
        isPlayingRef.current = false;
      },

      updateMixerControls: (controls: MixerControls) => {
        mixerControlsRef.current = controls;
      },

      setActiveAxes: (axes: { certainty: boolean; reasoning: boolean; revision: boolean; resolution: boolean }) => {
        // This is called from parent to update active axes display
        // The actual logic is handled in triggerLayers callback
        if (onActiveAxesChange) {
          onActiveAxesChange(axes);
        }
      },

      replay: async (chunks: string[], speed = 1.0) => {
        if (!Tone) return;

        // Stop any ongoing audio
        if (textureNoiseRef.current && textureNoiseRef.current.state === 'started') {
          textureNoiseRef.current.stop();
        }

        // Start audio context if not already started
        await Tone.start();
        isPlayingRef.current = true;

        // Replay each chunk with a delay based on speed
        const delay = 100 / speed; // Base delay of 100ms adjusted by speed

        for (let i = 0; i < chunks.length; i++) {
          await new Promise(resolve => setTimeout(resolve, delay));

          // Process the chunk through addDelta logic
          const text = chunks[i];
          if (!midLayerRef.current) continue;

          // Update tracking
          currentSentenceRef.current += text;
          recentTextRef.current += text;
          if (recentTextRef.current.length > 200) {
            recentTextRef.current = recentTextRef.current.slice(-200);
          }

          // Detect patterns and trigger audio (reusing existing logic)
          const hasUncertainty = UNCERTAINTY_MARKERS.test(text);
          const hasCertainty = CERTAINTY_MARKERS.test(text);
          const hasRevision = REVISION_MARKERS.test(text);
          const hasMetacognition = METACOGNITIVE_MARKERS.test(text);
          const hasQuestion = QUESTION_MARKER.test(text);
          const hasEnumeration = ENUMERATION_MARKERS.test(text);
          const hasEmphasis = EMPHASIS_MARKERS.test(text);
          const hasNegation = NEGATION_MARKERS.test(text);
          const hasCausation = CAUSATION_MARKERS.test(text);
          const hasHedging = HEDGING_MARKERS.test(text);
          const hasComparison = COMPARISON_MARKERS.test(text);
          const hasResolution = RESOLUTION_MARKERS.test(text);

          // Calculate intensity
          let intensity = 0.5;
          if (hasRevision) {
            intensity = 0.9;
          } else if (hasResolution) {
            intensity = 0.85;
          } else if (hasCertainty) {
            intensity = 0.8;
          } else if (hasUncertainty || hasMetacognition || hasHedging) {
            intensity = 0.7;
          } else if (hasEnumeration) {
            intensity = 0.65;
          } else if (hasQuestion) {
            intensity = 0.6;
          } else if (hasCausation) {
            intensity = 0.6;
          }

          if (hasEmphasis) {
            intensity = Math.min(1.0, intensity + 0.15);
          }

          // Calculate base frequency
          const baseMidi = 48;
          const midiRange = 36;
          let midiNote = baseMidi + (intensity * midiRange);

          const commaCount = (text.match(/,/g) || []).length;
          const complexity = commaCount + (text.match(/\(/g) || []).length;
          if (complexity > 0) {
            midiNote += complexity * 2;
          }

          const baseFrequency = Tone.Frequency(midiNote, 'midi').toFrequency();

          // Trigger audio
          triggerLayers(
            {
              hasUncertainty,
              hasCertainty,
              hasRevision,
              hasQuestion,
              hasEnumeration,
              hasEmphasis,
              hasNegation,
              hasCausation,
              hasHedging,
              hasComparison,
              hasResolution,
            },
            intensity,
            baseFrequency
          );
        }

        // Final flourish
        setTimeout(() => {
          if (midLayerRef.current && Tone) {
            const scale = PHASE_SCALES.concluding;
            const chord = [scale[0], scale[2], scale[4]];

            chord.forEach((note, i) => {
              setTimeout(() => {
                midLayerRef.current?.triggerAttackRelease(note, '2n', undefined, 0.5);
                if (highLayerRef.current) {
                  const highNote = Tone.Frequency(note).transpose(12).toNote();
                  highLayerRef.current.triggerAttackRelease(highNote, '2n', undefined, 0.3);
                }
              }, i * 100);
            });

            if (bassLayerRef.current) {
              setTimeout(() => {
                bassLayerRef.current?.triggerAttackRelease(scale[0], '1n', undefined, 0.4);
              }, 0);
            }
          }
        }, delay * 2);
      }
    }), [Tone, triggerLayers, onActiveAxesChange]);

    return null; // This component doesn't render anything
  }
);

ThoughtAudio.displayName = 'ThoughtAudio';

export default ThoughtAudio;
