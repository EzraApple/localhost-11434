import { type StructuredSystemPrompt, DEFAULT_SECTIONS } from './types'

export function createEmptyStructuredPrompt(): StructuredSystemPrompt {
  return {
    title: '',
    userInfo: '',
    sections: {
      identityRole: { ...DEFAULT_SECTIONS.identityRole },
      instructions: { ...DEFAULT_SECTIONS.instructions },
      constraints: { ...DEFAULT_SECTIONS.constraints },
      outputFormatting: { ...DEFAULT_SECTIONS.outputFormatting },
      userContext: { ...DEFAULT_SECTIONS.userContext },
    },
  }
}

export function buildFinalPrompt(structured: StructuredSystemPrompt): string {
  const enabledSections = Object.values(structured.sections)
    .filter(section => section.enabled)
    .sort((a, b) => {
      // Ensure consistent order: identity, user-context, instructions, formatting, constraints
      const order = ['identity-role', 'user-context', 'instructions', 'output-formatting', 'constraints']
      return order.indexOf(a.id) - order.indexOf(b.id)
    })

  return enabledSections
    .map(section => {
      const content = section.content.trim()
      if (content.length > 0) {
        // Add section header in uppercase, followed by the content
        return `${section.title.toUpperCase()}:\n${content}`
      }
      return ''
    })
    .filter(content => content.length > 0)
    .join('\n\n')
}

export function updateSectionContent(
  prompt: StructuredSystemPrompt,
  sectionId: string,
  content: string
): StructuredSystemPrompt {
  const updated = { ...prompt }
  Object.keys(updated.sections).forEach(key => {
    if (updated.sections[key as keyof typeof updated.sections].id === sectionId) {
      updated.sections[key as keyof typeof updated.sections].content = content
    }
  })
  return updated
}

export function toggleSection(
  prompt: StructuredSystemPrompt,
  sectionId: string,
  enabled: boolean
): StructuredSystemPrompt {
  const updated = { ...prompt }
  Object.keys(updated.sections).forEach(key => {
    if (updated.sections[key as keyof typeof updated.sections].id === sectionId) {
      updated.sections[key as keyof typeof updated.sections].content =
        enabled && updated.sections[key as keyof typeof updated.sections].content.trim() === ''
          ? DEFAULT_SECTIONS[key as keyof typeof DEFAULT_SECTIONS].content
          : updated.sections[key as keyof typeof updated.sections].content
      updated.sections[key as keyof typeof updated.sections].enabled = enabled
    }
  })
  return updated
}

export function updateUserContextFromUserInfo(
  prompt: StructuredSystemPrompt,
  userInfo: string
): StructuredSystemPrompt {
  const updated = { ...prompt }
  updated.userInfo = userInfo
  updated.sections.userContext.content = userInfo
  return updated
}

export function convertLegacyToStructured(legacy: any): StructuredSystemPrompt {
  return {
    id: legacy.id,
    title: legacy.title,
    userInfo: '',
    sections: {
      identityRole: { ...DEFAULT_SECTIONS.identityRole },
      instructions: { ...DEFAULT_SECTIONS.instructions },
      constraints: { ...DEFAULT_SECTIONS.constraints },
      outputFormatting: { ...DEFAULT_SECTIONS.outputFormatting },
      userContext: { ...DEFAULT_SECTIONS.userContext },
    },
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  }
}


