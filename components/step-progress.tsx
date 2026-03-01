'use client'

const STEPS = [
  { label: 'Upload', emoji: '\u{1F4F7}' },
  { label: 'Name', emoji: '\u{2B50}' },
  { label: 'Details', emoji: '\u{270F}\u{FE0F}' },
  { label: 'Choose', emoji: '\u{1F4D6}' },
  { label: 'Play', emoji: '\u{1F3AC}' },
]

const STEP_COLORS = [
  { bg: 'bg-candy-500', ring: 'ring-candy-200', text: 'text-candy-600', bar: 'bg-candy-400' },
  { bg: 'bg-sun-500', ring: 'ring-sun-200', text: 'text-sun-600', bar: 'bg-sun-400' },
  { bg: 'bg-mint-500', ring: 'ring-mint-200', text: 'text-mint-600', bar: 'bg-mint-400' },
  { bg: 'bg-sky-500', ring: 'ring-sky-200', text: 'text-sky-600', bar: 'bg-sky-400' },
  { bg: 'bg-grape-500', ring: 'ring-grape-200', text: 'text-grape-600', bar: 'bg-grape-400' },
]

interface StepProgressProps {
  currentStep: number // 0-indexed
}

export default function StepProgress({ currentStep }: StepProgressProps) {
  return (
    <div className="w-full max-w-xl mx-auto mb-8">
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const color = STEP_COLORS[index]
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
                    <span className={isCurrent ? 'animate-bounce-in' : ''}>{step.emoji}</span>
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
              {index < STEPS.length - 1 && (
                <div className="flex-1 mx-2 mb-6">
                  <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ease-out rounded-full ${
                        isCompleted ? 'bg-gradient-to-r from-candy-400 via-sun-400 to-mint-400' : ''
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
