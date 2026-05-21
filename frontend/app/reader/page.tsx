export default function ReaderPage() {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-purple-100 p-8">
  
        <div className="grid grid-cols-4 gap-6">
  
          <div className="bg-black text-white p-6 rounded-3xl">
  
            <h2 className="text-2xl font-bold">
              Chapters
            </h2>
  
            <div className="space-y-4 mt-8">
  
              <p>Introduction</p>
              <p>Machine Learning</p>
              <p>Neural Networks</p>
              <p>Applications</p>
              <p>Future of AI</p>
  
            </div>
  
          </div>
  
          <div className="col-span-2 bg-white rounded-3xl p-8 shadow">
  
            <h1 className="text-3xl font-bold">
              Artificial Intelligence
            </h1>
  
            <p className="mt-6">
              Artificial Intelligence is the simulation of human intelligence
              processes by machines including learning, reasoning,
              and self-correction.
            </p>
  
            <div className="flex gap-3 mt-8 flex-wrap">
  
              <button className="bg-blue-600 text-white px-4 py-2 rounded-xl">
                Highlight
              </button>
  
              <button className="bg-purple-600 text-white px-4 py-2 rounded-xl">
                Notes
              </button>
  
              <button className="bg-green-600 text-white px-4 py-2 rounded-xl">
                Read Aloud
              </button>
  
            </div>
  
            <textarea
              className="w-full border rounded-xl p-4 mt-8"
              rows={5}
              placeholder="Write notes..."
            />
  
          </div>
  
          <div className="bg-white rounded-3xl p-6 shadow">
  
            <h2 className="text-2xl font-bold">
              AI Assistant
            </h2>
  
            <input
              className="w-full border p-3 rounded-xl mt-6"
              placeholder="Ask this book..."
            />
  
            <button className="bg-black text-white w-full rounded-xl p-3 mt-4">
              Ask AI
            </button>
  
            <div className="mt-8 border rounded-xl p-4">
  
              <h3 className="font-bold">
                AI Summary
              </h3>
  
              <p className="mt-3 text-sm">
                AI allows machines to imitate human learning,
                decision making and reasoning.
              </p>
  
            </div>
  
          </div>
  
        </div>
  
      </main>
    )
  }