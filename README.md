# Process Thought

An experimental art project that sonifies Claude's extended thinking in real-time using multi-layered audio synthesis.

## What is this?

**Process Thought** makes machine cognition audible. By detecting linguistic patterns in Claude's reasoning process, it triggers 5 simultaneous sound layers that blend together to create rich, evolving soundscapes. Each pattern—uncertainty, revision, causation, emphasis—activates specific audio layers, letting you *hear* the structure of thought as it unfolds.

This is an **art/exploration project**, not a utility tool. The goal is to make invisible cognitive processes tangible and experiential.

## Features

- **11 Linguistic Pattern Detection**: Uncertainty, certainty, revision, questions, enumeration, emphasis, negation, causation, hedging, comparison, resolution
- **5-Layer Audio Architecture**:
  - **BASS** (40-150Hz) - Foundation for logical structure
  - **MID** (150-2000Hz) - Main melodic content
  - **HIGH** (2000-8000Hz) - Shimmer and detail
  - **PAD** (sustained chords) - Atmospheric background
  - **TEXTURE** (filtered noise) - Organic tension
- **Real-Time Highlighting**: See detected patterns color-coded in the thinking text
- **Preset Modes**: Minimal (3 patterns), Standard (11 patterns), Maximum (full highlighting)
- **Example Queries**: Curated prompts that create interesting sonic textures

## Setup

### Prerequisites
- Node.js 18+
- An Anthropic API key ([get one here](https://console.anthropic.com/))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/process-thought.git
cd process-thought
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory:
```bash
ANTHROPIC_API_KEY=your_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Enter a prompt** - Or choose an example query from the gallery
2. **Select preset mode** - Minimal, Standard, or Maximum pattern detection
3. **Click Execute** - Listen as Claude thinks, watch patterns highlight in real-time
4. **Explore** - Toggle the legend, adjust temperature, try different queries

### Recommended Queries

- **Mathematical proof** - Lots of logical reasoning and enumeration
- **Philosophical dilemma** - Uncertainty, revision, hedging
- **Creative writing** - Narrative structure with enumeration
- **Complex explanations** - Causation, comparison, emphasis

## How It Works

1. **Extended Thinking API**: Claude generates reasoning tokens before the final answer
2. **Pattern Detection**: Each text chunk is analyzed via regex for 11 linguistic patterns
3. **Audio Mapping**: Detected patterns trigger specific layers in the audio synthesis
4. **Layer Blending**: Multiple patterns can trigger simultaneously, creating rich polyphonic textures
5. **Visual Feedback**: Text is highlighted in real-time showing which patterns were detected

## Technical Stack

- **Next.js 15** - React framework
- **Tone.js** - Web Audio synthesis
- **Anthropic Claude API** - Extended thinking mode
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling

## Artistic Statement

This project explores the intersection of machine cognition and sound. By translating linguistic patterns into layered audio, it creates an experiential understanding of LLM reasoning that goes beyond reading text. The goal is not comprehension-enhancement but rather to make the invisible process of machine thought *feelable*—to create an aesthetic experience of cognition itself.

## Limitations

- **Chrome/Edge recommended** - Best Web Audio support
- **No mobile support** - Desktop experience only
- **No session recording** - Audio is ephemeral
- **Pattern detection is heuristic** - Based on regex, not semantic analysis
- **Can be noisy** - Maximum mode with complex queries creates dense audio

## Credits

Built with Claude Code, using Tone.js for synthesis and the Anthropic Claude API with extended thinking.

## License

MIT
