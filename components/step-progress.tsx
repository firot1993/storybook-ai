'use client'

import { useLanguage } from '@/lib/i18n'

const CHARACTER_COLORS = [
  { bg: 'bg-forest-500', ring: 'ring-forest-200', text: 'text-forest-600', bar: 'bg-forest-400' },
  { bg: 'bg-ember-500', ring: 'ring-ember-200', text: 'text-ember-600', bar: 'bg-ember-400' },
]

const STORY_COLORS = [
  { bg: 'bg-forest-500', ring: 'ring-forest-200', text: 'text-forest-600', bar: 'bg-forest-400' },
  { bg: 'bg-ember-500', ring: 'ring-ember-200', text: 'text-ember-600', bar: 'bg-ember-400' },
  { bg: 'bg-honey-500', ring: 'ring-honey-200', text: 'text-honey-600', bar: 'bg-honey-400' },
]

interface StepProgressProps {
  currentStep: number // 0-indexed
  type?: 'character' | 'story'
}

export default function StepProgress({ currentStep, type = 'character' }: StepProgressProps) {
  const { t } = useLanguage()

  const CHARACTER_STEPS = [
    { label: t('stepProgress.character.photo'), emoji: '\u{1F4F8}' },
    { label: t('stepProgress.character.name'), emoji: '\u{2B50}' },
  ]

  const STORY_STEPS = [
    { label: t('stepProgress.story.friends'), emoji: '\u{1F192}' },
    { label: t('stepProgress.story.ideas'), emoji: '\u{1F4D6}' },
    { label: t('stepProgress.story.read'), emoji: '\u{1F3AC}' },
  ]

  const steps = type === 'character' ? CHARACTER_STEPS : STORY_STEPS
  const colors = type === 'character' ? CHARACTER_COLORS : STORY_COLORS

  return (
    <div className="w-full max-w-xl mx-auto mb-8 px-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const color = colors[index]
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep

          return (
            <div key={step.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-all duration-300 ${
                    isCompleted
                      ? `${color.bg} text-white`
                      : isCurrent
                      ? `${color.bg} text-white ring-4 ${color.ring} scale-125`
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className={isCurrent ? 'animate-fade-in' : ''}>{step.emoji}</span>
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-bold transition-colors duration-300 ${
                    isCompleted || isCurrent ? color.text : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className="flex-1 mx-2 mb-6">
                  <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ease-out rounded-full ${
                        isCompleted ? color.bar : ''
                      }`}
                      style={{ width: isCompleted ? '100%' : '0%' }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
