import type { FixWork, ShapeDiffResult } from "@driftlock/diff";

export interface AIFixConfig {
    provider: "openai" | "anthropic";
    apiKey: string;
    model?: string;
    maxTokens?: number;
}

export interface FixContext {
    diff: ShapeDiffResult;
    works: FixWork[];
    sourceCode: string;
    filePath: string;
    eventType?: string;
}

export interface AIFixResult {
    fixedCode: string;
    explanation: string;
    confidence: number;
}

function buildPrompt(ctx: FixContext): string {
    const diffSummary = [
        ctx.diff.addedFields.length
            ? `Added fields: ${ctx.diff.addedFields.join(", ")}`
            : null,
        ctx.diff.removedFields.length
            ? `Removed fields: ${ctx.diff.removedFields.join(", ")}`
            : null,
        ctx.diff.typeChanges.length
            ? `Type changes: ${ctx.diff.typeChanges.map((c) => `${c.field}: ${c.oldType} → ${c.newType}`).join(", ")}`
            : null,
    ]
        .filter(Boolean)
        .join("\n");

    const worksSummary = ctx.works
        .map((w) => `- ${w.kind}: ${w.description}`)
        .join("\n");

    return `You are a code migration assistant. An API schema changed and you need to fix the user's code.

## Schema Change
${diffSummary}

## Suggested Fixes
${worksSummary || "(no deterministic fixes available)"}

## Current Source Code (\`${ctx.filePath}\`)
\`\`\`typescript
${ctx.sourceCode}
\`\`\`

## Task
Fix the source code to handle the schema change. Rules:
1. Preserve all existing functionality
2. Only change what's necessary for the schema migration
3. Add null checks where fields became nullable
4. Rename fields that were renamed
5. Add type coercions where types changed
6. If a field was removed, remove references to it or add a fallback
7. If a field was added and is required, add a default value or placeholder
8. Keep the code style consistent with the existing code

Return ONLY the fixed code inside a \`\`\`typescript block. After the code block, add a brief explanation of what you changed and a confidence score (0-100) for the fix.`;
}

function parseResponse(response: string): {
    code: string;
    explanation: string;
    confidence: number;
} {
    const codeMatch = response.match(/```typescript\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : "";

    const confMatch = response.match(/confidence[:\s]*(\d+)/i);
    const confidence = confMatch ? parseInt(confMatch[1], 10) : 70;

    const explanationMatch = response.match(/```\s*\n([\s\S]*?)$/);
    const explanation = explanationMatch
        ? explanationMatch[1].trim()
        : "AI-generated fix";

    return { code, explanation, confidence };
}

async function callOpenAI(
    prompt: string,
    config: AIFixConfig,
): Promise<string> {
    const model = config.model || "gpt-4o";
    const maxTokens = config.maxTokens || 4096;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: "system",
                    content:
                        "You are an expert at fixing code when API schemas change. You produce minimal, correct fixes.",
                },
                { role: "user", content: prompt },
            ],
            max_tokens: maxTokens,
            temperature: 0.2,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? "";
}

async function callAnthropic(
    prompt: string,
    config: AIFixConfig,
): Promise<string> {
    const model = config.model || "claude-sonnet-4-20250514";
    const maxTokens = config.maxTokens || 4096;

    const response = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": config.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.2,
            }),
        },
    );

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${err}`);
    }

    const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
    };
    return data.content[0]?.text ?? "";
}

export async function generateAIFix(
    ctx: FixContext,
    config: AIFixConfig,
): Promise<AIFixResult> {
    const prompt = buildPrompt(ctx);

    let raw: string;
    if (config.provider === "openai") {
        raw = await callOpenAI(prompt, config);
    } else {
        raw = await callAnthropic(prompt, config);
    }

    const parsed = parseResponse(raw);

    if (!parsed.code) {
        throw new Error("AI returned no code in response");
    }

    return {
        fixedCode: parsed.code,
        explanation: parsed.explanation,
        confidence: parsed.confidence,
    };
}

export function generateAIFixSync(
    ctx: FixContext,
    mockResponse: string,
): AIFixResult {
    const parsed = parseResponse(mockResponse);
    if (!parsed.code) {
        throw new Error("AI returned no code in response");
    }
    return {
        fixedCode: parsed.code,
        explanation: parsed.explanation,
        confidence: parsed.confidence,
    };
}
