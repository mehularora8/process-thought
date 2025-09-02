import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const { prompt, temperature, model = 'gpt-4' } = await request.json();

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
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

      // Simulate thinking process with deltas
      let tokenCount = 0;
      const startTime = Date.now();
      
      const thinkingTexts = [
        "Let me analyze this problem step by step.",
        "First, I need to understand the core requirements.",
        "Breaking this down into smaller components:",
        "1. Understanding the user's intent",
        "2. Considering different approaches", 
        "3. Evaluating trade-offs and constraints",
        "Now I'm weighing the pros and cons of each approach.",
        "The most effective solution would be to...",
        "Actually, let me reconsider this from another angle.",
        "After careful thought, I believe the optimal approach is:"
      ];

      let textIndex = 0;
      let charIndex = 0;
      
      const sendDelta = () => {
        if (textIndex >= thinkingTexts.length) {
          // Send end event
          const endTime = Date.now();
          const endEvent = {
            type: 'end',
            data: {
              tokens_out: tokenCount,
              ms: endTime - startTime
            }
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(endEvent)}\n\n`));

          // Send answer after a short delay
          setTimeout(() => {
            const answerEvent = {
              type: 'answer',
              data: {
                answer: `Based on my analysis of "${prompt}", here's my comprehensive response:\n\nThis is a thoughtful answer that takes into account the temperature setting of ${temperature} and the complexity of your question. The visualization you saw represents the actual thinking process, with each particle movement corresponding to the flow of ideas and reasoning.\n\nKey points:\n- The problem was approached systematically\n- Multiple perspectives were considered\n- The solution balances efficiency and effectiveness\n- Temperature (${temperature}) influenced the creative exploration of ideas\n\nThis demonstrates how AI reasoning can be visualized as a dynamic, flowing process rather than a black box.`
              }
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(answerEvent)}\n\n`));
            controller.close();
          }, 500);
          return;
        }

        const currentText = thinkingTexts[textIndex];
        if (charIndex >= currentText.length) {
          textIndex++;
          charIndex = 0;
          setTimeout(sendDelta, 200 + Math.random() * 300); // Pause between sentences
          return;
        }

        const chunkSize = Math.floor(Math.random() * 8) + 3; // 3-10 chars
        const chunk = currentText.slice(charIndex, charIndex + chunkSize);
        charIndex += chunkSize;
        tokenCount += Math.ceil(chunk.length / 4); // Rough token estimate

        const deltaEvent = {
          type: 'delta',
          data: {
            text_chunk: chunk,
            t_rel_ms: Date.now() - startTime
          }
        };

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(deltaEvent)}\n\n`));

        // Variable delay based on content and temperature
        const baseDelay = 50;
        const temperatureDelay = temperature * 50; // Higher temp = more pauses
        const punctuationDelay = /[.!?]/.test(chunk) ? 200 : 0;
        
        setTimeout(sendDelta, baseDelay + temperatureDelay + punctuationDelay + Math.random() * 50);
      };

      // Start sending deltas after a brief delay
      setTimeout(sendDelta, 200);
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