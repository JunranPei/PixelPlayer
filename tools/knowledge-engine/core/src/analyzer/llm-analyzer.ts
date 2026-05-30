import { loadEnv } from '../config/env-loader';

export interface ProviderConfig {
  name: string;
  type: 'ollama' | 'openai' | 'gemini';
  baseURL: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface LLMAnalyzerOptions {
  providers?: ProviderConfig[];
  temperature?: number;
}

export class LLMAnalyzer {
  private providers: ProviderConfig[] = [];
  private temperature: number;

  constructor(options?: LLMAnalyzerOptions) {
    // 1. Ensure environment variables are loaded first
    loadEnv();

    this.temperature = options?.temperature ?? 0.1; // Low temperature for high precision descriptions

    if (options?.providers && options.providers.length > 0) {
      this.providers = options.providers;
    } else {
      this.initializeDefaultProviders();
    }
  }

  /**
   * Initializes priority providers list using loaded environment variables or default overrides.
   */
  private initializeDefaultProviders(): void {
    // Local Ollama / LMStudio (Priority 1)
    const localEnabled = process.env.LOCAL_PROVIDER_ENABLED !== 'false'; // Enabled by default
    this.providers.push({
      name: 'Local Ollama/LMStudio',
      type: 'ollama',
      baseURL: process.env.LOCAL_BASE_URL || 'http://localhost:11434/v1',
      apiKey: process.env.LOCAL_API_KEY || 'ollama',
      model: process.env.LOCAL_MODEL || 'gemma4:24b',
      enabled: localEnabled
    });

    // Cloud Gemini API (Priority 2 / Failover)
    const geminiEnabled = process.env.GEMINI_PROVIDER_ENABLED === 'true';
    this.providers.push({
      name: 'Google Gemini Cloud',
      type: 'gemini',
      baseURL: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      enabled: geminiEnabled
    });

    // Cloud OpenAI API (Priority 3 / Failover)
    const openaiEnabled = process.env.OPENAI_PROVIDER_ENABLED === 'true';
    this.providers.push({
      name: 'OpenAI Standard API',
      type: 'openai',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      enabled: openaiEnabled
    });

    // Filter down to only enabled providers
    this.providers = this.providers.filter(p => p.enabled);

    // If no provider is active, add fallback Ollama
    if (this.providers.length === 0) {
      this.providers.push({
        name: 'Local Ollama Fallback',
        type: 'ollama',
        baseURL: 'http://localhost:11434/v1',
        apiKey: 'ollama',
        model: 'gemma4:24b',
        enabled: true
      });
    }
  }

  /**
   * Refined system prompt requiring extremely concise technical descriptions (max 150 chars).
   */
  public getSystemPrompt(): string {
    return [
      'Act as a Senior Software Architect expert in Android multi-modular codebases.',
      'Analyze the provided source code file and generate a very concise technical description.',
      'CRITICAL: The description must be a single sentence and MUST NOT exceed 150 characters.',
      'Focus strictly on its core architectural responsibility (e.g., repository, viewmodel, UI component, database DAO, etc.) in the music player.',
      'DO NOT write introductory phrases (like "This class..."). Start directly with the action/responsibility.',
      'DO NOT return markdown, code blocks, or explanations. Only the raw description.'
    ].join('\n');
  }

  /**
   * Performs atomic file code analysis using the failover multi-provider pipeline.
   * 
   * @param fileName The name/path of the file to analyze.
   * @param codeSnippet Source code content of the file.
   * @returns Generated architectural description.
   */
  public async analyzeCode(fileName: string, codeSnippet: string): Promise<string> {
    const systemPrompt = this.getSystemPrompt();
    let lastError: Error | null = null;

    // Iterate through active providers in priority order
    for (const provider of this.providers) {
      console.log(`📡 [LLM Queue] Trying provider "${provider.name}" for ${fileName}...`);
      
      try {
        let result = '';
        
        if (provider.type === 'gemini' && provider.baseURL.includes('generativelanguage.googleapis.com')) {
          result = await this.queryGeminiNative(provider, systemPrompt, codeSnippet);
        } else {
          result = await this.queryOpenAIViaFetch(provider, systemPrompt, codeSnippet);
        }

        const trimmedResult = result.trim().replace(/^["']|["']$/g, ''); // strip quotes
        
        if (trimmedResult) {
          console.log(`✅ [LLM Success] Description generated successfully using "${provider.name}"`);
          return trimmedResult;
        }
      } catch (error: any) {
        console.warn(`⚠️ [LLM Failover] Provider "${provider.name}" failed: ${error.message || error}`);
        lastError = error;
      }
    }

    // If all providers failed, throw a combined error
    throw new Error(`All configured LLM providers failed to analyze ${fileName}. Last error: ${lastError?.message}`);
  }

  /**
   * Queries standard OpenAI-compatible endpoints via native fetch.
   */
  private async queryOpenAIViaFetch(provider: ProviderConfig, systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${provider.baseURL}/chat/completions`.replace(/([^:]\/)\/+/g, '$1'); // prevent double-slashes
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: this.temperature
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * Queries Gemini Native API via fetch to bypass any OpenAI compatibility differences.
   */
  private async queryGeminiNative(provider: ProviderConfig, systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${provider.baseURL}/models/${provider.model}:generateContent?key=${provider.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nCode to analyze:\n${userPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: this.temperature,
          maxOutputTokens: 60
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini HTTP ${response.status}: ${response.statusText} - ${errText}`);
    }

    const data: any = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Getter for testing/diagnosis of active providers.
   */
  public getActiveProviders(): ProviderConfig[] {
    return [...this.providers];
  }
}
