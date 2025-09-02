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
}

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
    
    const prefersReducedMotion = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const generateFlowField = useCallback((width: number, height: number) => {
      const resolution = 20;
      const cols = Math.ceil(width / resolution);
      const rows = Math.ceil(height / resolution);
      
      const field: { angle: number; strength: number }[][] = [];
      
      for (let y = 0; y < rows; y++) {
        field[y] = [];
        for (let x = 0; x < cols; x++) {
          const angle = (Math.sin(x * 0.1) * Math.cos(y * 0.1)) * Math.PI * 2;
          const strength = 0.5 + (Math.sin(x * 0.05) * Math.cos(y * 0.05)) * 0.5;
          field[y][x] = { angle, strength };
        }
      }
      
      return { width, height, resolution, field };
    }, []);

    const createParticle = useCallback((x?: number, y?: number): Particle => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 100, opacity: 0 };
      }
      
      return {
        x: x ?? Math.random() * canvas.width,
        y: y ?? Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 0,
        maxLife: 60 + Math.random() * 120,
        opacity: 0.8 + Math.random() * 0.2
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
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';

      const trailLength = 5;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(
        particle.x - particle.vx * trailLength,
        particle.y - particle.vy * trailLength
      );
      ctx.stroke();

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
      
      // Clear canvas
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
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

      flowFieldRef.current = generateFlowField(canvas.width / dpr, canvas.height / dpr);
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

        baseSpeedRef.current = Math.max(0.5, Math.min(3, tokenRate));

        const punctuationMatch = text.match(/[.?!;:]/g);
        if (punctuationMatch) {
          for (let i = 0; i < punctuationMatch.length * 2; i++) {
            particlesRef.current.push(createParticle());
          }
        }

        const numberCapsMatch = text.match(/[0-9A-Z]/g);
        if (numberCapsMatch) {
          const rect = canvas.getBoundingClientRect();
          for (let i = 0; i < Math.min(numberCapsMatch.length, 3); i++) {
            particlesRef.current.push(createParticle(
              Math.random() * rect.width,
              Math.random() * rect.height
            ));
          }
        }

        if (Math.random() < 0.3 && particlesRef.current.length < 100) {
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
        
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          const rect = canvas.getBoundingClientRect();
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, rect.width, rect.height);
        }
      }
    }), [animate, createParticle, temperature]);

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