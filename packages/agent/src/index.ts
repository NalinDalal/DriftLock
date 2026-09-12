import OpenAI from 'openai';
import { DiffSummary, Fix, DriftEvent } from '@driftlock/core';

export interface ChangeAnalysis {
  summary: string;
  impact: 'breaking' | 'non-breaking' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  affectedCallSites: string[];
  reasoning: string;
}

export interface FixGeneration {
  fix: Fix;
  explanation: string;
  alternatives: Array<{
    description: string;
    diff: string;
    tradeoffs: string;
  }>;
}

export class Agent {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async analyzeChange(
    oldSnapshot: Record<string, unknown>,
    newSnapshot: Record<string, unknown>,
    diff: DiffSummary
  ): Promise<ChangeAnalysis> {
    const prompt = this.buildAnalysisPrompt(oldSnapshot, newSnapshot, diff);
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are an API drift analysis expert. Analyze changes between API snapshots and determine:
1. What changed (summary)
2. Impact level (breaking/non-breaking/unknown)
3. Confidence level (high/medium/low)
4. Which call sites are affected
5. Your reasoning

Be precise and technical. Focus on backward compatibility.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    return this.parseAnalysisResponse(content);
  }

  async generateFix(
    driftEvent: DriftEvent,
    callSiteContext: string
  ): Promise<FixGeneration> {
    const prompt = this.buildFixPrompt(driftEvent, callSiteContext);
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a code fix generator. Generate precise, minimal fixes for API drift issues.

Rules:
1. Generate the smallest possible change
2. Maintain backward compatibility when possible
3. Provide clear explanations
4. Include alternative approaches if applicable
5. Consider edge cases and error handling

Output format:
- Primary fix with diff
- Explanation of the fix
- Alternative approaches with tradeoffs`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content || '';
    return this.parseFixResponse(content, driftEvent.id);
  }

  private buildAnalysisPrompt(
    oldSnapshot: Record<string, unknown>,
    newSnapshot: Record<string, unknown>,
    diff: DiffSummary
  ): string {
    return `
## Old API Snapshot
\`\`\`json
${JSON.stringify(oldSnapshot, null, 2)}
\`\`\`

## New API Snapshot
\`\`\`json
${JSON.stringify(newSnapshot, null, 2)}
\`\`\`

## Detected Changes
- Added fields: ${diff.addedFields.join(', ') || 'none'}
- Removed fields: ${diff.removedFields.join(', ') || 'none'}
- Type changes: ${diff.typeChanges.map(c => `${c.field}: ${c.oldType} → ${c.newType}`).join(', ') || 'none'}
- Optionality changes: ${diff.optionalityChanges.map(c => `${c.field}: ${c.wasRequired ? 'required' : 'optional'} → ${c.nowRequired ? 'required' : 'optional'}`).join(', ') || 'none'}

## Breaking Changes
${diff.breakingChanges.join('\n') || 'none'}

## Non-Breaking Changes
${diff.nonBreakingChanges.join('\n') || 'none'}

Please analyze this API drift and provide your assessment.
`;
  }

  private buildFixPrompt(driftEvent: DriftEvent, callSiteContext: string): string {
    return `
## Drift Event
ID: ${driftEvent.id}
Detected: ${driftEvent.detectedAt}
Confidence: ${driftEvent.confidence}

## Diff Summary
${JSON.stringify(driftEvent.diffSummary, null, 2)}

## Call Site Context
\`\`\`typescript
${callSiteContext}
\`\`\`

## Current Status
${driftEvent.status}

Please generate a fix for this API drift issue.
`;
  }

  private parseAnalysisResponse(content: string): ChangeAnalysis {
    // Parse the AI response into structured data
    // This is a simplified parser - in production, you'd want more robust parsing
    const lines = content.split('\n');
    
    let summary = '';
    let impact: 'breaking' | 'non-breaking' | 'unknown' = 'unknown';
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    let affectedCallSites: string[] = [];
    let reasoning = '';

    for (const line of lines) {
      if (line.toLowerCase().includes('summary:')) {
        summary = line.split(':')[1]?.trim() || '';
      } else if (line.toLowerCase().includes('impact:')) {
        const impactStr = line.split(':')[1]?.trim().toLowerCase() || '';
        if (impactStr.includes('breaking')) impact = 'breaking';
        else if (impactStr.includes('non-breaking')) impact = 'non-breaking';
        else impact = 'unknown';
      } else if (line.toLowerCase().includes('confidence:')) {
        const confStr = line.split(':')[1]?.trim().toLowerCase() || '';
        if (confStr.includes('high')) confidence = 'high';
        else if (confStr.includes('low')) confidence = 'low';
        else confidence = 'medium';
      } else if (line.toLowerCase().includes('affected:')) {
        const sitesStr = line.split(':')[1]?.trim() || '';
        affectedCallSites = sitesStr.split(',').map(s => s.trim()).filter(Boolean);
      } else if (line.toLowerCase().includes('reasoning:')) {
        reasoning = line.split(':')[1]?.trim() || '';
      }
    }

    return {
      summary: summary || 'API change detected',
      impact,
      confidence,
      affectedCallSites,
      reasoning: reasoning || 'Analysis based on API snapshot comparison',
    };
  }

  private parseFixResponse(content: string, driftEventId: string): FixGeneration {
    // Parse the AI response into structured fix data
    // This is a simplified parser - in production, you'd want more robust parsing
    const lines = content.split('\n');
    
    let description = '';
    let diff = '';
    let explanation = '';
    const alternatives: Array<{
      description: string;
      diff: string;
      tradeoffs: string;
    }> = [];

    let currentSection = '';
    let currentAlternative: {
      description: string;
      diff: string;
      tradeoffs: string;
    } = { description: '', diff: '', tradeoffs: '' };

    for (const line of lines) {
      if (line.toLowerCase().includes('description:')) {
        description = line.split(':')[1]?.trim() || '';
        currentSection = 'description';
      } else if (line.toLowerCase().includes('diff:')) {
        diff = line.split(':')[1]?.trim() || '';
        currentSection = 'diff';
      } else if (line.toLowerCase().includes('explanation:')) {
        explanation = line.split(':')[1]?.trim() || '';
        currentSection = 'explanation';
      } else if (line.toLowerCase().includes('alternative:')) {
        if (currentAlternative.description) {
          alternatives.push({ ...currentAlternative });
        }
        currentAlternative = {
          description: line.split(':')[1]?.trim() || '',
          diff: '',
          tradeoffs: '',
        };
        currentSection = 'alternative';
      } else if (line.toLowerCase().includes('tradeoffs:') && currentSection === 'alternative') {
        currentAlternative.tradeoffs = line.split(':')[1]?.trim() || '';
      } else if (currentSection === 'diff' && line.startsWith('```')) {
        // Skip code block markers
      } else if (currentSection === 'diff' && diff) {
        diff += '\n' + line;
      }
    }

    if (currentAlternative.description) {
      alternatives.push(currentAlternative);
    }

    const fix: Fix = {
      id: `fix_${driftEventId}`,
      driftEventId,
      type: 'custom',
      description: description || 'Apply suggested fix',
      diff: diff || '',
      confidence: 'medium',
      files: [],
      generatedAt: new Date(),
    };

    return {
      fix,
      explanation: explanation || 'Fix generated based on API drift analysis',
      alternatives,
    };
  }
}
