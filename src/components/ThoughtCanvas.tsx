'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  opacity: number;
  phase?: string; // Track which phase created this particle
  energy?: number; // Energy level for special behaviors
  hue?: number; // Color hue
  saturation?: number; // Color saturation
}

// Color palettes for different phases
const PHASE_COLORS = {
  questioning: { hue: 280, saturation: 70 }, // Purple - exploration
  backtracking: { hue: 0, saturation: 80 }, // Red - disruption
  reasoning: { hue: 200, saturation: 60 }, // Blue - logic
  concluding: { hue: 120, saturation: 70 }, // Green - resolution
  thinking: { hue: 40, saturation: 50 }, // Orange - default
  idle: { hue: 0, saturation: 0 }, // Grayscale
};

interface FlowField {
  width: number;
  height: number;
  resolution: number;
  field: { angle: number; strength: number }[][];
}

export interface ThoughtCanvasRef {
  startAnimation: () => void;
  addDelta: (text: string, tokenRate?: number) => void;
  startFlourish: () => void;
  stopAnimation: () => void;
  reset: () => void;
}

interface ThoughtCanvasProps {
  temperature: number;
  className?: string;
}

const ThoughtCanvas = forwardRef<ThoughtCanvasRef, ThoughtCanvasProps>(
  ({ temperature, className }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | undefined>(undefined);
    const particlesRef = useRef<Particle[]>([]);
    const flowFieldRef = useRef<FlowField | null>(null);
    const lastTimeRef = useRef<number>(0);
    const isAnimatingRef = useRef<boolean>(false);
    const flourishStartRef = useRef<number>(0);
    const isFlourishingRef = useRef<boolean>(false);
    const baseSpeedRef = useRef<number>(1);
    const turbulenceRef = useRef<number>(0);
    const zoomRef = useRef<number>(0);
    const animationStartRef = useRef<number>(0);

    // Temporal analysis tracking
    const lastDeltaTimeRef = useRef<number>(0);
    const deltaTimingsRef = useRef<number[]>([]);
    const tokenVelocityRef = useRef<number>(1);
    const burstCounterRef = useRef<number>(0);

    // Phase detection
    const currentPhaseRef = useRef<string>('idle');
    const phaseIntensityRef = useRef<number>(0);
    const phaseTransitionTimeRef = useRef<number>(0);
    
    const prefersReducedMotion = typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Phase detection based on text patterns
    const detectPhase = useCallback((text: string): { phase: string; intensity: number; trigger?: string } => {
      const lower = text.toLowerCase();

      // Uncertainty/Question phase - exploring, uncertain
      const questionMatch = lower.match(/(what|how|why|could|might|maybe|perhaps|possibly|wonder|consider|seems|appears)/i);
      if (questionMatch) {
        return { phase: 'questioning', intensity: 0.8, trigger: questionMatch[0] };
      }

      // Backtracking - reconsidering, reversing
      const backtrackMatch = lower.match(/(actually|wait|however|but|although|on the other hand|reconsider)/i);
      if (backtrackMatch) {
        return { phase: 'backtracking', intensity: 1.0, trigger: backtrackMatch[0] };
      }

      // Analysis/Reasoning - working through logic
      const reasoningMatch = lower.match(/(because|since|therefore|thus|given|if|then|step|first|second|analyze)/i);
      if (reasoningMatch) {
        return { phase: 'reasoning', intensity: 0.6, trigger: reasoningMatch[0] };
      }

      // Certainty/Conclusion - arriving at answer
      const conclusionMatch = lower.match(/(clearly|obviously|certainly|must|definitely|conclude|answer|solution|result)/i);
      if (conclusionMatch) {
        return { phase: 'concluding', intensity: 0.9, trigger: conclusionMatch[0] };
      }

      // Default: thinking phase
      return { phase: 'thinking', intensity: 0.5 };
    }, []);

    const generateFlowField = useCallback((width: number, height: number, phase: string = 'idle') => {
      const resolution = 20;
      const cols = Math.ceil(width / resolution);
      const rows = Math.ceil(height / resolution);

      const field: { angle: number; strength: number }[][] = [];
      const centerX = cols / 2;
      const centerY = rows / 2;

      for (let y = 0; y < rows; y++) {
        field[y] = [];
        for (let x = 0; x < cols; x++) {
          let angle: number;
          let strength: number;

          switch (phase) {
            case 'questioning': {
              // Circular, exploring patterns - vortices
              const dx = x - centerX;
              const dy = y - centerY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              angle = Math.atan2(dy, dx) + Math.PI / 2 + Math.sin(dist * 0.3) * Math.PI;
              strength = 0.5 + Math.sin(dist * 0.2) * 0.5;
              break;
            }

            case 'backtracking': {
              // Reverse/turbulent flow - chaotic reversals
              const noise1 = Math.sin(x * 0.3) * Math.cos(y * 0.3);
              const noise2 = Math.cos(x * 0.2) * Math.sin(y * 0.2);
              angle = (noise1 * noise2) * Math.PI * 4;
              strength = 0.8 + Math.abs(noise1) * 0.4;
              break;
            }

            case 'reasoning': {
              // Organized, layered flow - structured thinking
              const layer = Math.floor(y / (rows / 5));
              angle = (layer % 2 === 0 ? 0 : Math.PI) + Math.sin(x * 0.1) * 0.3;
              strength = 0.6 + Math.cos(y * 0.1) * 0.2;
              break;
            }

            case 'concluding': {
              // Converging patterns - everything flows to center
              const dx = x - centerX;
              const dy = y - centerY;
              angle = Math.atan2(-dy, -dx); // Point toward center
              const dist = Math.sqrt(dx * dx + dy * dy);
              strength = 0.4 + (1 - Math.min(dist / Math.max(centerX, centerY), 1)) * 0.6;
              break;
            }

            case 'thinking':
            default: {
              // Smooth, flowing patterns - baseline
              angle = (Math.sin(x * 0.1) * Math.cos(y * 0.1)) * Math.PI * 2;
              strength = 0.5 + (Math.sin(x * 0.05) * Math.cos(y * 0.05)) * 0.5;
              break;
            }
          }

          field[y][x] = { angle, strength };
        }
      }

      return { width, height, resolution, field };
    }, []);

    const createParticle = useCallback((x?: number, y?: number, phase?: string, energy?: number): Particle => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 100, opacity: 0 };
      }

      const currentPhase = phase || currentPhaseRef.current;
      const particleEnergy = energy || phaseIntensityRef.current;

      // Get color for this phase
      const phaseColor = PHASE_COLORS[currentPhase as keyof typeof PHASE_COLORS] || PHASE_COLORS.thinking;
      const hueVariation = (Math.random() - 0.5) * 30; // ±15 degree variation

      return {
        x: x ?? Math.random() * canvas.width,
        y: y ?? Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 0,
        maxLife: 60 + Math.random() * 120,
        opacity: 0.8 + Math.random() * 0.2,
        phase: currentPhase,
        energy: particleEnergy,
        hue: phaseColor.hue + hueVariation,
        saturation: phaseColor.saturation + (Math.random() - 0.5) * 20
      };
    }, []);

    const updateParticle = useCallback((particle: Particle, dt: number) => {
      const canvas = canvasRef.current;
      const flowField = flowFieldRef.current;
      if (!canvas || !flowField) return;

      const col = Math.floor(particle.x / flowField.resolution);
      const row = Math.floor(particle.y / flowField.resolution);
      
      if (row >= 0 && row < flowField.field.length && 
          col >= 0 && col < flowField.field[0].length) {
        const cell = flowField.field[row][col];
        const force = cell.strength * 0.1;
        
        particle.vx += Math.cos(cell.angle) * force * dt;
        particle.vy += Math.sin(cell.angle) * force * dt;
      }

      const turbulence = turbulenceRef.current;
      particle.vx += (Math.random() - 0.5) * turbulence * dt;
      particle.vy += (Math.random() - 0.5) * turbulence * dt;

      const damping = 0.98;
      particle.vx *= damping;
      particle.vy *= damping;

      const speed = baseSpeedRef.current * (prefersReducedMotion ? 0.5 : 1);
      particle.x += particle.vx * speed * dt;
      particle.y += particle.vy * speed * dt;

      if (particle.x < 0) particle.x = canvas.width;
      if (particle.x > canvas.width) particle.x = 0;
      if (particle.y < 0) particle.y = canvas.height;
      if (particle.y > canvas.height) particle.y = 0;

      particle.life += dt;
      particle.opacity = Math.max(0, 1 - particle.life / particle.maxLife);
    }, [prefersReducedMotion]);

    const drawParticle = useCallback((ctx: CanvasRenderingContext2D, particle: Particle) => {
      const alpha = particle.opacity;
      if (alpha <= 0) return;

      ctx.save();

      // Calculate velocity-based brightness
      const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
      const velocityBrightness = 40 + Math.min(speed * 5, 40); // 40-80% brightness based on speed

      // Get particle color
      const hue = particle.hue || 0;
      const saturation = particle.saturation || 0;

      // Different visual styles per phase
      switch (particle.phase) {
        case 'questioning': {
          // Glowing circular particles with halos
          ctx.globalAlpha = alpha * 0.3;
          const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, 8);
          gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${velocityBrightness + 20}%, 1)`);
          gradient.addColorStop(0.5, `hsla(${hue}, ${saturation}%, ${velocityBrightness}%, 0.6)`);
          gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${velocityBrightness - 10}%, 0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, 8 * (particle.energy || 1), 0, Math.PI * 2);
          ctx.fill();

          // Bright center dot
          ctx.globalAlpha = alpha;
          ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${Math.min(velocityBrightness + 30, 95)}%)`;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'backtracking': {
          // Jagged, glitchy strokes with chromatic aberration effect
          const jitter = 3;
          ctx.lineWidth = 2;
          ctx.lineCap = 'square';

          // Red channel
          ctx.globalAlpha = alpha * 0.6;
          ctx.strokeStyle = `hsl(${hue - 10}, ${saturation + 20}%, ${velocityBrightness}%)`;
          ctx.beginPath();
          ctx.moveTo(particle.x + (Math.random() - 0.5) * jitter - 1, particle.y);
          ctx.lineTo(
            particle.x - particle.vx * 4 + (Math.random() - 0.5) * jitter - 1,
            particle.y - particle.vy * 4
          );
          ctx.stroke();

          // Main stroke
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = `hsl(${hue}, ${saturation}%, ${velocityBrightness}%)`;
          ctx.beginPath();
          ctx.moveTo(particle.x + (Math.random() - 0.5) * jitter, particle.y + (Math.random() - 0.5) * jitter);
          ctx.lineTo(
            particle.x - particle.vx * 4 + (Math.random() - 0.5) * jitter,
            particle.y - particle.vy * 4 + (Math.random() - 0.5) * jitter
          );
          ctx.stroke();

          // Blue channel
          ctx.globalAlpha = alpha * 0.6;
          ctx.strokeStyle = `hsl(${hue + 10}, ${saturation + 20}%, ${velocityBrightness}%)`;
          ctx.beginPath();
          ctx.moveTo(particle.x + (Math.random() - 0.5) * jitter + 1, particle.y);
          ctx.lineTo(
            particle.x - particle.vx * 4 + (Math.random() - 0.5) * jitter + 1,
            particle.y - particle.vy * 4
          );
          ctx.stroke();
          break;
        }

        case 'reasoning': {
          // Clean gradient trails
          const trailLength = 12;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';

          // Create gradient along the trail
          const gradient = ctx.createLinearGradient(
            particle.x, particle.y,
            particle.x - particle.vx * trailLength, particle.y - particle.vy * trailLength
          );
          gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${velocityBrightness + 15}%)`);
          gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${velocityBrightness - 10}%, 0.3)`);

          ctx.strokeStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(
            particle.x - particle.vx * trailLength,
            particle.y - particle.vy * trailLength
          );
          ctx.stroke();

          // Add a subtle glow
          ctx.globalAlpha = alpha * 0.2;
          ctx.shadowBlur = 5;
          ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${velocityBrightness}%)`;
          ctx.stroke();
          ctx.shadowBlur = 0;
          break;
        }

        case 'concluding': {
          // Bold glowing strokes with intense trails
          const trailLength = 10;
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';

          // Outer glow
          ctx.globalAlpha = alpha * 0.4;
          ctx.strokeStyle = `hsl(${hue}, ${saturation}%, ${velocityBrightness + 20}%)`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(
            particle.x - particle.vx * trailLength,
            particle.y - particle.vy * trailLength
          );
          ctx.stroke();

          // Main stroke
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = `hsl(${hue}, ${saturation}%, ${velocityBrightness}%)`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(
            particle.x - particle.vx * trailLength,
            particle.y - particle.vy * trailLength
          );
          ctx.stroke();

          // Bright head
          ctx.fillStyle = `hsl(${hue}, ${saturation + 10}%, ${Math.min(velocityBrightness + 25, 90)}%)`;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'thinking':
        default: {
          // Soft flowing trails with subtle gradients
          const trailLength = 8;
          ctx.globalAlpha = alpha * 0.8;
          ctx.lineWidth = 1.2;
          ctx.lineCap = 'round';

          const gradient = ctx.createLinearGradient(
            particle.x, particle.y,
            particle.x - particle.vx * trailLength, particle.y - particle.vy * trailLength
          );
          gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${velocityBrightness}%)`);
          gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${velocityBrightness - 15}%, 0.2)`);

          ctx.strokeStyle = gradient;
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(
            particle.x - particle.vx * trailLength,
            particle.y - particle.vy * trailLength
          );
          ctx.stroke();
          break;
        }
      }

      ctx.restore();
    }, []);

    const animate = useCallback((currentTime: number) => {
      if (!isAnimatingRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const dt = Math.min((currentTime - lastTimeRef.current) / 16.67, 2);
      lastTimeRef.current = currentTime;

      // Calculate zoom-in effect (0 to 1 over 2 seconds)
      const timeSinceStart = (currentTime - animationStartRef.current) / 1000;
      const zoomDuration = prefersReducedMotion ? 1 : 2;
      zoomRef.current = Math.min(1, timeSinceStart / zoomDuration);
      const easeOutZoom = 1 - Math.pow(1 - zoomRef.current, 3); // Ease-out curve

      const rect = canvas.getBoundingClientRect();

      // Clear canvas with phase-based background tint
      ctx.save();
      const phaseColor = PHASE_COLORS[currentPhaseRef.current as keyof typeof PHASE_COLORS] || PHASE_COLORS.thinking;
      const bgTint = `hsla(${phaseColor.hue}, ${phaseColor.saturation * 0.3}%, 98%, 0.08)`;
      ctx.fillStyle = bgTint;
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      // Apply zoom transformation
      const scale = 0.1 + (0.9 * easeOutZoom); // Scale from 0.1 to 1.0
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      ctx.translate(centerX, centerY);
      ctx.scale(scale, scale);
      ctx.translate(-centerX, -centerY);

      const particles = particlesRef.current;
      
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        updateParticle(particle, dt);
        drawParticle(ctx, particle);

        if (particle.life >= particle.maxLife) {
          particles.splice(i, 1);
        }
      }

      if (isFlourishingRef.current) {
        const flourishTime = (currentTime - flourishStartRef.current) / 1000;
        const flourishDuration = prefersReducedMotion ? 1.2 : 3.0;
        
        if (flourishTime < flourishDuration) {
          const intensity = Math.sin(flourishTime * Math.PI / flourishDuration) * 2;
          baseSpeedRef.current = 1 + intensity;
          turbulenceRef.current = temperature * intensity;

          if (Math.random() < 0.3) {
            particles.push(createParticle());
          }
        } else {
          isFlourishingRef.current = false;
          baseSpeedRef.current = 1;
          turbulenceRef.current = 0;
        }
      }

      ctx.restore(); // Restore canvas state after zoom transformation

      animationRef.current = requestAnimationFrame(animate);
    }, [updateParticle, drawParticle, createParticle, temperature, prefersReducedMotion]);

    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, rect.width, rect.height);
      }

      flowFieldRef.current = generateFlowField(canvas.width / dpr, canvas.height / dpr, currentPhaseRef.current);
    }, [generateFlowField]);

    useEffect(() => {
      const handleResize = () => {
        resizeCanvas();
      };

      window.addEventListener('resize', handleResize);
      resizeCanvas();

      return () => {
        window.removeEventListener('resize', handleResize);
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }, [resizeCanvas]);

    useImperativeHandle(ref, () => ({
      startAnimation: () => {
        if (isAnimatingRef.current) return;
        
        isAnimatingRef.current = true;
        lastTimeRef.current = performance.now();
        animationStartRef.current = performance.now();
        turbulenceRef.current = temperature * 0.5;
        zoomRef.current = 0;
        
        animationRef.current = requestAnimationFrame(animate);
      },

      addDelta: (text: string, tokenRate = 1) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const now = performance.now();
        const rect = canvas.getBoundingClientRect();

        // Log incoming text chunk
        if (text.length > 0) {
          console.log(`📝 Delta: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`, {
            length: text.length,
            currentPhase: currentPhaseRef.current,
            particleCount: particlesRef.current.length
          });
        }

        // === TEMPORAL ANALYSIS ===
        // Calculate time since last delta
        const timeSinceLastDelta = lastDeltaTimeRef.current > 0 ? now - lastDeltaTimeRef.current : 0;
        lastDeltaTimeRef.current = now;

        // Track timing history (keep last 20 deltas)
        if (timeSinceLastDelta > 0) {
          deltaTimingsRef.current.push(timeSinceLastDelta);
          if (deltaTimingsRef.current.length > 20) {
            deltaTimingsRef.current.shift();
          }
        }

        // Calculate average timing for rhythm detection
        const avgTiming = deltaTimingsRef.current.length > 0
          ? deltaTimingsRef.current.reduce((a, b) => a + b, 0) / deltaTimingsRef.current.length
          : 100;

        // Detect temporal patterns
        const isPause = timeSinceLastDelta > avgTiming * 2 && timeSinceLastDelta > 200;
        const isBurst = timeSinceLastDelta < avgTiming * 0.5 && timeSinceLastDelta > 0;

        // Track burst counter for sustained bursts
        if (isBurst) {
          burstCounterRef.current++;
        } else {
          burstCounterRef.current = 0;
        }

        // Calculate token velocity (inverse of timing)
        tokenVelocityRef.current = timeSinceLastDelta > 0 ? 1000 / timeSinceLastDelta : 1;
        baseSpeedRef.current = Math.max(0.5, Math.min(3, tokenVelocityRef.current / 10));

        // === PHASE DETECTION ===
        const phaseInfo = detectPhase(text);
        const previousPhase = currentPhaseRef.current;

        // Phase transition detection
        if (phaseInfo.phase !== previousPhase) {
          console.log(`🔄 PHASE TRANSITION: "${previousPhase}" → "${phaseInfo.phase}"`, {
            trigger: phaseInfo.trigger,
            intensity: phaseInfo.intensity,
            textChunk: text.substring(0, 50)
          });

          currentPhaseRef.current = phaseInfo.phase;
          phaseIntensityRef.current = phaseInfo.intensity;
          phaseTransitionTimeRef.current = now;

          // Regenerate flow field for new phase
          flowFieldRef.current = generateFlowField(rect.width, rect.height, phaseInfo.phase);

          // Phase transition burst
          for (let i = 0; i < 15; i++) {
            particlesRef.current.push(createParticle(
              Math.random() * rect.width,
              Math.random() * rect.height,
              phaseInfo.phase,
              phaseInfo.intensity
            ));
          }
        }

        // === TEMPORAL VISUAL EFFECTS ===

        // PAUSE EFFECT: After a long pause, create a "well" of particles
        if (isPause) {
          console.log(`⏸️  PAUSE DETECTED: ${timeSinceLastDelta.toFixed(0)}ms (avg: ${avgTiming.toFixed(0)}ms)`, {
            pauseDuration: timeSinceLastDelta,
            avgDelta: avgTiming,
            ratio: (timeSinceLastDelta / avgTiming).toFixed(1) + 'x'
          });

          const centerX = rect.width / 2 + (Math.random() - 0.5) * rect.width * 0.3;
          const centerY = rect.height / 2 + (Math.random() - 0.5) * rect.height * 0.3;

          for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2;
            const radius = 50 + Math.random() * 30;
            particlesRef.current.push(createParticle(
              centerX + Math.cos(angle) * radius,
              centerY + Math.sin(angle) * radius
            ));
          }
        }

        // BURST EFFECT: Sustained burst creates an explosion
        if (burstCounterRef.current > 5) {
          console.log(`💥 BURST DETECTED: ${burstCounterRef.current} rapid deltas in a row`, {
            tokenVelocity: tokenVelocityRef.current.toFixed(1) + ' tokens/sec',
            avgDelta: avgTiming.toFixed(0) + 'ms',
            currentDelta: timeSinceLastDelta.toFixed(0) + 'ms'
          });

          turbulenceRef.current = temperature * 2;
          for (let i = 0; i < 5; i++) {
            particlesRef.current.push(createParticle(
              Math.random() * rect.width,
              Math.random() * rect.height
            ));
          }
        } else {
          turbulenceRef.current = temperature * 0.3;
        }

        // RHYTHM EFFECT: Detect rhythmic patterns via autocorrelation
        if (deltaTimingsRef.current.length >= 10) {
          const recent = deltaTimingsRef.current.slice(-10);
          const variance = recent.reduce((sum, t) => sum + Math.pow(t - avgTiming, 2), 0) / recent.length;
          const isRhythmic = variance < avgTiming * 0.5; // Low variance = rhythmic

          if (isRhythmic) {
            console.log(`🎵 RHYTHM DETECTED: Low timing variance`, {
              variance: variance.toFixed(1),
              avgTiming: avgTiming.toFixed(0) + 'ms',
              consistency: ((1 - variance / avgTiming) * 100).toFixed(0) + '%'
            });

            // Create wave-like particle patterns
            const waveParticles = 3;
            for (let i = 0; i < waveParticles; i++) {
              particlesRef.current.push(createParticle(
                (i / waveParticles) * rect.width,
                rect.height / 2 + Math.sin((i / waveParticles) * Math.PI * 2) * 50
              ));
            }
          }
        }

        // === CONTENT-BASED EFFECTS ===

        // Punctuation: Creates emphasis bursts
        const punctuationMatch = text.match(/[.?!;:]/g);
        if (punctuationMatch) {
          for (let i = 0; i < punctuationMatch.length * 3; i++) {
            particlesRef.current.push(createParticle());
          }
        }

        // Question marks: Extra spinning particles for questioning
        if (/\?/.test(text)) {
          for (let i = 0; i < 5; i++) {
            particlesRef.current.push(createParticle(
              undefined,
              undefined,
              'questioning',
              1.0
            ));
          }
        }

        // Numbers and capitals: Structured particles
        const numberCapsMatch = text.match(/[0-9A-Z]/g);
        if (numberCapsMatch) {
          for (let i = 0; i < Math.min(numberCapsMatch.length, 4); i++) {
            particlesRef.current.push(createParticle(
              Math.random() * rect.width,
              Math.random() * rect.height
            ));
          }
        }

        // Baseline particle generation
        const particleChance = 0.3 + (phaseIntensityRef.current * 0.3);
        if (Math.random() < particleChance && particlesRef.current.length < 150) {
          particlesRef.current.push(createParticle());
        }
      },

      startFlourish: () => {
        isFlourishingRef.current = true;
        flourishStartRef.current = performance.now();
      },

      stopAnimation: () => {
        isAnimatingRef.current = false;
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      },

      reset: () => {
        particlesRef.current = [];
        isFlourishingRef.current = false;
        baseSpeedRef.current = 1;
        turbulenceRef.current = 0;

        // Reset temporal tracking
        lastDeltaTimeRef.current = 0;
        deltaTimingsRef.current = [];
        tokenVelocityRef.current = 1;
        burstCounterRef.current = 0;

        // Reset phase tracking
        currentPhaseRef.current = 'idle';
        phaseIntensityRef.current = 0;
        phaseTransitionTimeRef.current = 0;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          const rect = canvas.getBoundingClientRect();
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, rect.width, rect.height);
        }
      }
    }), [animate, createParticle, detectPhase, generateFlowField, temperature]);

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{ width: '100%', height: '100%' }}
      />
    );
  }
);

ThoughtCanvas.displayName = 'ThoughtCanvas';

export default ThoughtCanvas;