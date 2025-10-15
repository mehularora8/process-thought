import { ThoughtCanvasRef } from '../components/ThoughtCanvas';

export interface ClaudeThinkingDelta {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'thinking_delta';
    thinking: string;
  };
}

export interface ClaudeSignatureDelta {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'signature_delta';
    signature: string;
  };
}

export interface ThinkingAnalysis {
  complexity: number;
  conceptDensity: number;
  emotionalIntensity: number;
  logicalFlow: number;
  uncertainty: number;
}

export class ClaudeThoughtMapper {
  private canvasRef: ThoughtCanvasRef | null = null;
  private accumulatedThinking: string = '';
  private lastUpdateTime: number = 0;
  private tokenRate: number = 0;

  constructor(canvasRef?: ThoughtCanvasRef) {
    this.canvasRef = canvasRef || null;
  }

  setCanvasRef(canvasRef: ThoughtCanvasRef) {
    this.canvasRef = canvasRef;
  }

  processThinkingDelta(delta: ClaudeThinkingDelta): void {
    if (!this.canvasRef) return;

    const thinkingText = delta.delta.thinking;
    this.accumulatedThinking += thinkingText;
    
    const now = Date.now();
    if (this.lastUpdateTime > 0) {
      const timeDelta = now - this.lastUpdateTime;
      this.tokenRate = thinkingText.length / (timeDelta / 1000);
    }
    this.lastUpdateTime = now;

    const analysis = this.analyzeThinkingText(thinkingText);
    
    this.canvasRef.addDelta(thinkingText, this.calculateVisualizationIntensity(analysis));

    if (analysis.uncertainty > 0.7 || this.detectMajorConcept(thinkingText)) {
      this.canvasRef.startFlourish();
    }
  }

  processSignatureDelta(): void {
    this.canvasRef?.startFlourish();
  }

  private analyzeThinkingText(text: string): ThinkingAnalysis {
    const complexity = this.calculateComplexity(text);
    const conceptDensity = this.calculateConceptDensity(text);
    const emotionalIntensity = this.calculateEmotionalIntensity(text);
    const logicalFlow = this.calculateLogicalFlow(text);
    const uncertainty = this.calculateUncertainty(text);

    return {
      complexity,
      conceptDensity,
      emotionalIntensity,
      logicalFlow,
      uncertainty
    };
  }

  private calculateComplexity(text: string): number {
    const words = text.split(/\s+/).length;
    const avgWordLength = text.replace(/\s/g, '').length / words;
    const sentenceComplexity = (text.match(/[.!?]/g)?.length || 0) / words;
    const technicalTerms = (text.match(/\b(?:algorithm|function|variable|data|structure|analysis|implementation|optimization)\b/gi)?.length || 0);
    
    return Math.min(1, (avgWordLength * 0.1) + (sentenceComplexity * 2) + (technicalTerms * 0.2));
  }

  private calculateConceptDensity(text: string): number {
    const concepts = text.match(/\b(?:concept|idea|principle|theory|approach|method|solution|problem|issue)\b/gi)?.length || 0;
    const words = text.split(/\s+/).length;
    return Math.min(1, concepts / Math.max(words * 0.1, 1));
  }

  private calculateEmotionalIntensity(text: string): number {
    const emotionalWords = text.match(/\b(?:excited|worried|confident|uncertain|surprised|pleased|frustrated|intrigued)\b/gi)?.length || 0;
    const emphasisMarkers = (text.match(/[!]{2,}|[?]{2,}|[.]{3,}/g)?.length || 0);
    const words = text.split(/\s+/).length;
    
    return Math.min(1, (emotionalWords + emphasisMarkers) / Math.max(words * 0.05, 1));
  }

  private calculateLogicalFlow(text: string): number {
    const logicalConnectors = text.match(/\b(?:therefore|however|because|since|thus|consequently|nevertheless|furthermore|moreover)\b/gi)?.length || 0;
    const listMarkers = (text.match(/^\s*[1-9]\.|^\s*[-*+]\s/gm)?.length || 0);
    const words = text.split(/\s+/).length;
    
    return Math.min(1, (logicalConnectors + listMarkers) / Math.max(words * 0.05, 1));
  }

  private calculateUncertainty(text: string): number {
    const uncertaintyMarkers = text.match(/\b(?:maybe|perhaps|possibly|might|could|uncertain|unclear|ambiguous|confused)\b/gi)?.length || 0;
    const questionMarks = (text.match(/\?/g)?.length || 0);
    const hedging = text.match(/\b(?:seems|appears|tends to|sort of|kind of)\b/gi)?.length || 0;
    const words = text.split(/\s+/).length;
    
    return Math.min(1, (uncertaintyMarkers + questionMarks + hedging) / Math.max(words * 0.05, 1));
  }

  private detectMajorConcept(text: string): boolean {
    const majorConceptMarkers = [
      /\b(?:breakthrough|insight|realization|key point|crucial|fundamental)\b/gi,
      /^(?:Ah!|Oh!|Wait,|Actually,|I see!)/,
      /\b(?:Let me reconsider|On second thought|More importantly)\b/gi
    ];
    
    return majorConceptMarkers.some(regex => regex.test(text));
  }

  private calculateVisualizationIntensity(analysis: ThinkingAnalysis): number {
    const weights = {
      complexity: 0.3,
      conceptDensity: 0.25,
      emotionalIntensity: 0.2,
      logicalFlow: 0.15,
      uncertainty: 0.1
    };

    return (
      analysis.complexity * weights.complexity +
      analysis.conceptDensity * weights.conceptDensity +
      analysis.emotionalIntensity * weights.emotionalIntensity +
      analysis.logicalFlow * weights.logicalFlow +
      analysis.uncertainty * weights.uncertainty
    ) * 2 + 0.5; // Scale from 0.5 to 2.5
  }

  reset(): void {
    this.accumulatedThinking = '';
    this.lastUpdateTime = 0;
    this.tokenRate = 0;
    this.canvasRef?.reset();
  }

  getAccumulatedThinking(): string {
    return this.accumulatedThinking;
  }
}

export const createClaudeStreamProcessor = (canvasRef: ThoughtCanvasRef) => {
  const mapper = new ClaudeThoughtMapper(canvasRef);

  return {
    processStreamEvent: (event: Record<string, unknown>) => {
      switch (event.type) {
        case 'content_block_delta':
          if (event.delta?.type === 'thinking_delta') {
            mapper.processThinkingDelta(event as ClaudeThinkingDelta);
          } else if (event.delta?.type === 'signature_delta') {
            mapper.processSignatureDelta(event as ClaudeSignatureDelta);
          }
          break;
        case 'message_start':
          canvasRef.startAnimation();
          break;
        case 'message_stop':
          canvasRef.startFlourish();
          break;
        default:
          break;
      }
    },
    reset: () => mapper.reset(),
    getAccumulatedThinking: () => mapper.getAccumulatedThinking(),
    mapper
  };
};