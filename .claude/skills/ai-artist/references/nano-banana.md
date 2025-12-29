# Nano Banana (Gemini Image)

## Models

| Model ID | Type | Best For |
|----------|------|----------|
| `gemini-2.5-flash-image` | Flash | Speed, high-volume |
| `gemini-3-pro-image-preview` | Pro | Text rendering, complex prompts |

## Core Principle

**Narrative paragraphs > keyword lists** (32K context). Write like briefing a photographer.

## Parameters

```python
responseModalities=['TEXT', 'IMAGE']
aspect_ratio="16:9"  # 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
image_size="2K"      # 1K, 2K, 4K - MUST be uppercase K
```

## Prompt Templates

**Photorealistic**: `A [subject] in [location], [lens] lens. [Lighting] creates [mood]. [Details]. [Camera angle]. Professional photography, natural lighting.`

**Illustration**: `[Art style] illustration of [subject]. [Color palette]. [Line style]. [Background]. [Mood].`

**Text in Image**: `Image with text "[EXACT]" in [font]. Font: [style]. Color: [hex/#FF5733]. Position: [top/center/bottom]. Background: [desc]. Context: [poster/sign].`

**Product**: `[Product] on [surface]. Materials: [finish]. Lighting: [setup]. Camera: [angle]. Background: [type]. Style: [commercial/lifestyle].`

## Techniques

| Technique | Example |
|-----------|---------|
| Emphasis | `ALL CAPS` for critical requirements |
| Precision colors | `#9F2B68` instead of "dark magenta" |
| Negative constraints | `NEVER include text/watermarks. DO NOT add labels.` |
| Realism trigger | `Natural lighting, DOF. Captured with Canon EOS 90D DSLR.` |
| Structured edits | `Make ALL edits: - [1] - [2] - [3]` |
| Complex logic | `Kittens MUST have heterochromatic eyes matching fur colors` |

## Advanced Features

**Multi-Image Input** (up to 14): 6 object + 5 human refs. Tip: collage refs into single image.

**Search Grounding**: `tools=[{"google_search": {}}]` — real-time data (weather, charts, events).

**Thinking Mode** (Pro only): `part.thought` in response for complex reasoning.

## Workflow

1. Narrative description → 2. Photography terms → 3. ALL CAPS emphasis → 4. Multi-turn refine → 5. Negative constraints → 6. Set ratio/resolution

## Avoid

- Keyword spam ("4k, trending, masterpiece")
- Vague text ("add some text" → specify exact text, font, position)
- Lowercase resolution ("4k" rejected, use "4K")
