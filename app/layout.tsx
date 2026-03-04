import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import ToastContainer from '@/components/toast'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-space-grotesk',
})

export const metadata: Metadata = {
  title: '童梦奇缘 - AI 绘本故事',
  description: 'Transform photos into storybook characters and generate personalized AI stories',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${spaceGrotesk.className} font-display`}>
        <div className="min-h-screen bg-forest-50 relative overflow-hidden">

          {/* ── Ambient background blobs ── */}
          <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
            <div className="absolute -top-24 -left-24 w-96 h-96 bg-forest-300/30 rounded-full blur-3xl" />
            <div className="absolute top-1/3 -right-32 w-80 h-80 bg-honey-300/25 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 left-1/4 w-72 h-72 bg-ember-300/20 rounded-full blur-3xl" />
            <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-forest-200/20 rounded-full blur-3xl" />

            {/* Floating leaf/star shapes */}
            <svg className="absolute top-16 left-[12%] w-8 h-8 text-forest-400/50 animate-float" style={{ animationDelay: '0s' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-8 2C13 8 13 12 13 12H8C8 8 13 3 17 8z"/>
            </svg>
            <svg className="absolute top-40 right-[18%] w-6 h-6 text-honey-400/60 animate-float" style={{ animationDelay: '1.2s' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <svg className="absolute top-28 left-[45%] w-5 h-5 text-ember-400/50 animate-float" style={{ animationDelay: '0.7s' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <svg className="absolute bottom-32 left-[8%] w-7 h-7 text-forest-400/40 animate-float" style={{ animationDelay: '1.8s' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2-8 2C13 8 13 12 13 12H8C8 8 13 3 17 8z"/>
            </svg>
            <svg className="absolute bottom-48 right-[12%] w-9 h-9 text-honey-300/50 animate-float" style={{ animationDelay: '0.4s' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>

          {/* ── Sticky nav header ── */}
          <header className="glass-header px-6 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 bg-forest-500 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                <span className="text-white text-lg">📖</span>
              </div>
              <span className="font-bold text-lg text-forest-800 tracking-tight">童梦奇缘</span>
            </Link>

            <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
              <Link href="/character" className="hover:text-forest-600 transition-colors">我的角色</Link>
              <Link href="/storybook" className="hover:text-forest-600 transition-colors">我的故事</Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link href="/character/create"
                className="text-xs font-bold px-3 py-1.5 border-[1.5px] border-forest-500 text-forest-600 rounded-full hover:bg-forest-50 transition-colors">
                + 创建角色
              </Link>
            </div>
          </header>

          <div className="relative z-10">
            {children}
          </div>
        </div>
        <ToastContainer />
      </body>
    </html>
  )
}
