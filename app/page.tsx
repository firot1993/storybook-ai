import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
          ✨ Storybook AI
        </h1>
        
        <p className="text-xl text-gray-600 mb-8 leading-relaxed">
          Transform any photo into a magical cartoon character and create 
          personalized bedtime stories powered by Google's latest AI.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/character" 
            className="btn-primary text-lg"
          >
            Create Your Story →
          </Link>
        </div>
        
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="card">
            <div className="text-3xl mb-3">📸</div>
            <h3 className="font-semibold text-lg mb-2">Upload Photo</h3>
            <p className="text-gray-600">Upload any photo and watch AI transform it into a cute cartoon character.</p>
          </div>
          
          <div className="card">
            <div className="text-3xl mb-3">🎨</div>
            <h3 className="font-semibold text-lg mb-2">AI Magic</h3>
            <p className="text-gray-600">Powered by Gemini 3.1 Flash Image - released just 2 days ago!</p>
          </div>
          
          <div className="card">
            <div className="text-3xl mb-3">📖</div>
            <h3 className="font-semibold text-lg mb-2">Your Story</h3>
            <p className="text-gray-600">Generate unique stories with beautiful illustrations and professional narration.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
