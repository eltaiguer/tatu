export interface AiConfig {
  apiKey: string
  enabled: boolean
  model: string
}

let _config: AiConfig | null = null

export function setAiConfig(config: AiConfig | null): void {
  _config = config
}

export function getAiConfig(): AiConfig | null {
  return _config
}
