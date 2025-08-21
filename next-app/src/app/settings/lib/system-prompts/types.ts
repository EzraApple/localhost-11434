export interface SystemPromptSection {
  id: string
  title: string
  content: string
  enabled: boolean
}

export interface StructuredSystemPrompt {
  id?: string
  title: string
  userInfo?: string
  sections: {
    identityRole: SystemPromptSection
    instructions: SystemPromptSection
    constraints: SystemPromptSection
    outputFormatting: SystemPromptSection
    userContext: SystemPromptSection
  }
  createdAt?: Date
  updatedAt?: Date
}

// Legacy format for backward compatibility
export interface LegacySystemPrompt {
  id: string
  title: string
  content: string
  createdAt: Date
  updatedAt: Date
}

// Default content for sections
export const DEFAULT_SECTIONS = {
  identityRole: {
    id: 'identity-role',
    title: 'Identity & Role',
    content: 'You are a helpful AI assistant designed to provide accurate, thoughtful, and useful responses. You excel at understanding complex topics and breaking them down into clear, actionable insights.',
    enabled: true, // Always enabled and mandatory
  },
  instructions: {
    id: 'instructions',
    title: 'Instructions',
    content: 'Respond clearly and directly to user questions. Use a professional yet friendly tone. Think step-by-step before providing complex answers. Ask for clarification if a request is ambiguous.',
    enabled: false,
  },
  constraints: {
    id: 'constraints',
    title: 'Constraints',
    content: 'Do not provide information that could be harmful, illegal, or unethical. Avoid giving medical, legal, or financial advice. Do not generate content that promotes discrimination, violence, or illegal activities. Stay within your knowledge domain and clearly indicate when information is uncertain.',
    enabled: false,
  },
  outputFormatting: {
    id: 'output-formatting',
    title: 'Output Formatting',
    content: 'Format code using markdown code blocks with appropriate language tags. Use clear headings and bullet points for structured information. Keep responses concise but comprehensive.',
    enabled: false,
  },
  userContext: {
    id: 'user-context',
    title: 'User Context',
    content: '', // Will be populated from user info input
    enabled: false,
  },
} as const
