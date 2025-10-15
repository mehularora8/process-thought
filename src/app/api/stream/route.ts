import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  const { prompt, temperature = 1.0, model = 'claude-sonnet-4-5' } = await request.json();

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_api_key_here') {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured. Please add your API key to .env.local' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Send start event
        const startEvent = {
          type: 'start',
          data: {
            run_id: `run_${Date.now()}`,
            model,
            temperature
          }
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(startEvent)}\n\n`));

        const startTime = Date.now();
        let tokenCount = 0;
        let fullThinking = '';
        let fullAnswer = '';

        // Create streaming request with extended thinking
        const stream = await client.messages.stream({
          model,
          max_tokens: 15000,
          temperature,
          thinking: {
            type: 'enabled',
            budget_tokens: 10000
          },
          messages: [{
            role: 'user',
            content: prompt
          }]
        });

        // Process the stream
        for await (const chunk of stream) {
          // Handle thinking content
          if (chunk.type === 'content_block_start' && chunk.content_block.type === 'thinking') {
            // Thinking block started
          }

          if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'thinking_delta') {
              // Thinking text chunk
              const textChunk = chunk.delta.thinking;
              fullThinking += textChunk;
              tokenCount++;

              const deltaEvent = {
                type: 'delta',
                data: {
                  text_chunk: textChunk,
                  t_rel_ms: Date.now() - startTime,
                }
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(deltaEvent)}\n\n`));
            } else if (chunk.delta.type === 'text_delta') {
              // Answer text chunk
              const textChunk = chunk.delta.text;
              fullAnswer += textChunk;
            }
          }

          // Check if stream is done
          if (chunk.type === 'message_stop') {
            const endTime = Date.now();
            const endEvent = {
              type: 'end',
              data: {
                tokens_out: tokenCount,
                ms: endTime - startTime
              }
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(endEvent)}\n\n`));

            // Send the final answer
            const answerEvent = {
              type: 'answer',
              data: {
                answer: fullAnswer || 'No response generated.'
              }
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(answerEvent)}\n\n`));
          }
        }

        controller.close();
      } catch (error) {
        console.error('Stream error:', error);
        const errorEvent = {
          type: 'error',
          data: {
            error: error instanceof Error ? error.message : 'Unknown error occurred'
          }
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}