import type { Metadata } from 'next'
import { Baloo_2 } from 'next/font/google'
import './globals.css'
import ToastContainer from '@/components/toast'

const baloo = Baloo_2({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })

export const metadata: Metadata = {
  title: 'Storybook AI - Create Magical Stories',
  description: 'Transform photos into cartoon characters and generate personalized stories with AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={baloo.className}>
        <main className="min-h-screen bg-gradient-to-br from-sun-50 via-candy-50 to-grape-50 relative overflow-hidden">
          {/* Floating decorative elements */}
          <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
            <svg className="absolute top-10 left-[10%] w-12 h-12 text-sun-300 animate-float opacity-60" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <svg className="absolute top-32 right-[15%] w-8 h-8 text-candy-300 animate-float opacity-50" style={{ animationDelay: '1s' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <svg className="absolute bottom-20 left-[20%] w-10 h-10 text-grape-300 animate-float opacity-40" style={{ animationDelay: '2s' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {/* Cloud */}
            <svg className="absolute top-20 right-[30%] w-24 h-16 text-sky-200 animate-float opacity-50" style={{ animationDelay: '0.5s' }} viewBox="0 0 64 40" fill="currentColor">
              <ellipse cx="32" cy="28" rx="28" ry="12"/>
              <ellipse cx="20" cy="20" rx="14" ry="14"/>
              <ellipse cx="38" cy="16" rx="16" ry="16"/>
              <ellipse cx="48" cy="24" rx="10" ry="10"/>
            </svg>
            <svg className="absolute bottom-32 right-[10%] w-16 h-10 text-sky-200 animate-float opacity-40" style={{ animationDelay: '1.5s' }} viewBox="0 0 64 40" fill="currentColor">
              <ellipse cx="32" cy="28" rx="28" ry="12"/>
              <ellipse cx="20" cy="20" rx="14" ry="14"/>
              <ellipse cx="38" cy="16" rx="16" ry="16"/>
              <ellipse cx="48" cy="24" rx="10" ry="10"/>
            </svg>
          </div>
          <div className="relative z-10">
            {children}
          </div>
        </main>
        <ToastContainer />
      </body>
    </html>
  )
}
