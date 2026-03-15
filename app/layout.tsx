import type { Metadata } from 'next'
import { Space_Grotesk, Baloo_2 } from 'next/font/google'
import './globals.css'
import ToastContainer from '@/components/toast'
import NavBar from '@/components/nav-bar'
import { LanguageProvider } from '@/lib/i18n'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-space-grotesk',
})

const baloo2 = Baloo_2({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-baloo2',
})

export const metadata: Metadata = {
  title: 'Storybook AI',
  description: 'Transform photos into storybook characters and generate personalized AI stories',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.className} ${baloo2.variable} font-body`}>
        <LanguageProvider>
          <div className="min-h-screen bg-gray-50 relative">

            {/* ── Sticky nav header ── */}
            <NavBar />

            <div className="relative z-10">
              {children}
            </div>
          </div>
          <ToastContainer />
        </LanguageProvider>
      </body>
    </html>
  )
}
